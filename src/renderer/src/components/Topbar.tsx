import type { JSX } from 'react'
import type { ActiveInfo } from '../../../shared/types'
import { luminance } from '../util'
import { IconButton } from './ui'
import UrlBar from './UrlBar'
import { SidebarIcon, BackIcon, ForwardIcon, ReloadIcon, StarIcon } from './Icons'

interface Props {
  active: ActiveInfo | null
  collapsed: boolean
  editRequest: number
  onExpand: () => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onGo: (url: string) => void
  onToggleBookmark: () => void
}

export default function Topbar({ active, collapsed, editRequest, onExpand, onBack, onForward, onReload, onGo, onToggleBookmark }: Props): JSX.Element {
  const pageColor = active?.pageColor || '#111114'
  const onLight = luminance(pageColor) > 0.5
  const canBookmark = !!active?.url // vacío en la new-tab page

  return (
    <header id="topbar" className={onLight ? 'on-light' : undefined} style={{ background: pageColor }}>
      <div className="nav-btns">
        {collapsed && (
          <IconButton title="Mostrar sidebar (⌘S)" onClick={onExpand}><SidebarIcon /></IconButton>
        )}
        <IconButton title="Atrás" disabled={!active?.canBack} onClick={onBack}><BackIcon /></IconButton>
        <IconButton title="Adelante" disabled={!active?.canForward} onClick={onForward}><ForwardIcon /></IconButton>
        <IconButton title="Recargar" onClick={onReload}><ReloadIcon /></IconButton>
      </div>

      <UrlBar active={active} editRequest={editRequest} onGo={onGo} />

      <div className="nav-btns">
        <IconButton
          title={active?.bookmarked ? 'Quitar bookmark' : 'Guardar bookmark'}
          disabled={!canBookmark}
          onClick={onToggleBookmark}
        >
          <StarIcon filled={active?.bookmarked} />
        </IconButton>
      </div>
    </header>
  )
}
