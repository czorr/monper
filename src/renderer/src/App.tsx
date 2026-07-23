import { useEffect, useState, type JSX } from 'react'
import type { BrowserState } from '@shared/types'
import Sidebar from '@renderer/components/browser/Sidebar'
import Content from '@renderer/components/browser/Content'
import Topbar from '@renderer/components/browser/Topbar'
import ProfileMenu from '@renderer/components/menu/ProfileMenu'

const EMPTY: BrowserState = { activeId: null, tabs: [], active: null }
const { monper } = window
const isMac = monper.platform === 'darwin'

export default function App(): JSX.Element {
  const [state, setState] = useState<BrowserState>(EMPTY)
  const [collapsed, setCollapsed] = useState(false)
  const [editRequest, setEditRequest] = useState(0)
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)

  useEffect(() => monper.onState(setState), [])

  // Colapsar/expandir → aviso al main para reposicionar la vista nativa
  useEffect(() => { monper.setCollapsed(collapsed) }, [collapsed])

  // Cierra el menú de perfil si se interactúa con la página
  useEffect(() => monper.onPagePointerDown(() => setMenuAnchor(null)), [])

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.altKey && (e.key === 'v' || e.key === '√')) { e.preventDefault(); monper.cycleVibrancy(); return }
      if (e.key === 's') { e.preventDefault(); setCollapsed((c) => !c) }
      else if (e.key === 't') { e.preventDefault(); monper.newTab() }
      else if (e.key === 'w') { e.preventDefault(); if (state.activeId != null) monper.closeTab(state.activeId) }
      else if (e.key === 'l') { e.preventDefault(); setEditRequest((n) => n + 1) }
      else if (e.key === 'r') { e.preventDefault(); monper.reload() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.activeId])

  return (
    <>
      <Sidebar
        state={state}
        collapsed={collapsed}
        onOpenMenu={(r) => setMenuAnchor((cur) => (cur ? null : r))}
        onCollapse={() => setCollapsed(true)}
        onNewTab={() => monper.newTab()}
        onSelectTab={(id) => monper.selectTab(id)}
        onCloseTab={(id) => monper.closeTab(id)}
      />
      {menuAnchor && <ProfileMenu anchor={menuAnchor} onClose={() => setMenuAnchor(null)} />}
      <Content expanded={!collapsed} pageColor={state.active?.pageColor || '#111114'}>
        <Topbar
          active={state.active}
          collapsed={collapsed}
          mac={isMac}
          editRequest={editRequest}
          onExpand={() => setCollapsed(false)}
          onBack={() => monper.back()}
          onForward={() => monper.forward()}
          onReload={() => monper.reload()}
          onGo={(url) => monper.go(url)}
          onToggleBookmark={() => monper.toggleBookmark()}
        />
      </Content>
    </>
  )
}
