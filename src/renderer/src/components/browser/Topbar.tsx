import type { JSX } from 'react'
import type { ActiveInfo } from '@shared/types'
import { luminance } from '@renderer/lib/dom'
import { IconButton } from '@renderer/components/ui'
import UrlBar from './UrlBar'
import { SidebarIcon, BackIcon, ForwardIcon, ReloadIcon, StarIcon } from '@renderer/lib/icons'
import IconLock from '~icons/tabler/lock'
import IconVolumeOff from '~icons/tabler/volume-off'
import IconVolume from '~icons/tabler/volume'
import monperLogo from '@renderer/assets/monper.png'

interface Props {
  active: ActiveInfo | null
  collapsed: boolean
  mac: boolean
  chatOpen: boolean
  editRequest: number
  onExpand: () => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onGo: (url: string) => void
  onToggleBookmark: () => void
  onToggleMute: () => void
  onToggleChat: () => void
  onOpenVault: (rect: DOMRect) => void
}

const navBtns = 'flex gap-0.5 [-webkit-app-region:no-drag]'

export default function Topbar({ active, collapsed, mac, chatOpen, editRequest, onExpand, onBack, onForward, onReload, onGo, onToggleBookmark, onToggleMute, onToggleChat, onOpenVault }: Props): JSX.Element {
  const pageColor = active?.pageColor || '#111114'
  const onLight = luminance(pageColor) > 0.5
  const canBookmark = !!active?.url // vacío en la new-tab page

  return (
    <header
      className={
        'relative h-topbar flex items-center gap-2.5 px-3.5 transition-[background] duration-250 [-webkit-app-region:drag] ' +
        (onLight ? 'on-light ' : '') +
        (collapsed && mac ? 'pl-20.5' : '')
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
        {(active?.muted || active?.audible) && (
          <IconButton title={active?.muted ? 'Reactivar sonido' : 'Silenciar sitio'} onClick={onToggleMute}>
            {active?.muted ? <IconVolumeOff /> : <IconVolume />}
          </IconButton>
        )}

        <IconButton
          title={active?.bookmarked ? 'Quitar bookmark' : 'Guardar bookmark'}
          disabled={!canBookmark}
          onClick={onToggleBookmark}
        >
          <StarIcon filled={active?.bookmarked} />
        </IconButton>

        <IconButton
          title="Vault"
          onClick={(e) => onOpenVault((e.currentTarget as HTMLElement).getBoundingClientRect())}
        >
          <IconLock />
        </IconButton>

        <button
          onClick={onToggleChat}
          title="Ask Monper (⌘J)"
          className={
            'ml-1 flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full text-[13px] font-medium transition-colors [-webkit-app-region:no-drag] ' +
            (chatOpen ? 'bg-white/[0.16] text-text' : 'bg-white/[0.08] hover:bg-white/[0.13] text-text-dim hover:text-text')
          }
        >
          <img src={monperLogo} alt="" className="w-4 h-4 object-contain" />
          Ask Monper
        </button>
      </div>
    </header>
  )
}
