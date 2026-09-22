import { useEffect, useState, type JSX } from 'react'
import { NO_UPDATE, type BrowserState, type Bookmark, type DownloadsSummary, type PanelSizes, type Profile, type UpdateState } from '@shared/types'
import Sidebar from '@renderer/components/browser/Sidebar'
import Content from '@renderer/components/browser/Content'
import Topbar from '@renderer/components/browser/Topbar'
import FindBar from '@renderer/components/browser/FindBar'
import ResizeHandle from '@renderer/components/browser/ResizeHandle'
import { ChatPanel } from '@renderer/components/chat'

const EMPTY: BrowserState = { activeId: null, tabs: [], active: null, controlling: false, incognito: false }
const { titanio } = window
const isMac = titanio.platform === 'darwin'

export default function App(): JSX.Element {
  const [state, setState] = useState<BrowserState>(EMPTY)
  const [collapsed, setCollapsed] = useState(false)
  const [editRequest, setEditRequest] = useState(0)
  const [chatOpen, setChatOpen] = useState(false)
  /** Control remoto: se pinta un indicador mientras esté activo (ver RemotePill). */
  const [remoto, setRemoto] = useState<{ enabled: boolean; port: number }>({ enabled: false, port: 0 })
  useEffect(() => { void titanio.getRemoteState().then(setRemoto) }, [])
  useEffect(() => titanio.onRemoteState(setRemoto), [])
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
  const [update, setUpdate] = useState<UpdateState>(NO_UPDATE)
  const [inject, setInject] = useState<{ text: string; nonce: number } | null>(null)

  useEffect(() => titanio.onState(setState), [])
  useEffect(() => { titanio.getProfile().then(setProfile); return titanio.onProfile(setProfile) }, [])
  useEffect(() => { titanio.getBookmarks().then(setBookmarks); return titanio.onBookmarks(setBookmarks) }, [])
  useEffect(() => { titanio.getDownloadsSummary().then(setDownloads); return titanio.onDownloadsSummary(setDownloads) }, [])
  useEffect(() => { titanio.getPanels().then(setPanels) }, [])
  useEffect(() => { titanio.getUpdateState().then(setUpdate); return titanio.onUpdateState(setUpdate) }, [])

  // Los anchos viven en las CSS vars que ya usan w-sidebar / left-sidebar / w-panel / right-panel.
  useEffect(() => {
    const s = document.documentElement.style
    s.setProperty('--spacing-sidebar', `${panels.sidebar}px`)
    s.setProperty('--spacing-panel', `${panels.chat}px`)
  }, [panels.sidebar, panels.chat])

  const resizePanel = (which: 'sidebar' | 'chat', width: number): void => {
    setResizing(true)
    setPanels((p) => ({ ...p, [which]: width }))
    titanio.setPanel(which, width) // el main mueve la vista nativa en vivo
  }

  /**
   * Colapsar/expandir → aviso al main para que mueva la vista nativa.
   *
   * El aviso va dentro de un `requestAnimationFrame`, y eso NO es cosmético. Medido: avisando
   * directamente desde el efecto, la vista nativa empezaba a moverse ~19ms después que el
   * chrome y la mejor correlación entre las dos curvas caía en ~20ms de desfase — con esta
   * curva, tan empinada al principio, eso son hasta 84px de diferencia en pantalla. Es lo que
   * se veía como "desfasado". Avisando en el frame en que la transición CSS arranca de
   * verdad, el desfase baja a 0-4ms.
   *
   * (También se probó mandarle al main el instante exacto para que compartieran origen de
   * tiempo: no movía ningún número, así que se quitó.)
   */
  const avisarAlPintar = (fn: () => void): (() => void) => {
    const id = requestAnimationFrame(fn)
    return () => cancelAnimationFrame(id)
  }
  useEffect(() => avisarAlPintar(() => titanio.setCollapsed(collapsed)), [collapsed])
  useEffect(() => avisarAlPintar(() => titanio.setChat(chatOpen)), [chatOpen])

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.altKey && (e.key === 'v' || e.key === '√')) { e.preventDefault(); titanio.cycleVibrancy(); return }
      if (e.key === 's') { e.preventDefault(); setCollapsed((c) => !c) }
      else if (e.key === 'j') { e.preventDefault(); setChatOpen((c) => !c) }
      else if (e.key === 't') { e.preventDefault(); titanio.newTab() }
      else if (e.key === 'w') { e.preventDefault(); if (state.activeId != null) titanio.closeTab(state.activeId) }
      else if (e.key === 'l') { e.preventDefault(); setEditRequest((n) => n + 1) }
      else if (e.key === 'r') { e.preventDefault(); titanio.reload() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.activeId])

  // Acciones del menú nativo que tocan estado del renderer (sidebar / chat / editar URL).
  useEffect(() => titanio.onMenuAction((action) => {
    if (action === 'toggle-sidebar') setCollapsed((c) => !c)
    else if (action === 'toggle-chat') setChatOpen((c) => !c)
    else if (action === 'edit-url') setEditRequest((n) => n + 1)
    else if (action === 'find') { setFindOpen(true); setFindRequest((n) => n + 1) }
  }), [])

  // Al cambiar de pestaña, cierra la búsqueda (sus resultados eran de la otra página).
  useEffect(() => { setFindOpen(false) }, [state.activeId])

  // Acción rápida desde una página: abre el chat y manda el prompt al agente.
  useEffect(() => titanio.onChatPrefill((prompt) => {
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
        onOpenBookmark={(id) => titanio.openBookmark(id)}
        onOpenMenu={(r) => titanio.openProfileMenu({ x: r.left, y: r.top, width: r.width, height: r.height })}
        onCollapse={() => setCollapsed(true)}
        onNewTab={() => titanio.newTab()}
        onSelectTab={(id) => titanio.selectTab(id)}
        onCloseTab={(id) => titanio.closeTab(id)}
        onReorderTabs={(ids) => titanio.reorderTabs(ids)}
        update={update}
        onDownloadUpdate={() => titanio.downloadUpdate()}
        onInstallUpdate={() => titanio.installUpdate()}
        remote={remoto}
        onDisableRemote={() => titanio.setRemote(false)}
      />
      <Content
        leftInset={!collapsed}
        rightInset={chatOpen}
        pageColor={state.active?.pageColor || '#111114'}
        controlling={state.controlling}
        onTakeOver={() => titanio.takeOver()}
      >
        <Topbar
          active={state.active}
          collapsed={collapsed}
          mac={isMac}
          chatOpen={chatOpen}
          editRequest={editRequest}
          onExpand={() => setCollapsed(false)}
          onBack={() => titanio.back()}
          onForward={() => titanio.forward()}
          onReload={() => titanio.reload()}
          onGo={(url) => titanio.go(url)}
          onToggleBookmark={() => titanio.toggleBookmark()}
          onToggleMute={() => titanio.toggleMute()}
          downloads={downloads}
          onOpenDownloads={(r) => titanio.openDownloadsPopover({ x: r.left, y: r.top, width: r.width, height: r.height })}
          onPeekShow={(r) => titanio.peekShow({ x: r.left, y: r.top, width: r.width, height: r.height })}
          onPeekHide={() => titanio.peekMaybeHide()}
          onToggleChat={() => setChatOpen((c) => !c)}
          onOpenVault={(r) => titanio.openVault({ x: r.left, y: r.top, width: r.width, height: r.height })}
          onOpenExtensions={(r) => titanio.openExtensions({ x: r.left, y: r.top, width: r.width, height: r.height })}
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

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} inject={inject} resizing={resizing} tint={state.tint} />
    </>
  )
}
