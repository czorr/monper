import { createRoot } from 'react-dom/client'
import { useEffect, useState, type JSX } from 'react'
import type { BrowserState, Bookmark, Profile } from '@shared/types'
import Sidebar from '@renderer/components/browser/Sidebar'
import { PopoverPanel } from '@renderer/components/popover'
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
    <PopoverPanel key={nonce} fill padded={false}>
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
    </PopoverPanel>
  )
}

createRoot(document.getElementById('root')!).render(<Peek />)
