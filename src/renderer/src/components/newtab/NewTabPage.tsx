import { useEffect, useState, type JSX } from 'react'
import type { Bookmark, Suggestion } from '@shared/types'
import BookmarkCard from './BookmarkCard'
import IconSearch from '~icons/tabler/search'
import { useAutocomplete, SuggestionList } from '@renderer/components/omnibox'

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
  const ac = useAutocomplete(monperTab.suggest)

  useEffect(() => {
    monperTab.getBookmarks().then(setBookmarks)
    return monperTab.onBookmarks(setBookmarks)
  }, [])

  const choose = (s: Suggestion): void => monperTab.navigate(s.url)
  const submit = (): void => {
    if (ac.current) choose(ac.current)
    else if (ac.query.trim()) monperTab.navigate(ac.query.trim())
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); ac.move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ac.move(-1) }
    else if (e.key === 'Enter') { e.preventDefault(); submit() }
    else if (e.key === 'Escape') ac.close()
  }

  return (
    <div className="min-h-full bg-bg text-text flex flex-col items-center pt-[16vh] px-6 select-none">
      <h1 className="text-[26px] font-semibold tracking-tight mb-7">{greeting()}</h1>

      <div className="relative w-full max-w-[560px] mb-14">
        <div className="flex items-center gap-3 h-12 px-5 rounded-2xl bg-white/[0.06] border border-white/10 focus-within:border-white/25 transition-colors">
          <IconSearch className="text-text-faint shrink-0 w-[18px] h-[18px]" />
          <input
            autoFocus
            value={ac.query}
            onChange={(e) => ac.setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Busca en Google o escribe una URL"
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-text-faint select-text"
          />
        </div>
        {ac.open && (
          <div className="absolute z-50 top-full left-0 right-0 mt-2 rounded-2xl border border-white/10 bg-[#1c1c20]/95 shadow-2xl shadow-black/50 overflow-hidden">
            <SuggestionList items={ac.items} active={ac.active} query={ac.query} onHover={ac.setActive} onChoose={choose} />
          </div>
        )}
      </div>

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
