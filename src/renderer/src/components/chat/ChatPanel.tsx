import { useEffect, useRef, useState, type JSX } from 'react'
import type { ChatContext, ChatMessage, ChatAttachment, Effort, ChatSessionMeta, StoredChatMsg } from '@shared/types'
import IconX from '~icons/tabler/x'
import { IconButton } from '@renderer/components/ui'
import type { Msg, Part } from './types'
import UserBubble from './UserBubble'
import AssistantTurn from './AssistantTurn'
import EmptyState from './EmptyState'
import Composer from './Composer'
import SessionPill from './SessionPill'

const EMPTY_CTX: ChatContext = { provider: null, models: [], model: '', effort: 'medium' }

const { monper } = window

interface Props {
  open: boolean
  onClose: () => void
  /** prompt inyectado (p. ej. desde una acción rápida): se envía al cambiar el nonce */
  inject?: { text: string; nonce: number } | null
  /** durante el arrastre del borde: sin transición (sigue al cursor) */
  resizing?: boolean
}

export default function ChatPanel({ open, onClose, inject, resizing }: Props): JSX.Element {
  const [messages, setMessages] = useState<Msg[]>([])
  const [running, setRunning] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([])
  const [ctx, setCtx] = useState<ChatContext>(EMPTY_CTX)
  const scrollRef = useRef<HTMLDivElement>(null)

  /**
   * Los mensajes guardados no traen imágenes (ver chats.ts): se rehidratan con la marca de
   * cuántas había, para que la conversación cargada no mienta sobre lo que se envió.
   */
  const rehidratar = (ms: StoredChatMsg[]): Msg[] =>
    ms.map((m) => ({
      role: m.role,
      text: m.text,
      at: m.at,
      attachments: m.attachments ? Array.from({ length: m.attachments }, () => ({ type: 'image' as const, dataUrl: '' })) : undefined,
      parts: m.parts?.map((p) => (p.type === 'text' ? { type: 'text' as const, text: p.text, error: p.error } : { type: 'step' as const, step: p.step }))
    }))

  const refrescarLista = (): void => { void monper.chatsList().then(setSessions) }

  // Al abrir el panel se retoma la conversación que toque (ver las reglas en chats.ts).
  useEffect(() => {
    if (!open || sessionId) return
    void monper.chatsResume().then((s) => { setSessionId(s.id); setMessages(rehidratar(s.messages)) })
    refrescarLista()
  }, [open, sessionId])

  /** Guarda tras cada turno terminado. El panel es la fuente de verdad mientras está vivo. */
  const guardar = (ms: Msg[]): void => {
    if (!sessionId || ms.length === 0) return
    monper.chatsSave(sessionId, ms)
    refrescarLista()
  }

  const nuevaSesion = (): void => {
    void monper.chatsNew().then((s) => { setSessionId(s.id); setMessages([]); refrescarLista() })
  }
  const abrirSesion = (id: string): void => {
    void monper.chatsOpen(id).then((s) => { if (s) { setSessionId(s.id); setMessages(rehidratar(s.messages)) } })
  }
  const borrarSesion = (id: string): void => {
    monper.chatsRemove(id)
    if (id === sessionId) nuevaSesion()
    else refrescarLista()
  }

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
    const offDone = monper.onChatDone(() => {
      patchLast((m) => ({ ...m, streaming: false }))
      setRunning(false)
      // Se lee del estado ya actualizado, no de la clausura (que tendría el de antes).
      setMessages((ms) => { guardar(ms); return ms })
    })
    const offErr = monper.onChatError((msg) => {
      patchLast((m) => ({ ...pushPart(m, { type: 'text', text: msg, error: true }), streaming: false }))
      setRunning(false)
      setMessages((ms) => { guardar(ms); return ms })
    })
    return () => { offToken(); offStep(); offStepImg(); offDone(); offErr() }
  }, [sessionId])

  // Texto plano de un mensaje (usuario: text; asistente: concatena sus partes de texto).
  const plainText = (m: Msg): string =>
    m.role === 'user' ? (m.text ?? '') : (m.parts ?? []).filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text' && !p.error).map((p) => p.text).join('\n\n')

  const send = async (text: string, attachments: ChatAttachment[] = []): Promise<void> => {
    if (running || (!text && attachments.length === 0)) return
    // Puede devolver otra sesión si la actual llevaba horas callada: en ese caso el mensaje
    // arranca la nueva y no arrastra el contexto viejo.
    let base = messages
    if (sessionId) {
      try {
        const next = await monper.chatsForNext(sessionId)
        if (next.fresh) { setSessionId(next.id); setMessages([]); base = [] }
      } catch (e) {
        // No se puede tragar: sin esto el mensaje del usuario desaparecía sin explicación.
        console.error('[chats] no se pudo resolver la conversación destino:', e)
        setMessages((ms) => [...ms, { role: 'assistant', parts: [{ type: 'text', text: 'No se pudo abrir la conversación. Vuelve a intentarlo.', error: true }] }])
        return
      }
    }
    const history: ChatMessage[] = base
      .map((m) => ({ role: m.role, content: plainText(m) }))
      .filter((m) => m.content)
    history.push({ role: 'user', content: text, attachments: attachments.length ? attachments : undefined })

    setRunning(true)
    setMessages((ms) => [...ms, { role: 'user', text, attachments }, { role: 'assistant', parts: [], streaming: true, at: Date.now() }])
    scrollToEnd()
    monper.chatSend(history)
  }

  // Envía el prompt inyectado (acción rápida) cuando cambia el nonce.
  useEffect(() => { if (inject?.text) void send(inject.text) }, [inject?.nonce])

  return (
    <aside
      className={
        'fixed top-0 right-0 bottom-0 w-panel flex flex-col bg-transparent ' +
        (resizing ? '' : 'transition-transform duration-[180ms] ease-[cubic-bezier(0.33,1,0.68,1)] ') +
        (open ? 'translate-x-0' : 'translate-x-full')
      }
    >
      <header className="h-topbar shrink-0 flex items-center gap-2 px-3 [-webkit-app-region:drag]">
        <div className="flex-1 min-w-0 flex items-center">
          <SessionPill
            sessions={sessions}
            currentId={sessionId}
            onNew={nuevaSesion}
            onOpen={abrirSesion}
            onRemove={borrarSesion}
            onRefresh={refrescarLista}
          />
        </div>
        <IconButton size="sm" title="Cerrar (⌘J)" onClick={onClose}><IconX /></IconButton>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 [&::-webkit-scrollbar]:w-0">
        {messages.length === 0 ? (
          <EmptyState provider={ctx.provider} />
        ) : (
          <div className="flex flex-col selectable">
            {messages.map((m, i) =>
              m.role === 'user' ? <UserBubble key={i} text={m.text ?? ''} attachments={m.attachments} /> : <AssistantTurn key={i} msg={m} />
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
