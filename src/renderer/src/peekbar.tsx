import { createRoot } from 'react-dom/client'
import { useEffect, useState, type JSX } from 'react'
import type { BrowserState, Bookmark, Profile } from '@shared/types'
import Sidebar from '@renderer/components/browser/Sidebar'
import './styles.css'

const { monper, peekbar: pk } = window

const EMPTY: BrowserState = { activeId: null, tabs: [], active: null, controlling: false }

/**
 * Ventana flotante del sidebar (peek). NO reimplementa nada: renderiza el MISMO
 * componente <Sidebar/> del chrome, así hereda close, menús contextuales, drag, etc.
 */
function Peek(): JSX.Element {
  const [state, setState] = useState<BrowserState>(EMPTY)
  const [profile, setProfile] = useState<Profile>({ name: 'Tú', initials: '?', avatar: null })
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [nonce, setNonce] = useState(0)

  useEffect(() => monper.onState(setState), [])
  useEffect(() => { monper.getProfile().then(setProfile); return monper.onProfile(setProfile) }, [])
  useEffect(() => { monper.getBookmarks().then(setBookmarks); return monper.onBookmarks(setBookmarks) }, [])
  useEffect(() => pk.onShown(() => setNonce((n) => n + 1)), [])

  return (
    <div className="h-full pl-2.5 pr-1 pt-2 pb-2.5">
      <div
        key={nonce}
        style={{ animation: 'peek-in 150ms cubic-bezier(0.33,1,0.68,1)' }}
        className="h-full rounded-2xl border border-white/10 bg-[#1c1c20]/95 backdrop-blur-md shadow-2xl shadow-black/50 overflow-hidden"
      >
        <Sidebar
          floating
          state={state}
          profile={profile}
          bookmarks={bookmarks}
          collapsed={false}
          onOpenBookmark={(id) => monper.openBookmark(id)}
          onOpenMenu={(r) => monper.openProfileMenu({ x: r.left, y: r.top, width: r.width, height: r.height })}
          onCollapse={() => pk.hide()}
          onNewTab={() => monper.newTab()}
          onSelectTab={(id) => monper.selectTab(id)}
          onCloseTab={(id) => monper.closeTab(id)}
          onReorderTabs={(ids) => monper.reorderTabs(ids)}
        />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Peek />)
