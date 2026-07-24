import { createRoot } from 'react-dom/client'
import { useEffect, useState, type JSX } from 'react'
import type { PeekData, TabInfo, Bookmark } from '@shared/types'
import { domainOf } from '@renderer/lib/dom'
import { Avatar } from '@renderer/components/ui'
import { PlusIcon, ChevronDown } from '@renderer/lib/icons'
import IconWorld from '~icons/tabler/world'
import monperLogo from '@renderer/assets/monper.png'
import './styles.css'

const pk = window.peekbar

const EMPTY: PeekData = { tabs: [], activeId: null, bookmarks: [], profile: { name: 'Tú', initials: '?', avatar: null } }

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}
function faviconUrl(b: Bookmark): string {
  return b.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(b.url))}&sz=64`
}

const rowBase = 'flex items-center gap-2.5 w-full py-1.5 px-2 rounded-lg text-left text-[15px] min-h-[30px] outline-none'

function TabItem({ t, active }: { t: TabInfo; active: boolean }): JSX.Element {
  return (
    <button
      onClick={() => pk.selectTab(t.id)}
      className={rowBase + ' ' + (active ? 'bg-white/[0.12] text-text' : 'text-text-dim hover:bg-white/[0.06] hover:text-text')}
    >
      {!t.url ? (
        <img src={monperLogo} alt="" className="w-4 h-4 shrink-0 object-contain opacity-80" />
      ) : t.favicon ? (
        <img src={t.favicon} alt="" className="w-4 h-4 shrink-0 rounded object-contain" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      ) : (
        <span className="w-4 h-4 shrink-0 rounded bg-white/10" />
      )}
      <span className="flex-1 truncate">{t.title || domainOf(t.url) || 'New tab'}</span>
    </button>
  )
}

function BookmarkItem({ b }: { b: Bookmark }): JSX.Element {
  const [broken, setBroken] = useState(false)
  return (
    <button onClick={() => pk.openBookmark(b.id)} className={rowBase + ' text-text-dim hover:bg-white/[0.06] hover:text-text'}>
      {broken ? (
        <IconWorld className="w-[15px] h-[15px] shrink-0 opacity-70" />
      ) : (
        <img src={faviconUrl(b)} alt="" className="w-[15px] h-[15px] shrink-0 rounded-[3px]" onError={() => setBroken(true)} />
      )}
      <span className="flex-1 truncate">{b.title || hostOf(b.url)}</span>
    </button>
  )
}

function Label({ children }: { children: string }): JSX.Element {
  return <div className="px-2 pt-2 pb-1 text-[12px] font-medium text-text-faint">{children}</div>
}

function Peek(): JSX.Element {
  const [d, setD] = useState<PeekData>(EMPTY)
  const [nonce, setNonce] = useState(0)
  useEffect(() => pk.onState(setD), [])
  useEffect(() => pk.onShown(() => setNonce((n) => n + 1)), [])

  const tabs = d.tabs.filter((t) => !t.agent && !t.bookmarkId)
  const liveBookmark = (id: string): TabInfo | undefined => d.tabs.find((t) => t.bookmarkId === id)

  return (
    // pl da el margen izquierdo flotante; pb el margen inferior; el panel ocupa toda la altura.
    // (Mostrar/ocultar lo decide el sondeo de cursor en el main, no eventos de hover.)
    <div className="h-full pl-2.5 pr-1 pt-2 pb-2.5">
      <div
        key={nonce}
        style={{ animation: 'peek-in 150ms cubic-bezier(0.33,1,0.68,1)' }}
        className="h-full flex flex-col rounded-2xl border border-white/10 bg-[#1c1c20]/95 backdrop-blur-md shadow-2xl shadow-black/50 p-2 overflow-hidden"
      >
        {/* Cuenta */}
        <div className="flex items-center gap-2 px-2 py-1.5 mb-1 shrink-0">
          <Avatar initials={d.profile.initials} src={d.profile.avatar} size="sm" />
          <span className="flex-1 text-[15px] font-semibold truncate tracking-[-0.1px]">{d.profile.name}</span>
          <ChevronDown className="w-3.5 h-3.5 text-text-faint shrink-0" />
        </div>

        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-0">
          {/* Bookmarks */}
          {d.bookmarks.length > 0 && (
            <>
              <Label>Bookmarks</Label>
              {d.bookmarks.map((b) => {
                const live = liveBookmark(b.id)
                return live ? <TabItem key={b.id} t={live} active={live.id === d.activeId} /> : <BookmarkItem key={b.id} b={b} />
              })}
            </>
          )}

          {/* Tabs */}
          <Label>Tabs</Label>
          <button onClick={() => pk.newTab()} className={rowBase + ' text-text-faint hover:bg-white/[0.06] hover:text-text [&>svg]:w-[15px] [&>svg]:h-[15px]'}>
            <PlusIcon /> New tab
          </button>
          {tabs.map((t) => <TabItem key={t.id} t={t} active={t.id === d.activeId} />)}
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Peek />)
