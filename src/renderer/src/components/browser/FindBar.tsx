import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import type { FindResult } from '@shared/types'
import IconChevronUp from '~icons/tabler/chevron-up'
import IconChevronDown from '~icons/tabler/chevron-down'
import IconX from '~icons/tabler/x'

const { monper } = window

interface Props {
  /** cambia cada vez que el usuario pulsa ⌘F (para reabrir/enfocar) */
  openRequest: number
  onClose: () => void
}

/** Barra de "buscar en página", flotante en la banda del topbar (no la tapa la vista nativa). */
export default function FindBar({ openRequest, onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<FindResult>({ matches: 0, active: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => monper.onFindResult(setResult), [])
  // Cada ⌘F enfoca y selecciona el texto actual.
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [openRequest])

  const search = (value: string, findNext: boolean, forward = true): void => {
    if (value) monper.findInPage(value, { forward, findNext })
    else { monper.stopFindInPage(); setResult({ matches: 0, active: 0 }) }
  }

  const onChange = (v: string): void => { setQuery(v); search(v, false) }
  const close = (): void => { monper.stopFindInPage(); onClose() }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') { e.preventDefault(); search(query, true, !e.shiftKey) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  }

  const none = query.length > 0 && result.matches === 0

  return (
    <div className="fixed top-2.5 right-4 z-50 flex items-center gap-1 h-9 pl-3 pr-1.5 rounded-xl border border-white/10 bg-[#1c1c20]/95 backdrop-blur-md shadow-xl shadow-black/40 [-webkit-app-region:no-drag]">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Buscar en la página"
        className={'w-48 bg-transparent outline-none text-[13px] placeholder:text-text-faint ' + (none ? 'text-red-400' : 'text-text')}
      />
      <span className="text-[12px] tabular-nums text-text-faint min-w-[42px] text-right pr-1">
        {query ? `${result.active}/${result.matches}` : ''}
      </span>
      <button onClick={() => search(query, true, false)} disabled={!result.matches} title="Anterior (⇧↵)" className="w-7 h-7 grid place-items-center rounded-lg text-text-dim hover:text-text hover:bg-white/[0.08] disabled:opacity-30 [&>svg]:w-4 [&>svg]:h-4"><IconChevronUp /></button>
      <button onClick={() => search(query, true, true)} disabled={!result.matches} title="Siguiente (↵)" className="w-7 h-7 grid place-items-center rounded-lg text-text-dim hover:text-text hover:bg-white/[0.08] disabled:opacity-30 [&>svg]:w-4 [&>svg]:h-4"><IconChevronDown /></button>
      <button onClick={close} title="Cerrar (Esc)" className="w-7 h-7 grid place-items-center rounded-lg text-text-dim hover:text-text hover:bg-white/[0.08] [&>svg]:w-4 [&>svg]:h-4"><IconX /></button>
    </div>
  )
}
