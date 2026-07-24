import { useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import type { ChatContext, Effort } from '@shared/types'
import IconArrowUp from '~icons/tabler/arrow-up'
import ModelSelector from './ModelSelector'
import EffortSelector from './EffortSelector'

/** Alto máximo del textarea antes de hacer scroll (~6 líneas). */
const MAX_H = 168

interface Props {
  ctx: ChatContext
  running: boolean
  onSend: (text: string) => void
  onCancel: () => void
  onPickModel: (id: string) => void
  onPickEffort: (e: Effort) => void
  onConnect: () => void
}

/** Caja de composición: textarea + enviar/detener + selectores de modelo y esfuerzo. */
export default function Composer({ ctx, running, onSend, onCancel, onPickModel, onPickEffort, onConnect }: Props): JSX.Element {
  const [input, setInput] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow: crece con el contenido hasta MAX_H; a partir de ahí, scroll interno.
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, MAX_H) + 'px'
    ta.style.overflowY = ta.scrollHeight > MAX_H ? 'auto' : 'hidden'
  }, [input])

  const submit = (): void => {
    const text = input.trim()
    if (!text || running) return
    setInput('')
    onSend(text)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  return (
    <div className="shrink-0 p-3">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] focus-within:border-white/25 transition-colors">
        <div className="flex items-end gap-2 px-3 pt-2.5">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask Monper…"
            className="flex-1 resize-none bg-transparent outline-none text-[13.5px] leading-6 placeholder:text-text-faint py-1"
          />
          {running ? (
            <button onClick={onCancel} className="w-7 h-7 shrink-0 grid place-items-center rounded-full bg-white/15 text-text" title="Detener">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!input.trim()}
              className="w-7 h-7 shrink-0 grid place-items-center rounded-full bg-white/90 text-black disabled:opacity-30 disabled:bg-white/20 disabled:text-text transition-colors"
            >
              <IconArrowUp className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
          <ModelSelector ctx={ctx} onPick={onPickModel} onConnect={onConnect} />
          {ctx.provider?.kind === 'anthropic' && <EffortSelector effort={ctx.effort} onPick={onPickEffort} />}
        </div>
      </div>
    </div>
  )
}
