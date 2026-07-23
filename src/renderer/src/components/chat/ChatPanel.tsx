import { useEffect, useRef, useState, type JSX } from 'react'
import { ThinkingOrb } from 'thinking-orbs'
import { EFFORTS, type ChatContext, type ChatMessage, type Effort } from '@shared/types'
import IconSparkles from '~icons/tabler/sparkles'
import IconX from '~icons/tabler/x'
import IconArrowUp from '~icons/tabler/arrow-up'
import IconChevronDown from '~icons/tabler/chevron-down'
import IconCheck from '~icons/tabler/check'
import { IconButton } from '@renderer/components/ui'

const EMPTY_CTX: ChatContext = { provider: null, models: [], model: '', effort: 'medium' }

const { monper } = window

interface Props {
  open: boolean
  onClose: () => void
}

interface Msg {
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  error?: boolean
}

export default function ChatPanel({ open, onClose }: Props): JSX.Element {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [ctx, setCtx] = useState<ChatContext>(EMPTY_CTX)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Refresca proveedor/modelos al abrir el panel y cuando cambian en Settings.
  useEffect(() => { if (open) monper.getChatContext().then(setCtx) }, [open])
  useEffect(() => monper.onChatContext(setCtx), [])

  const pickModel = (id: string): void => { monper.setModel(id); setCtx((c) => ({ ...c, model: id })) }
  const pickEffort = (e: Effort): void => { monper.setEffort(e); setCtx((c) => ({ ...c, effort: e })) }

  const scrollToEnd = (): void => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }))
  }

  // Actualiza el último mensaje del asistente (el que está en streaming).
  const patchLast = (fn: (m: Msg) => Msg): void => {
    setMessages((ms) => {
      const c = [...ms]
      for (let i = c.length - 1; i >= 0; i--) {
        if (c[i].role === 'assistant') { c[i] = fn(c[i]); break }
      }
      return c
    })
    scrollToEnd()
  }

  useEffect(() => {
    const offToken = monper.onChatToken((t) => patchLast((m) => ({ ...m, text: m.text + t })))
    const offDone = monper.onChatDone(() => { patchLast((m) => ({ ...m, streaming: false })); setRunning(false) })
    const offErr = monper.onChatError((msg) => { patchLast((m) => ({ ...m, text: msg, error: true, streaming: false })); setRunning(false) })
    return () => { offToken(); offDone(); offErr() }
  }, [])

  const send = (): void => {
    const text = input.trim()
    if (!text || running) return
    const history: ChatMessage[] = messages
      .filter((m) => !m.error && m.text)
      .map((m) => ({ role: m.role, content: m.text }))
    history.push({ role: 'user', content: text })

    setInput('')
    setRunning(true)
    setMessages((ms) => [...ms, { role: 'user', text }, { role: 'assistant', text: '', streaming: true }])
    scrollToEnd()
    monper.chatSend(history)
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
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
            <ThinkingOrb state="shaping" size={64} theme="dark" />
            <p className="text-[13.5px] text-text-dim leading-relaxed">
              Pregúntame lo que sea. Conecta un proveedor de IA en Settings para empezar.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.10] px-3.5 py-2 text-[13.5px] whitespace-pre-wrap">
                  {m.text}
                </div>
              ) : (
                <div key={i} className="self-start w-full text-[13.5px] leading-relaxed">
                  {m.streaming && !m.text ? (
                    <span className="inline-flex"><ThinkingOrb state="working" size={20} theme="dark" /></span>
                  ) : (
                    <p className={'whitespace-pre-wrap ' + (m.error ? 'text-red-400' : 'text-text')}>{m.text}</p>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* composer abajo */}
      <div className="shrink-0 p-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] focus-within:border-white/25 transition-colors">
          <div className="flex items-end gap-2 px-3 pt-2.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={1}
              placeholder="Ask Monper…"
              className="flex-1 resize-none bg-transparent outline-none text-[13.5px] placeholder:text-text-faint max-h-32 py-1"
            />
            {running ? (
              <button onClick={() => monper.chatCancel()} className="w-7 h-7 shrink-0 grid place-items-center rounded-full bg-white/15 text-text" title="Detener">
                <span className="w-2.5 h-2.5 rounded-[2px] bg-current" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="w-7 h-7 shrink-0 grid place-items-center rounded-full bg-white/90 text-black disabled:opacity-30 disabled:bg-white/20 disabled:text-text transition-colors"
              >
                <IconArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
            <ModelSelector ctx={ctx} onPick={pickModel} onConnect={() => monper.openSettings()} />
            {ctx.provider?.kind === 'anthropic' && <EffortSelector effort={ctx.effort} onPick={pickEffort} />}
          </div>
        </div>
      </div>
    </aside>
  )
}

function ModelSelector({ ctx, onPick, onConnect }: { ctx: ChatContext; onPick: (id: string) => void; onConnect: () => void }): JSX.Element {
  const [open, setOpen] = useState(false)

  if (!ctx.provider) {
    return (
      <button
        onClick={onConnect}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12.5px] text-text-faint hover:text-text hover:bg-white/[0.06] transition-colors"
      >
        <IconSparkles className="w-4 h-4" /> Conectar proveedor
      </button>
    )
  }

  const current = ctx.models.find((m) => m.id === ctx.model)?.name ?? ctx.model

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12.5px] text-text-dim hover:text-text hover:bg-white/[0.06] transition-colors"
      >
        <IconSparkles className="w-4 h-4" />
        {current}
        <IconChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div className="absolute z-50 bottom-full left-0 mb-1.5 w-52 p-1.5 rounded-xl border border-border bg-[#1c1c20]/95 shadow-2xl shadow-black/50">
            <div className="px-2 py-1 text-[11px] text-text-faint">{ctx.provider.label}</div>
            {ctx.models.map((m) => (
              <button
                key={m.id}
                onClick={() => { onPick(m.id); setOpen(false) }}
                className="flex items-center gap-2 w-full h-8 px-2 rounded-lg text-[13px] text-text text-left hover:bg-white/[0.08]"
              >
                <IconSparkles className="w-4 h-4 text-text-dim" />
                <span className="flex-1">{m.name}</span>
                {m.id === ctx.model && <IconCheck className="w-4 h-4 text-text" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function EffortSelector({ effort, onPick }: { effort: Effort; onPick: (e: Effort) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const current = EFFORTS.find((e) => e.id === effort)?.name ?? effort

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[12.5px] text-text-dim hover:text-text hover:bg-white/[0.06] transition-colors"
        title="Esfuerzo de razonamiento"
      >
        {current}
        <IconChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div className="absolute z-50 bottom-full left-0 mb-1.5 w-36 p-1.5 rounded-xl border border-border bg-[#1c1c20]/95 shadow-2xl shadow-black/50">
            {EFFORTS.map((e) => (
              <button
                key={e.id}
                onClick={() => { onPick(e.id); setOpen(false) }}
                className="flex items-center gap-2 w-full h-8 px-2 rounded-lg text-[13px] text-text text-left hover:bg-white/[0.08]"
              >
                <span className="flex-1">{e.name}</span>
                {e.id === effort && <IconCheck className="w-4 h-4 text-text" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
