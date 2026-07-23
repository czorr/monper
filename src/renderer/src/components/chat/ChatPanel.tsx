import { useRef, useState, type JSX } from 'react'
import { ThinkingOrb } from 'thinking-orbs'
import IconSparkles from '~icons/tabler/sparkles'
import IconX from '~icons/tabler/x'
import IconArrowUp from '~icons/tabler/arrow-up'
import { IconButton } from '@renderer/components/ui'

interface Props {
  open: boolean
  onClose: () => void
}

type OrbState = 'working' | 'searching' | 'solving' | 'listening' | 'composing' | 'shaping'
interface Step { state: OrbState; label: string }
type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; steps: Step[]; answer?: string; done: boolean }

// Guion mock: pasos que se van logeando hasta la respuesta.
const SCRIPT: { step: Step; delay: number }[] = [
  { step: { state: 'working', label: 'Analizando tu petición' }, delay: 700 },
  { step: { state: 'searching', label: 'Buscando en la web' }, delay: 1000 },
  { step: { state: 'searching', label: 'Abriendo los primeros resultados' }, delay: 900 },
  { step: { state: 'listening', label: 'Leyendo el contenido de las páginas' }, delay: 1100 },
  { step: { state: 'solving', label: 'Extrayendo la información clave' }, delay: 900 },
  { step: { state: 'composing', label: 'Redactando la respuesta' }, delay: 800 }
]
const MOCK_ANSWER =
  'Listo. Esto es una respuesta simulada — el agente aún no está conectado a un proveedor de IA (Fase 2). ' +
  'Cuando lo conectemos, cada uno de estos pasos será una acción real (navegar, extraer, razonar) y la respuesta vendrá del modelo.'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export default function ChatPanel({ open, onClose }: Props): JSX.Element {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToEnd = (): void => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }))
  }
  const updateAssistant = (fn: (t: Extract<Turn, { role: 'assistant' }>) => Turn): void => {
    setTurns((ts) => {
      const c = [...ts]
      const last = c[c.length - 1]
      if (last?.role === 'assistant') c[c.length - 1] = fn(last)
      return c
    })
    scrollToEnd()
  }

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text || running) return
    setInput('')
    setRunning(true)
    setTurns((ts) => [...ts, { role: 'user', text }, { role: 'assistant', steps: [], done: false }])
    scrollToEnd()

    for (const { step, delay } of SCRIPT) {
      updateAssistant((a) => ({ ...a, steps: [...a.steps, step] }))
      await sleep(delay)
    }
    updateAssistant((a) => ({ ...a, done: true, answer: MOCK_ANSWER }))
    setRunning(false)
  }

  return (
    <aside
      className={
        'fixed top-0 right-0 bottom-0 w-panel flex flex-col bg-transparent ' +
        'transition-transform duration-[180ms] ease-[cubic-bezier(0.33,1,0.68,1)] ' +
        (open ? 'translate-x-0' : 'translate-x-full')
      }
    >
      <header className="h-topbar shrink-0 flex items-center gap-2 px-3 [-webkit-app-region:drag]">
        <IconSparkles className="w-[17px] h-[17px] text-text-dim" />
        <span className="flex-1 text-[14px] font-semibold tracking-[-0.1px]">Ask Monper</span>
        <IconButton size="sm" title="Cerrar (⌘J)" onClick={onClose}><IconX /></IconButton>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 [&::-webkit-scrollbar]:w-0">
        {turns.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
            <ThinkingOrb state="shaping" size={64} theme="dark" />
            <p className="text-[13.5px] text-text-dim leading-relaxed">
              Pregúntame lo que sea sobre esta página o la web. Puedo navegar, extraer y resumir por ti.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {turns.map((t, i) =>
              t.role === 'user' ? (
                <div key={i} className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.10] px-3.5 py-2 text-[13.5px]">
                  {t.text}
                </div>
              ) : (
                <AssistantTurn key={i} turn={t} />
              )
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 focus-within:border-white/25 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            rows={1}
            placeholder="Ask Monper…"
            className="flex-1 resize-none bg-transparent outline-none text-[13.5px] placeholder:text-text-faint max-h-32 py-1"
          />
          <button
            onClick={() => void send()}
            disabled={!input.trim() || running}
            className="w-7 h-7 shrink-0 grid place-items-center rounded-full bg-white/90 text-black disabled:opacity-30 disabled:bg-white/20 disabled:text-text transition-colors"
          >
            <IconArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

function AssistantTurn({ turn }: { turn: Extract<Turn, { role: 'assistant' }> }): JSX.Element {
  return (
    <div className="self-start w-full">
      <div className="flex flex-col gap-1.5">
        {turn.steps.map((s, i) => {
          const isLast = i === turn.steps.length - 1
          const active = !turn.done && isLast
          return (
            <div key={i} className="flex items-center gap-2.5">
              <span className="w-5 h-5 shrink-0 grid place-items-center">
                {active ? (
                  <ThinkingOrb state={s.state} size={20} theme="dark" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-text-faint" />
                )}
              </span>
              <span className={active ? 'text-[13px] text-text' : 'text-[13px] text-text-dim'}>{s.label}</span>
            </div>
          )
        })}
      </div>
      {turn.done && turn.answer && (
        <p className="mt-3 text-[13.5px] text-text leading-relaxed">{turn.answer}</p>
      )}
    </div>
  )
}
