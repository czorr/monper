import { useEffect, useRef, useState, type JSX } from 'react'
import type { ChatContext, ChatMessage, Effort } from '@shared/types'
import IconSparkles from '~icons/tabler/sparkles'
import IconX from '~icons/tabler/x'
import { IconButton } from '@renderer/components/ui'
import type { Msg, Part } from './types'
import UserBubble from './UserBubble'
import AssistantTurn from './AssistantTurn'
import EmptyState from './EmptyState'
import Composer from './Composer'

const EMPTY_CTX: ChatContext = { provider: null, models: [], model: '', effort: 'medium' }

const { monper } = window

interface Props {
  open: boolean
  onClose: () => void
}

export default function ChatPanel({ open, onClose }: Props): JSX.Element {
  const [messages, setMessages] = useState<Msg[]>([])
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

  // Agrega un token de texto: lo une a la última parte si ya es texto, o crea una nueva.
  const appendToken = (m: Msg, t: string): Msg => {
    const parts = [...(m.parts ?? [])]
    const last = parts[parts.length - 1]
    if (last && last.type === 'text' && !last.error) parts[parts.length - 1] = { ...last, text: last.text + t }
    else parts.push({ type: 'text', text: t })
    return { ...m, parts }
  }
  const pushPart = (m: Msg, part: Part): Msg => ({ ...m, parts: [...(m.parts ?? []), part] })

  // Adjunta una imagen al último step (el screenshot recién ejecutado).
  const attachImage = (m: Msg, dataUrl: string): Msg => {
    const parts = [...(m.parts ?? [])]
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      if (p.type === 'step') { parts[i] = { ...p, step: { ...p.step, image: dataUrl } }; break }
    }
    return { ...m, parts }
  }

  useEffect(() => {
    const offToken = monper.onChatToken((t) => patchLast((m) => appendToken(m, t)))
    const offStep = monper.onChatStep((s) => patchLast((m) => pushPart(m, { type: 'step', step: s })))
    const offStepImg = monper.onChatStepImage((d) => patchLast((m) => attachImage(m, d)))
    const offDone = monper.onChatDone(() => { patchLast((m) => ({ ...m, streaming: false })); setRunning(false) })
    const offErr = monper.onChatError((msg) => {
      patchLast((m) => ({ ...pushPart(m, { type: 'text', text: msg, error: true }), streaming: false }))
      setRunning(false)
    })
    return () => { offToken(); offStep(); offStepImg(); offDone(); offErr() }
  }, [])

  // Texto plano de un mensaje (usuario: text; asistente: concatena sus partes de texto).
  const plainText = (m: Msg): string =>
    m.role === 'user' ? (m.text ?? '') : (m.parts ?? []).filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text' && !p.error).map((p) => p.text).join('\n\n')

  const send = (text: string): void => {
    if (running) return
    const history: ChatMessage[] = messages
      .map((m) => ({ role: m.role, content: plainText(m) }))
      .filter((m) => m.content)
    history.push({ role: 'user', content: text })

    setRunning(true)
    setMessages((ms) => [...ms, { role: 'user', text }, { role: 'assistant', parts: [], streaming: true, at: Date.now() }])
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
        <span className="flex-1 text-[14px] font-semibold tracking-[-0.1px]">Ask Monper</span>
        <IconButton size="sm" title="Cerrar (⌘J)" onClick={onClose}><IconX /></IconButton>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 [&::-webkit-scrollbar]:w-0">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col selectable">
            {messages.map((m, i) =>
              m.role === 'user' ? <UserBubble key={i} text={m.text ?? ''} /> : <AssistantTurn key={i} msg={m} />
            )}
          </div>
        )}
      </div>

      <Composer
        ctx={ctx}
        running={running}
        onSend={send}
        onCancel={() => monper.chatCancel()}
        onPickModel={pickModel}
        onPickEffort={pickEffort}
        onConnect={() => monper.openSettings()}
      />
    </aside>
  )
}
