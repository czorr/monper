import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent, type ClipboardEvent } from 'react'
import type { ChatContext, ChatAttachment, Effort } from '@shared/types'
import IconArrowUp from '~icons/tabler/arrow-up'
import IconPaperclip from '~icons/tabler/paperclip'
import IconX from '~icons/tabler/x'
import { fileToImageDataUrl } from '@renderer/lib/image'
import ModelSelector from './ModelSelector'
import EffortSelector from './EffortSelector'

/** Alto máximo del textarea antes de hacer scroll (~6 líneas). */
const MAX_H = 168

interface Props {
  ctx: ChatContext
  running: boolean
  onSend: (text: string, attachments: ChatAttachment[]) => void
  onCancel: () => void
  onPickModel: (id: string) => void
  onPickEffort: (e: Effort) => void
  onConnect: () => void
}

/** Caja de composición: adjuntos + textarea + enviar/detener + selectores de modelo y esfuerzo. */
export default function Composer({ ctx, running, onSend, onCancel, onPickModel, onPickEffort, onConnect }: Props): JSX.Element {
  useLocale()
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Auto-grow: crece con el contenido hasta MAX_H; a partir de ahí, scroll interno.
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, MAX_H) + 'px'
    ta.style.overflowY = ta.scrollHeight > MAX_H ? 'auto' : 'hidden'
  }, [input])

  const addFiles = async (files: FileList | File[]): Promise<void> => {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'))
    for (const f of imgs) {
      try {
        const dataUrl = await fileToImageDataUrl(f)
        setAttachments((a) => [...a, { type: 'image', dataUrl, name: f.name }])
      } catch { /* ignora la que falle */ }
    }
  }
  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files) addFiles(e.target.files)
    e.target.value = ''
  }
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = [...e.clipboardData.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((f): f is File => !!f)
    if (files.length) { e.preventDefault(); addFiles(files) }
  }
  const removeAt = (i: number): void => setAttachments((a) => a.filter((_, j) => j !== i))

  const canSend = (!!input.trim() || attachments.length > 0) && !running
  const submit = (): void => {
    if (!canSend) return
    onSend(input.trim(), attachments)
    setInput('')
    setAttachments([])
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  return (
    <div className="shrink-0 p-3">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] focus-within:border-white/25 transition-colors">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.map((a, i) => (
              <div key={i} className="relative group/att w-14 h-14 rounded-lg overflow-hidden border border-white/10">
                <img src={a.dataUrl} alt={a.name ?? ''} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeAt(i)}
                  title={tr("Quitar")}
                  className="absolute top-0.5 right-0.5 w-4 h-4 grid place-items-center rounded-full bg-black/70 text-white opacity-0 group-hover/att:opacity-100 transition-opacity [&>svg]:w-2.5 [&>svg]:h-2.5"
                >
                  <IconX />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 px-3 pt-2.5">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
            placeholder={tr("Ask Titanio…")}
            className="flex-1 resize-none bg-transparent outline-none text-[13.5px] leading-6 placeholder:text-text-faint py-1"
          />
          {running ? (
            <button onClick={onCancel} className="w-7 h-7 shrink-0 grid place-items-center rounded-full bg-white/15 text-text" title={tr("Detener")}>
              <span className="w-2.5 h-2.5 rounded-[2px] bg-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!canSend}
              className="w-7 h-7 shrink-0 grid place-items-center rounded-full bg-white/90 text-black disabled:opacity-30 disabled:bg-white/20 disabled:text-text transition-colors"
            >
              <IconArrowUp className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
          {/*
            El icono va a 16px, como el de enviar de este mismo composer: a 18px cantaba al
            lado del texto de 12.5px de los selectores. El botón sigue midiendo 28px — se
            encoge el dibujo, no la zona clicable.
          */}
          <button
            onClick={() => fileRef.current?.click()}
            title={tr("Adjuntar imagen")}
            className="w-7 h-7 shrink-0 grid place-items-center rounded-lg text-text-dim hover:text-text hover:bg-white/[0.08] transition-colors"
          >
            <IconPaperclip className="w-4 h-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPickFiles} />
          <ModelSelector ctx={ctx} onPick={onPickModel} onConnect={onConnect} />
          {ctx.provider?.kind === 'anthropic' && <EffortSelector effort={ctx.effort} onPick={onPickEffort} />}
        </div>
      </div>
    </div>
  )
}
