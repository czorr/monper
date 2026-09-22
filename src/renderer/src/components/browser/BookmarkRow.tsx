import { useState, type JSX } from 'react'
import type { Bookmark } from '@shared/types'
import IconWorld from '~icons/tabler/world'

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}
/**
 * Orden: el favicon REAL del sitio (el main lo recuerda al visitarlo) → el icono de marca
 * empaquetado, para los marcadores de fábrica → el globo. Nunca un servicio externo: el de
 * Google componía los iconos sobre fondo opaco (GitHub con recuadro) y recibía el dominio de
 * cada marcador del usuario.
 */
function faviconUrl(b: Bookmark): string | null {
  return b.favicon || null
}

interface Props {
  bookmark: Bookmark
  onOpen: (id: string) => void
}

export default function BookmarkRow({ bookmark, onOpen }: Props): JSX.Element {
  const [broken, setBroken] = useState(false)
  return (
    <div
      className="group/bm relative flex items-center"
      onContextMenu={(e) => { e.preventDefault(); window.titanio.bookmarkContextMenu(bookmark.id) }}
    >
      <button
        onClick={() => onOpen(bookmark.id)}
        title={bookmark.url}
        className="flex items-center gap-2.5 w-full py-1 px-2 rounded-xl [corner-shape:superellipse(1.5)] border border-transparent text-text/75 text-left text-[14.5px] min-h-[29px] hover:bg-bg-hover hover:text-text"
      >
        {broken || !faviconUrl(bookmark) ? (
          <IconWorld className="w-[17px] h-[17px] shrink-0 opacity-70" />
        ) : (
          <img
            src={faviconUrl(bookmark)!}
            alt=""
            className="w-[17px] h-[17px] shrink-0 rounded-[3px]"
            onError={() => setBroken(true)}
          />
        )}
        <span className="truncate">{bookmark.title || hostOf(bookmark.url)}</span>
      </button>
    </div>
  )
}
