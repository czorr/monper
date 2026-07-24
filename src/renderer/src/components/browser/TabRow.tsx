import type { JSX } from 'react'
import type { TabInfo } from '@shared/types'
import { domainOf } from '@renderer/lib/dom'
import { CloseIcon } from '@renderer/lib/icons'
import IconVolumeOff from '~icons/tabler/volume-off'
import monperLogo from '@renderer/assets/monper.png'

interface Props {
  tab: TabInfo
  active: boolean
  onSelect: (id: number) => void
  onClose: (id: number) => void
}

const rowBase =
  'group/tab flex items-center gap-2.5 w-full py-1.5 px-2 rounded-lg text-left text-[15px] min-h-[30px]'

export default function TabRow({ tab, active, onSelect, onClose }: Props): JSX.Element {
  const state = active
    ? 'bg-bg-active text-text backdrop-blur-sm'
    : 'text-text-dim hover:bg-bg-hover hover:text-text'

  return (
    <div
      className={`${rowBase} ${state}`}
      onClick={() => onSelect(tab.id)}
      onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
      onContextMenu={(e) => { e.preventDefault(); window.monper.tabContextMenu(tab.id) }}
    >
      {!tab.url ? (
        // Páginas internas (new tab / settings): siempre nuestro iso, aunque tengan favicon default.
        <img src={monperLogo} alt="" className="w-4 h-4 shrink-0 object-contain opacity-80" />
      ) : tab.loading ? (
        <div className="w-3 h-3 m-0.5 shrink-0 rounded-full border-[1.5px] border-text-faint border-t-text animate-spin" />
      ) : tab.favicon ? (
        <img
          className="w-4 h-4 shrink-0 rounded object-contain"
          src={tab.favicon}
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
        />
      ) : (
        <span className="w-4 h-4 shrink-0 rounded bg-bg-elev" />
      )}

      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[15px] tracking-[-0.08px]">
        {tab.title || domainOf(tab.url) || 'New tab'}
      </span>

      {tab.muted && (
        <button
          title="Reactivar sonido"
          onClick={(e) => { e.stopPropagation(); window.monper.toggleMute(tab.id) }}
          className="shrink-0 w-[18px] h-[18px] grid place-items-center rounded-md text-text-faint hover:text-text hover:bg-white/15 [&>svg]:w-[14px] [&>svg]:h-[14px]"
        >
          <IconVolumeOff />
        </button>
      )}

      <div className="w-[18px] h-[18px] shrink-0 relative">
        {/* Punto rojo mientras graba (cámara/mic); se oculta al hover para dar paso al close. */}
        {tab.recording && (
          <span className="absolute inset-0 grid place-items-center pointer-events-none group-hover/tab:opacity-0">
            <span className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-red-500/30" />
          </span>
        )}
        <button
          className="absolute inset-0 grid place-items-center rounded-md text-text-faint opacity-0 group-hover/tab:opacity-100 hover:text-text hover:bg-white/15 [&>svg]:w-[13px] [&>svg]:h-[13px]"
          title="Cerrar"
          onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
