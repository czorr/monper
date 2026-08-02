import { useEffect, useRef, useState, type JSX } from 'react'
import type { ActiveInfo, Suggestion } from '@shared/types'
import { domainOf } from '@renderer/lib/dom'
import MonperMark from '@renderer/components/ui/MonperMark'
import { useAutocomplete, useInlineCompletion } from '@renderer/components/omnibox'

const { monper } = window

interface Props {
  active: ActiveInfo | null
  /** incrementa para forzar modo edición (⌘L) */
  editRequest: number
  onGo: (url: string) => void
}

export default function UrlBar({ active, editRequest, onGo }: Props): JSX.Element {
  const [editing, setEditing] = useState(false)
  const ac = useAutocomplete(monper.suggest)
  // Completado inline compartido con la new-tab page: misma lógica, un solo sitio.
  const ic = useInlineCompletion(ac)
  const inputRef = ic.inputRef

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

  const choose = (s: Suggestion): void => { onGo(s.url); stopEditing() }
  const submit = (): void => {
    if (ac.current) return choose(ac.current)
    const v = ic.value().trim() || ac.query
    onGo(v); stopEditing()
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (ic.onKeyDown(e)) return
    if (e.key === 'Enter') { e.preventDefault(); submit() }
    else if (e.key === 'Escape') { if (ac.open) ac.close(); else stopEditing() }
  }

  /**
   * El main quiere pedir un permiso y necesita saber dónde cae el pill del dominio: solo el
   * DOM del chrome lo sabe. Se responde con el rect de la barra entera y no con el del pill
   * porque el pill no existe mientras se edita la URL — y una petición de permiso no puede
   * depender de si el usuario tenía el cursor en la barra.
   */
  const barraRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    return monper.onPermAsk(() => {
      const r = barraRef.current?.getBoundingClientRect()
      if (r) monper.permAnchor({ x: r.left, y: r.top, width: r.width, height: r.height })
    })
  }, [])

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
    <div ref={barraRef} className="flex-1 flex min-w-0 [-webkit-app-region:no-drag]">
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="Busca en Google o escribe una URL"
          onChange={ic.onChange}
          onPointerDown={ic.onPointerDown}
          onBlur={() => stopEditing()}
          onKeyDown={onKeyDown}
          className="w-full h-8 rounded-[9px] text-text text-[13px] px-3 text-left outline-none border border-border bg-bg-elev placeholder:text-text-faint select-text [&[data-completado]::selection]:bg-white/15 [&[data-completado]::selection]:text-text-dim"
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
