import type { JSX } from 'react'
import type { Bookmark } from '../../../shared/types'
import { domainOf } from '../util'

interface Props {
  bookmark: Bookmark
  onOpen: (url: string) => void
  onRemove: (id: string) => void
}

function faviconFor(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${domainOf(url)}&sz=64`
}

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
        <svg width="9" height="9" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      </span>
      <span className="w-14 h-14 rounded-2xl bg-white/[0.06] grid place-items-center overflow-hidden">
        <img src={faviconFor(bookmark.url)} width={28} height={28} alt="" className="rounded" />
      </span>
      <span className="text-[12px] text-text-dim max-w-[76px] truncate">{bookmark.title}</span>
    </button>
  )
}
