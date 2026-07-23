import type { JSX } from 'react'
import type { ActiveInfo } from '@shared/types'
import { luminance } from '@renderer/lib/dom'
import { IconButton } from '@renderer/components/ui'
import UrlBar from './UrlBar'
import { SidebarIcon, BackIcon, ForwardIcon, ReloadIcon, StarIcon } from '@renderer/lib/icons'

interface Props {
  active: ActiveInfo | null
  collapsed: boolean
  mac: boolean
  editRequest: number
  onExpand: () => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onGo: (url: string) => void
  onToggleBookmark: () => void
}

const navBtns = 'flex gap-0.5 [-webkit-app-region:no-drag]'

export default function Topbar({ active, collapsed, mac, editRequest, onExpand, onBack, onForward, onReload, onGo, onToggleBookmark }: Props): JSX.Element {
  const pageColor = active?.pageColor || '#111114'
  const onLight = luminance(pageColor) > 0.5
  const canBookmark = !!active?.url // vacío en la new-tab page

  return (
    <header
      className={
        'relative h-topbar flex items-center gap-2.5 px-3.5 transition-[background] duration-[250ms] [-webkit-app-region:drag] ' +
        (onLight ? 'on-light ' : '') +
        (collapsed && mac ? 'pl-[82px]' : '')
      }
      style={{ background: pageColor }}
    >
      <div className={navBtns}>
        {collapsed && (
          <IconButton title="Mostrar sidebar (⌘S)" onClick={onExpand}><SidebarIcon /></IconButton>
        )}
        <IconButton title="Atrás" disabled={!active?.canBack} onClick={onBack}><BackIcon /></IconButton>
        <IconButton title="Adelante" disabled={!active?.canForward} onClick={onForward}><ForwardIcon /></IconButton>
        <IconButton title="Recargar" onClick={onReload}><ReloadIcon /></IconButton>
      </div>

      <UrlBar active={active} editRequest={editRequest} onGo={onGo} />

      <div className={navBtns}>
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
