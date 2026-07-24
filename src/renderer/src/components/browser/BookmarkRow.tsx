import { useState, type JSX } from 'react'
import type { Bookmark } from '@shared/types'
import IconX from '~icons/tabler/x'
import IconWorld from '~icons/tabler/world'

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}
function faviconUrl(b: Bookmark): string {
  return b.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(b.url))}&sz=64`
}

interface Props {
  bookmark: Bookmark
  onOpen: (id: string) => void
  onRemove: (id: string) => void
}

export default function BookmarkRow({ bookmark, onOpen, onRemove }: Props): JSX.Element {
  const [broken, setBroken] = useState(false)
  return (
    <div className="group/bm relative flex items-center">
      <button
        onClick={() => onOpen(bookmark.id)}
        title={bookmark.url}
        className="flex items-center gap-2.5 w-full py-1.5 px-2 rounded-lg text-text-dim text-left text-[15px] min-h-[30px] hover:bg-bg-hover hover:text-text"
      >
        {broken ? (
          <IconWorld className="w-[15px] h-[15px] shrink-0 opacity-70" />
        ) : (
          <img
            src={faviconUrl(bookmark)}
            alt=""
            className="w-[15px] h-[15px] shrink-0 rounded-[3px]"
            onError={() => setBroken(true)}
          />
        )}
        <span className="truncate">{bookmark.title || hostOf(bookmark.url)}</span>
      </button>
      <button
        onClick={() => onRemove(bookmark.id)}
        title="Quitar bookmark"
        className="absolute right-1.5 w-5 h-5 grid place-items-center rounded-md text-text-faint hover:text-text hover:bg-white/[0.1] opacity-0 group-hover/bm:opacity-100 transition-opacity [&>svg]:w-3.5 [&>svg]:h-3.5"
      >
        <IconX />
      </button>
    </div>
  )
}
