import { useEffect, useRef, useState, type JSX } from 'react'
import type { ActiveInfo } from '../../../shared/types'
import { domainOf } from '../util'

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
    <div id="url-area">
      {editing ? (
        <input
          id="omnibox"
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
        />
      ) : (
        <button id="url-display" onClick={startEditing}>
          <span id="url-domain">{domain}</span>
          {title && <span className="sep" />}
          {title && <span id="url-title">{title}</span>}
        </button>
      )}
    </div>
  )
}
