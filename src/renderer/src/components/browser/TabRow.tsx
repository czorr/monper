import { useState, type JSX } from 'react'
import type { TabInfo } from '@shared/types'
import { domainOf } from '@renderer/lib/dom'
import { CloseIcon } from '@renderer/lib/icons'
import IconVolumeOff from '~icons/tabler/volume-off'
import titanioLogo from '@renderer/assets/titanio.png'

interface Props {
  tab: TabInfo
  active: boolean
  onSelect: (id: number) => void
  onClose: (id: number) => void
}

const rowBase =
  'group/tab flex items-center gap-2.5 w-full py-1 px-2 rounded-xl text-left text-[14.5px] min-h-[29px] transition-transform duration-150'

/**
 * Efecto de pulsación de la fila. Va por estado y no por `active:` de CSS a propósito.
 *
 * Con `active:` la fila se hunde también al pulsar sus BOTONES —cerrar, silenciar— y como el
 * transform mueve todo el row, al soltar el puntero ya no estaba encima del botón y el click
 * no llegaba a dispararse: parecía que cerrar no funcionaba. Aquí solo se hunde si la
 * pulsación empezó en la fila, no en uno de sus controles.
 */
const PRESSED = 'scale-[0.98] translate-y-[1px]'

export default function TabRow({ tab, active, onSelect, onClose }: Props): JSX.Element {
  const [pressed, setPressed] = useState(false)
  const state = active
    ? 'bg-white/[0.07] border border-white/[0.07] text-text backdrop-blur-sm'
    // `border-transparent` para que la fila activa no mida 2px más y la lista no salte.
    : 'border border-transparent text-text/75 hover:bg-bg-hover hover:text-text'

  return (
    <div
      className={`${rowBase} ${state} ${pressed ? PRESSED : ''}`}
      onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('button')) setPressed(true) }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={() => onSelect(tab.id)}
      onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
      onContextMenu={(e) => { e.preventDefault(); window.titanio.tabContextMenu(tab.id) }}
    >
      {tab.internal || !tab.url ? (
        // Nuestras páginas llevan siempre el iso, nunca un favicon por defecto.
        <img src={titanioLogo} alt="" className="w-[17px] h-[17px] shrink-0 object-contain opacity-80" />
      ) : tab.loading ? (
        <div className="w-[13px] h-[13px] m-0.5 shrink-0 rounded-full border-[1.5px] border-text-faint border-t-text animate-spin" />
      ) : tab.favicon ? (
        <img
          className="w-[17px] h-[17px] shrink-0 rounded object-contain"
          src={tab.favicon}
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
        />
      ) : (
        <span className="w-[17px] h-[17px] shrink-0 rounded bg-bg-elev" />
      )}

      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[15px] tracking-[-0.08px]">
        {tab.title || domainOf(tab.url) || 'New tab'}
      </span>

      {tab.muted && (
        <button
          title="Reactivar sonido"
          onClick={(e) => { e.stopPropagation(); window.titanio.toggleMute(tab.id) }}
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
