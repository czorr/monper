import { useEffect, useRef, useState, type JSX } from 'react'
import type { ActiveInfo } from '@shared/types'
import { domainOf } from '@renderer/lib/dom'

interface Props {
  active: ActiveInfo | null
  /** incrementa para forzar modo edición (⌘L) */
  editRequest: number
  onGo: (url: string) => void
}

export default function UrlBar({ active, editRequest, onGo }: Props): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const startEditing = (): void => {
    setValue(active && active.url !== 'about:blank' ? active.url : '')
    setEditing(true)
  }
  useEffect(() => { if (editRequest > 0) startEditing() }, [editRequest]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select() } }, [editing])

  const domain = active ? domainOf(active.url) || 'New tab' : ''
  const title = active && active.title && active.title !== domain ? active.title : ''

  return (
    <div className="flex-1 flex min-w-0 [-webkit-app-region:no-drag]">
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="Search Google or type a URL"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onGo(value); setEditing(false) }
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-full h-8 rounded-[9px] text-text text-[13px] px-3 text-left outline-none border border-border bg-bg-elev placeholder:text-text-faint select-text"
        />
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
