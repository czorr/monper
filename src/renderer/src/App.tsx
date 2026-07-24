import { useEffect, useState, type JSX } from 'react'
import type { BrowserState, Bookmark, DownloadsSummary, PanelSizes, Profile } from '@shared/types'
import Sidebar from '@renderer/components/browser/Sidebar'
import Content from '@renderer/components/browser/Content'
import Topbar from '@renderer/components/browser/Topbar'
import FindBar from '@renderer/components/browser/FindBar'
import ResizeHandle from '@renderer/components/browser/ResizeHandle'
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
  const [downloads, setDownloads] = useState<DownloadsSummary>({ active: 0, total: 0 })
  const [findOpen, setFindOpen] = useState(false)
  const [findRequest, setFindRequest] = useState(0)
  const [panels, setPanels] = useState<PanelSizes>({
    sidebar: 240, chat: 380,
    limits: { sidebarMin: 180, sidebarMax: 420, chatMin: 300, chatMax: 640 }
  })
  const [resizing, setResizing] = useState(false)
  const [inject, setInject] = useState<{ text: string; nonce: number } | null>(null)

  useEffect(() => monper.onState(setState), [])
  useEffect(() => { monper.getProfile().then(setProfile); return monper.onProfile(setProfile) }, [])
  useEffect(() => { monper.getBookmarks().then(setBookmarks); return monper.onBookmarks(setBookmarks) }, [])
  useEffect(() => { monper.getDownloadsSummary().then(setDownloads); return monper.onDownloadsSummary(setDownloads) }, [])
  useEffect(() => { monper.getPanels().then(setPanels) }, [])

  // Los anchos viven en las CSS vars que ya usan w-sidebar / left-sidebar / w-panel / right-panel.
  useEffect(() => {
    const s = document.documentElement.style
    s.setProperty('--spacing-sidebar', `${panels.sidebar}px`)
    s.setProperty('--spacing-panel', `${panels.chat}px`)
  }, [panels.sidebar, panels.chat])

  const resizePanel = (which: 'sidebar' | 'chat', width: number): void => {
    setResizing(true)
    setPanels((p) => ({ ...p, [which]: width }))
    monper.setPanel(which, width) // el main mueve la vista nativa en vivo
  }

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
    else if (action === 'find') { setFindOpen(true); setFindRequest((n) => n + 1) }
  }), [])

  // Al cambiar de pestaña, cierra la búsqueda (sus resultados eran de la otra página).
  useEffect(() => { setFindOpen(false) }, [state.activeId])

  // Acción rápida desde una página: abre el chat y manda el prompt al agente.
  useEffect(() => monper.onChatPrefill((prompt) => {
    setChatOpen(true)
    setInject({ text: prompt, nonce: Date.now() })
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
        onReorderTabs={(ids) => monper.reorderTabs(ids)}
      />
      <Content
        leftInset={!collapsed}
        rightInset={chatOpen}
        pageColor={state.active?.pageColor || '#111114'}
        controlling={state.controlling}
        resizing={resizing}
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
          downloads={downloads}
          onOpenDownloads={() => monper.openDownloads()}
          onPeekShow={(r) => monper.peekShow({ x: r.left, y: r.top, width: r.width, height: r.height })}
          onPeekHide={() => monper.peekMaybeHide()}
          onToggleChat={() => setChatOpen((c) => !c)}
          onOpenVault={(r) => monper.openVault({ x: r.left, y: r.top, width: r.width, height: r.height })}
          onOpenExtensions={(r) => monper.openExtensions({ x: r.left, y: r.top, width: r.width, height: r.height })}
        />
      </Content>
      {findOpen && <FindBar openRequest={findRequest} onClose={() => setFindOpen(false)} />}

      {/* Bordes arrastrables (con grip centrado) para redimensionar los paneles */}
      {!collapsed && (
        <ResizeHandle
          side="left"
          width={panels.sidebar}
          min={panels.limits.sidebarMin}
          max={panels.limits.sidebarMax}
          onResize={(w) => resizePanel('sidebar', w)}
          onEnd={() => setResizing(false)}
        />
      )}
      {chatOpen && (
        <ResizeHandle
          side="right"
          width={panels.chat}
          min={panels.limits.chatMin}
          max={panels.limits.chatMax}
          onResize={(w) => resizePanel('chat', w)}
          onEnd={() => setResizing(false)}
        />
      )}

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} inject={inject} resizing={resizing} />
    </>
  )
}
