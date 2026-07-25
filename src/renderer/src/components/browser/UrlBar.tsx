import { useEffect, useRef, useState, type JSX } from 'react'
import type { ActiveInfo, Suggestion } from '@shared/types'
import { domainOf } from '@renderer/lib/dom'
import MonperMark from '@renderer/components/ui/MonperMark'
import { useAutocomplete } from '@renderer/components/omnibox'

const { monper } = window

interface Props {
  active: ActiveInfo | null
  /** incrementa para forzar modo edición (⌘L) */
  editRequest: number
  onGo: (url: string) => void
}

// Base de completado de una sugerencia (URL sin protocolo / barra final).
function completionBase(s: Suggestion): string {
  return s.url.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

export default function UrlBar({ active, editRequest, onGo }: Props): JSX.Element {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const ac = useAutocomplete(monper.suggest)
  const deleting = useRef(false)

  const startEditing = (): void => {
    ac.setQuery(active && active.url !== 'about:blank' ? active.url : '')
    setEditing(true)
  }
  const stopEditing = (): void => { setEditing(false); ac.reset(); monper.omniHide() }
  useEffect(() => { if (editRequest > 0) startEditing() }, [editRequest]) // eslint-disable-line react-hooks/exhaustive-deps
  // Al entrar en edición, vuelca la query al input (no-controlado) y selecciona todo.
  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.value = ac.query; inputRef.current.focus(); inputRef.current.select() }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (): void => { ac.setQuery(inputRef.current?.value ?? '') }

  // Autocomplete inline: cuando llegan sugerencias y el usuario escribe hacia adelante,
  // completa el input con la mejor coincidencia y selecciona la parte añadida.
  useEffect(() => {
    if (deleting.current) return
    const el = inputRef.current
    const q = ac.query.trim()
    if (!el || !q || el.value.toLowerCase() !== q.toLowerCase()) return
    const cand = ac.items.find((s) => {
      if (s.kind === 'search') return false
      const base = completionBase(s)
      return base.toLowerCase().startsWith(q.toLowerCase()) && base.length > q.length
    })
    if (!cand) return
    const base = completionBase(cand)
    el.value = base
    el.setSelectionRange(q.length, base.length)
  }, [ac.items]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (s: Suggestion): void => { onGo(s.url); stopEditing() }
  const submit = (): void => {
    if (ac.current) return choose(ac.current)
    const v = inputRef.current?.value?.trim() || ac.query
    onGo(v); stopEditing()
  }
  // Vuelca la sugerencia resaltada al input (al navegar con flechas).
  const fillFrom = (i: number): void => {
    const s = ac.items[i]
    const el = inputRef.current
    if (!s || !el) return
    const t = s.kind === 'search' ? s.title : completionBase(s)
    el.value = t
    el.setSelectionRange(t.length, t.length)
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const n = ac.items.length
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!n) return
      deleting.current = true // no re-autocompletar sobre la selección de flechas
      const x = e.key === 'ArrowDown' ? (ac.active + 1 >= n ? 0 : ac.active + 1) : (ac.active - 1 < 0 ? n - 1 : ac.active - 1)
      ac.setActive(x)
      fillFrom(x)
    } else if (e.key === 'Enter') { e.preventDefault(); submit() }
    else if (e.key === 'Escape') { if (ac.open) ac.close(); else stopEditing() }
    else if (e.key === 'Backspace' || e.key === 'Delete') deleting.current = true
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) deleting.current = false
  }

  // Refs frescas para los callbacks de la ventana nativa (suscritos una vez).
  const ref = useRef({ items: ac.items, setActive: ac.setActive, choose })
  ref.current = { items: ac.items, setActive: ac.setActive, choose }
  useEffect(() => {
    const offC = monper.onOmniChosen((i) => { const s = ref.current.items[i]; if (s) ref.current.choose(s) })
    const offH = monper.onOmniHovered((i) => ref.current.setActive(i))
    return () => { offC(); offH() }
  }, [])

  // Muestra/actualiza/oculta la ventana nativa del dropdown según el estado del omnibox.
  useEffect(() => {
    if (!editing || !ac.open || ac.items.length === 0) { monper.omniHide(); return }
    const r = inputRef.current?.getBoundingClientRect()
    if (!r) return
    monper.omniShow(
      { x: r.left, y: r.top, width: r.width, height: r.height },
      { items: ac.items, active: ac.active, query: ac.query }
    )
  }, [editing, ac.open, ac.items, ac.active, ac.query])

  // En nuestras páginas no hay dominio que mostrar (el main manda la url vacía a propósito),
  // así que ese hueco lo ocupa la marca. El nombre de la página lo pone el título de al lado.
  const interna = !!active?.internal
  const domain = active ? (interna ? 'Monper' : domainOf(active.url) || 'New tab') : ''
  const title = active && active.title && active.title !== domain ? active.title : ''

  return (
    <div className="flex-1 flex min-w-0 [-webkit-app-region:no-drag]">
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="Busca en Google o escribe una URL"
          onChange={onChange}
          onBlur={() => stopEditing()}
          onKeyDown={onKeyDown}
          className="w-full h-8 rounded-[9px] text-text text-[13px] px-3 text-left outline-none border border-border bg-bg-elev placeholder:text-text-faint select-text [&::selection]:bg-white/15 [&::selection]:text-text-dim"
        />
      ) : domain ? (
        <div className="flex items-center gap-1.5 w-full min-w-0 h-[30px]">
          {/* Pill del dominio → popup de info/permisos del sitio */}
          <button
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              monper.openSiteInfo({ x: r.left, y: r.top, width: r.width, height: r.height })
            }}
            className="flex items-center gap-1.5 shrink-0 h-[30px] pl-2 pr-3 rounded-full text-[13px] font-medium text-text bg-bg-elev hover:bg-bg-hover transition-colors whitespace-nowrap tracking-[-0.08px]"
          >
            {interna && <MonperMark className="w-[15px] h-[15px]" />}
            <span className={interna ? '' : 'pl-1'}>{domain}</span>
          </button>
          {/* Título → abre el input */}
          <button
            onClick={startEditing}
            className="flex-1 min-w-0 h-[30px] px-1.5 text-left rounded-lg hover:bg-bg-elev"
          >
            <span className="text-text-dim overflow-hidden text-ellipsis whitespace-nowrap tracking-[-0.08px]">{title}</span>
          </button>
        </div>
      ) : (
        <button
          onClick={startEditing}
          className="flex items-center w-full min-w-0 h-[30px] px-3 rounded-lg text-[13px] text-left hover:bg-bg-elev"
        >
          <span className="text-text font-medium whitespace-nowrap tracking-[-0.08px]">New tab</span>
        </button>
      )}
    </div>
  )
}
