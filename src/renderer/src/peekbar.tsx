import { createRoot } from 'react-dom/client'
import { useEffect, useState, type JSX } from 'react'
import type { BrowserState, Bookmark, Profile } from '@shared/types'
import Sidebar from '@renderer/components/browser/Sidebar'
import { PopoverPanel } from '@renderer/components/popover'
import './styles.css'

const { titanio, peekbar: pk } = window

const EMPTY: BrowserState = { activeId: null, tabs: [], active: null, controlling: false, incognito: false }

/**
 * Ventana flotante del sidebar (peek). NO reimplementa nada: renderiza el MISMO
 * componente <Sidebar/> del chrome, así hereda close, menús contextuales, drag, etc.
 */
function Peek(): JSX.Element {
  const [state, setState] = useState<BrowserState>(EMPTY)
  const [profile, setProfile] = useState<Profile>({ name: 'Tú', initials: '?', avatar: null })
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [nonce, setNonce] = useState(0)
  const [closing, setClosing] = useState(false)

  useEffect(() => titanio.onState(setState), [])
  useEffect(() => { titanio.getProfile().then(setProfile); return titanio.onProfile(setProfile) }, [])
  useEffect(() => { titanio.getBookmarks().then(setBookmarks); return titanio.onBookmarks(setBookmarks) }, [])
  // `key={nonce}` remonta el panel en cada apertura para que la animación se repita.
  useEffect(() => pk.onShown(() => { setClosing(false); setNonce((n) => n + 1) }), [])
  // El main avisa antes de esconder: da tiempo a retraerse antes de que desaparezca.
  useEffect(() => pk.onClosing(() => setClosing(true)), [])

  return (
    <PopoverPanel
      key={nonce}
      fill
      padded={false}
      animation={
        closing
          ? 'peek-slide-out 140ms cubic-bezier(0.4,0,1,1) forwards'
          : 'peek-slide-in 180ms cubic-bezier(0.33,1,0.68,1)'
      }
    >
        <Sidebar
          floating
          state={state}
          profile={profile}
          bookmarks={bookmarks}
          collapsed={false}
          onOpenBookmark={(id) => titanio.openBookmark(id)}
          onOpenMenu={(r) => titanio.openProfileMenu({ x: r.left, y: r.top, width: r.width, height: r.height })}
          onCollapse={() => pk.hide()}
          onNewTab={() => titanio.newTab()}
          onSelectTab={(id) => titanio.selectTab(id)}
          onCloseTab={(id) => titanio.closeTab(id)}
          onReorderTabs={(ids) => titanio.reorderTabs(ids)}
        />
    </PopoverPanel>
  )
}

createRoot(document.getElementById('root')!).render(<Peek />)
