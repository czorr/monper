import { useEffect, useState, type JSX } from 'react'
import type { Bookmark } from '@shared/types'
import BookmarkCard from './BookmarkCard'
import IconSearch from '~icons/tabler/search'

const { monperTab } = window

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Buenas noches'
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function NewTabPage(): JSX.Element {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    monperTab.getBookmarks().then(setBookmarks)
    return monperTab.onBookmarks(setBookmarks)
  }, [])

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (query.trim()) monperTab.navigate(query.trim())
  }

  return (
    <div className="min-h-full bg-bg text-text flex flex-col items-center pt-[16vh] px-6 select-none">
      <h1 className="text-[26px] font-semibold tracking-tight mb-7">{greeting()}</h1>

      <form onSubmit={submit} className="w-full max-w-[560px] mb-14">
        <div className="flex items-center gap-3 h-12 px-5 rounded-2xl bg-white/[0.06] border border-white/10 focus-within:border-white/25 transition-colors">
          <IconSearch className="text-text-faint shrink-0 w-[18px] h-[18px]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca en Google o escribe una URL"
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-text-faint select-text"
          />
        </div>
      </form>

      <div className="w-full max-w-[640px]">
        <div className="grid grid-cols-6 gap-1">
          {bookmarks.map((b) => (
            <BookmarkCard key={b.id} bookmark={b} onOpen={(url) => monperTab.navigate(url)} onRemove={(id) => monperTab.removeBookmark(id)} />
          ))}
        </div>
      </div>
    </div>
  )
}
