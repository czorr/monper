import { useState, type JSX, type KeyboardEvent } from 'react'
import type { ChatContext, Effort } from '@shared/types'
import IconArrowUp from '~icons/tabler/arrow-up'
import ModelSelector from './ModelSelector'
import EffortSelector from './EffortSelector'

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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask Monper…"
            className="flex-1 resize-none bg-transparent outline-none text-[13.5px] placeholder:text-text-faint max-h-32 py-1"
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
