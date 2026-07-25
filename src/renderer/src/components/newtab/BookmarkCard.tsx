import type { JSX } from 'react'
import type { Bookmark } from '@shared/types'
import IconX from '~icons/tabler/x'
import IconWorld from '~icons/tabler/world'

interface Props {
  bookmark: Bookmark
  onOpen: (url: string) => void
  onRemove: (id: string) => void
}

/**
 * Igual que en el sidebar: solo el favicon real que el main recuerda del sitio. El servicio
 * de Google los devolvía con fondo opaco y le contaba los dominios del usuario.
 */

export default function BookmarkCard({ bookmark, onOpen, onRemove }: Props): JSX.Element {
  return (
    <button
      onClick={() => onOpen(bookmark.url)}
      className="group relative flex flex-col items-center gap-2.5 p-3 rounded-2xl transition-colors hover:bg-white/[0.06]"
    >
      <span
        onClick={(e) => { e.stopPropagation(); onRemove(bookmark.id) }}
        className="absolute top-1.5 right-1.5 w-5 h-5 grid place-items-center rounded-full bg-black/40 text-white/60 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white"
      >
        <IconX className="w-3 h-3" />
      </span>
      <span className="w-14 h-14 rounded-2xl bg-white/[0.06] grid place-items-center overflow-hidden">
        {bookmark.favicon ? (
          <img src={bookmark.favicon} width={28} height={28} alt="" className="rounded" />
        ) : (
          <IconWorld className="w-7 h-7 text-text-faint" />
        )}
      </span>
      <span className="text-[12px] text-text-dim max-w-[76px] truncate">{bookmark.title}</span>
    </button>
  )
}
