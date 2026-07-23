import { useEffect, useState, type JSX } from 'react'
import type { BrowserState } from '../../shared/types'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'

const EMPTY: BrowserState = { activeId: null, tabs: [], active: null }
const { monper } = window

export default function App(): JSX.Element {
  const [state, setState] = useState<BrowserState>(EMPTY)
  const [collapsed, setCollapsed] = useState(false)
  const [editRequest, setEditRequest] = useState(0)

  // Suscripción al estado del navegador + foco de ventana
  useEffect(() => {
    const off = monper.onState(setState)
    monper.onWinFocus((f) => document.body.classList.toggle('win-blurred', !f))
    if (monper.platform === 'darwin') document.body.classList.add('mac')
    return off
  }, [])

  // Colapsar/expandir → clase en body + aviso al main
  useEffect(() => {
    document.body.classList.toggle('collapsed', collapsed)
    monper.setCollapsed(collapsed)
  }, [collapsed])

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
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
        onOpenMenu={(r) => monper.openMenu({ x: r.left, y: r.top, width: r.width, height: r.height })}
        onCollapse={() => setCollapsed(true)}
        onNewTab={() => monper.newTab()}
        onSelectTab={(id) => monper.selectTab(id)}
        onCloseTab={(id) => monper.closeTab(id)}
      />
      <Topbar
        active={state.active}
        collapsed={collapsed}
        editRequest={editRequest}
        onExpand={() => setCollapsed(false)}
        onBack={() => monper.back()}
        onForward={() => monper.forward()}
        onReload={() => monper.reload()}
        onGo={(url) => monper.go(url)}
        onToggleBookmark={() => monper.toggleBookmark()}
      />
    </>
  )
}
