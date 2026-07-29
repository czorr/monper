import { createRoot } from 'react-dom/client'
import { useEffect, useState, type JSX } from 'react'
import type { PermAskData, PermKey } from '@shared/types'
import { PopoverPanel } from '@renderer/components/popover'
import IconCamera from '~icons/tabler/camera'
import IconMic from '~icons/tabler/microphone'
import IconMapPin from '~icons/tabler/map-pin'
import IconBell from '~icons/tabler/bell'
import IconClipboard from '~icons/tabler/clipboard'
import './styles.css'

const pa = window.permask

const ICON: Record<PermKey, typeof IconCamera> = {
  camera: IconCamera,
  microphone: IconMic,
  geolocation: IconMapPin,
  notifications: IconBell,
  clipboard: IconClipboard
}

/**
 * Petición de permiso, anclada al pill del dominio.
 *
 * El icono es el del permiso que se pide, no un genérico: al mirar sabes si te están
 * pidiendo el micrófono o la ubicación antes de leer nada.
 */
function PermAskWindow(): JSX.Element {
  const [data, setData] = useState<PermAskData | null>(null)
  useEffect(() => pa.onData(setData), [])

  if (!data) return <div className="p-3" />
  const Icon = ICON[data.keys[0]] ?? IconCamera

  return (
    <PopoverPanel onHeight={pa.reportHeight} measure={data} padded={false}>
      <div className="px-4 pt-4 pb-3.5 flex gap-3">
        <span className="w-9 h-9 rounded-xl grid place-items-center bg-white/[0.06] text-text-dim shrink-0 [&>svg]:w-[19px] [&>svg]:h-[19px]">
          <Icon />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] text-text leading-snug">
            <span className="font-medium">{data.domain}</span> quiere {data.label}
          </div>
          <div className="text-[12.5px] text-text-faint mt-1 leading-relaxed">
            Podrás cambiarlo desde el nombre del sitio, aquí mismo.
          </div>
        </div>
      </div>

      <div className="flex gap-2 px-4 pb-4">
        {/* Bloquear primero: la opción segura no debe ser la que está bajo el cursor por
            inercia tras un clic en la página. */}
        <button
          onClick={() => pa.answer(false)}
          className="flex-1 h-8 rounded-lg text-[13px] text-text-dim bg-white/[0.06] hover:bg-white/[0.1] hover:text-text transition-colors"
        >
          Bloquear
        </button>
        <button
          onClick={() => pa.answer(true)}
          className="flex-1 h-8 rounded-lg text-[13px] font-medium text-text bg-white/[0.16] hover:bg-white/[0.22] transition-colors"
        >
          Permitir
        </button>
      </div>
    </PopoverPanel>
  )
}

createRoot(document.getElementById('root')!).render(<PermAskWindow />)
