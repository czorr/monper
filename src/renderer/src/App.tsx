import { useEffect, useState, type JSX } from 'react'
import type { BrowserState, Bookmark, Profile } from '@shared/types'
import Sidebar from '@renderer/components/browser/Sidebar'
import Content from '@renderer/components/browser/Content'
import Topbar from '@renderer/components/browser/Topbar'
import { ChatPanel } from '@renderer/components/chat'

const EMPTY: BrowserState = { activeId: null, tabs: [], active: null, controlling: false }
const { monper } = window
const isMac = monper.platform === 'darwin'

export default function App(): JSX.Element {
  const [state, setState] = useState<BrowserState>(EMPTY)
  const [collapsed, setCollapsed] = useState(false)
  const [editRequest, setEditRequest] = useState(0)
  const [chatOpen, setChatOpen] = useState(false)
  const [profile, setProfile] = useState<Profile>({ name: 'Tú', initials: '?', avatar: null })
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])

  useEffect(() => monper.onState(setState), [])
  useEffect(() => { monper.getProfile().then(setProfile); return monper.onProfile(setProfile) }, [])
  useEffect(() => { monper.getBookmarks().then(setBookmarks); return monper.onBookmarks(setBookmarks) }, [])

  // Colapsar/expandir → aviso al main para reposicionar la vista nativa
  useEffect(() => { monper.setCollapsed(collapsed) }, [collapsed])
  useEffect(() => { monper.setChat(chatOpen) }, [chatOpen])

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.altKey && (e.key === 'v' || e.key === '√')) { e.preventDefault(); monper.cycleVibrancy(); return }
      if (e.key === 's') { e.preventDefault(); setCollapsed((c) => !c) }
      else if (e.key === 'j') { e.preventDefault(); setChatOpen((c) => !c) }
      else if (e.key === 't') { e.preventDefault(); monper.newTab() }
      else if (e.key === 'w') { e.preventDefault(); if (state.activeId != null) monper.closeTab(state.activeId) }
      else if (e.key === 'l') { e.preventDefault(); setEditRequest((n) => n + 1) }
      else if (e.key === 'r') { e.preventDefault(); monper.reload() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.activeId])

  // Acciones del menú nativo que tocan estado del renderer (sidebar / chat / editar URL).
  useEffect(() => monper.onMenuAction((action) => {
    if (action === 'toggle-sidebar') setCollapsed((c) => !c)
    else if (action === 'toggle-chat') setChatOpen((c) => !c)
    else if (action === 'edit-url') setEditRequest((n) => n + 1)
  }), [])

  return (
    <>
      <Sidebar
        state={state}
        profile={profile}
        bookmarks={bookmarks}
        collapsed={collapsed}
        onOpenBookmark={(id) => monper.openBookmark(id)}
        onOpenMenu={(r) => monper.openProfileMenu({ x: r.left, y: r.top, width: r.width, height: r.height })}
        onCollapse={() => setCollapsed(true)}
        onNewTab={() => monper.newTab()}
        onSelectTab={(id) => monper.selectTab(id)}
        onCloseTab={(id) => monper.closeTab(id)}
      />
      <Content
        leftInset={!collapsed}
        rightInset={chatOpen}
        pageColor={state.active?.pageColor || '#111114'}
        controlling={state.controlling}
        onTakeOver={() => monper.takeOver()}
      >
        <Topbar
          active={state.active}
          collapsed={collapsed}
          mac={isMac}
          chatOpen={chatOpen}
          editRequest={editRequest}
          onExpand={() => setCollapsed(false)}
          onBack={() => monper.back()}
          onForward={() => monper.forward()}
          onReload={() => monper.reload()}
          onGo={(url) => monper.go(url)}
          onToggleBookmark={() => monper.toggleBookmark()}
          onToggleMute={() => monper.toggleMute()}
          onToggleChat={() => setChatOpen((c) => !c)}
          onOpenVault={(r) => monper.openVault({ x: r.left, y: r.top, width: r.width, height: r.height })}
        />
      </Content>
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  )
}
