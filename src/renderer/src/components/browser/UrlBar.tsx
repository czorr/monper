import { useEffect, useRef, useState, type JSX } from 'react'
import type { ActiveInfo, Suggestion } from '@shared/types'
import { domainOf } from '@renderer/lib/dom'
import { useAutocomplete, SuggestionList } from '@renderer/components/omnibox'

const { monper } = window

interface Props {
  active: ActiveInfo | null
  /** incrementa para forzar modo edición (⌘L) */
  editRequest: number
  onGo: (url: string) => void
}

export default function UrlBar({ active, editRequest, onGo }: Props): JSX.Element {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const ac = useAutocomplete(monper.suggest)

  const startEditing = (): void => {
    ac.setQuery(active && active.url !== 'about:blank' ? active.url : '')
    setEditing(true)
  }
  const stopEditing = (): void => { setEditing(false); ac.reset() }
  useEffect(() => { if (editRequest > 0) startEditing() }, [editRequest]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select() } }, [editing])

  const choose = (s: Suggestion): void => { onGo(s.url); stopEditing() }
  const submit = (): void => {
    if (ac.current) choose(ac.current)
    else { onGo(ac.query); stopEditing() }
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); ac.move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ac.move(-1) }
    else if (e.key === 'Enter') { e.preventDefault(); submit() }
    else if (e.key === 'Escape') { if (ac.open) ac.close(); else stopEditing() }
  }

  const domain = active ? domainOf(active.url) || 'New tab' : ''
  const title = active && active.title && active.title !== domain ? active.title : ''

  return (
    <div className="flex-1 flex min-w-0 [-webkit-app-region:no-drag]">
      {editing ? (
        <div className="relative w-full">
          <input
            ref={inputRef}
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder="Search Google or type a URL"
            value={ac.query}
            onChange={(e) => ac.setQuery(e.target.value)}
            onBlur={() => stopEditing()}
            onKeyDown={onKeyDown}
            className="w-full h-8 rounded-[9px] text-text text-[13px] px-3 text-left outline-none border border-border bg-bg-elev placeholder:text-text-faint select-text"
          />
          {ac.open && (
            <div className="absolute z-50 top-full left-0 right-0 mt-2 rounded-2xl border border-white/10 bg-[#1c1c20]/95 shadow-2xl shadow-black/50 overflow-hidden">
              <SuggestionList items={ac.items} active={ac.active} onHover={ac.setActive} onChoose={choose} />
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={startEditing}
          className="flex items-center gap-2.5 w-full min-w-0 h-[30px] px-3 rounded-lg text-[13px] text-left hover:bg-bg-elev"
        >
          <span className="text-text font-medium whitespace-nowrap tracking-[-0.08px]">{domain}</span>
          {title && <span className="w-px h-3.5 bg-border shrink-0" />}
          {title && (
            <span className="text-text-dim overflow-hidden text-ellipsis whitespace-nowrap tracking-[-0.08px]">{title}</span>
          )}
        </button>
      )}
    </div>
  )
}
