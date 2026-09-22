import { useEffect, useRef, useState, type JSX } from 'react'
import type { Bookmark } from '@shared/types'
import IconFolder from '~icons/tabler/folder-filled'
import IconFolderOpen from '~icons/tabler/folder-open'
import IconChevron from '~icons/tabler/chevron-right'

interface Props {
  folder: Bookmark
  /** Cuántos marcadores contiene. Se muestra plegada: si no, plegarla los esconde sin rastro. */
  count: number
  collapsed: boolean
  onToggle: () => void
  /** Recién creada: entra directamente en modo renombrar, sin tener que buscar dónde hacerlo. */
  autoRename?: boolean
  onRenamed?: () => void
}

export default function BookmarkFolderRow({ folder, count, collapsed, onToggle, autoRename, onRenamed }: Props): JSX.Element {
  const [editando, setEditando] = useState(!!autoRename)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editando) return
    input.current?.focus()
    input.current?.select()
  }, [editando])

  const confirmar = (): void => {
    const v = input.current?.value.trim()
    // Un nombre vacío dejaría una fila en blanco imposible de identificar: se queda el que había.
    if (v && v !== folder.title) window.titanio.renameBookmark(folder.id, v)
    setEditando(false)
    onRenamed?.()
  }

  return (
    <div
      className="group/bm relative flex items-center"
      onContextMenu={(e) => { e.preventDefault(); window.titanio.bookmarkContextMenu(folder.id) }}
      onDoubleClick={() => setEditando(true)}
    >
      <button
        onClick={onToggle}
        title={`${folder.title} · ${count} ${count === 1 ? 'marcador' : 'marcadores'}`}
        className="flex items-center gap-2 w-full py-1 px-2 rounded-xl [corner-shape:superellipse(1.5)] border border-transparent text-text/75 text-left text-[14.5px] min-h-[29px] hover:bg-bg-hover hover:text-text"
      >
        <IconChevron
          className={'w-[13px] h-[13px] shrink-0 opacity-60 transition-transform duration-150 ' + (collapsed ? '' : 'rotate-90')}
        />
        {/*
          Plegada, la carpeta va SÓLIDA; desplegada, abierta y de línea. La diferencia es de
          peso y no solo de forma: plegada carga con todo lo que esconde, y desplegada el peso
          visual lo llevan sus marcadores, que están justo debajo.
        */}
        {collapsed ? (
          <IconFolder className="w-[15px] h-[15px] shrink-0 opacity-70" />
        ) : (
          <IconFolderOpen className="w-[16px] h-[16px] shrink-0 opacity-60" />
        )}
        {editando ? (
          <input
            ref={input}
            defaultValue={folder.title}
            spellCheck={false}
            onClick={(e) => { e.stopPropagation() }}
            onBlur={confirmar}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') confirmar()
              else if (e.key === 'Escape') { setEditando(false); onRenamed?.() }
            }}
            className="flex-1 min-w-0 bg-white/[0.08] rounded px-1 -mx-1 outline-none text-[14.5px] text-text"
          />
        ) : (
          <>
            <span className="truncate flex-1">{folder.title}</span>
            {/* El contador solo cuando está plegada: desplegada ya se ven, y sobra ruido. */}
            {collapsed && count > 0 && <span className="shrink-0 text-[11.5px] text-text-faint">{count}</span>}
          </>
        )}
      </button>
    </div>
  )
}
