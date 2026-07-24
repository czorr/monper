import { createRoot } from 'react-dom/client'
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import type { PermKey, SiteInfoData, SitePermission } from '@shared/types'
import IconLock from '~icons/tabler/lock'
import IconLockOpen from '~icons/tabler/lock-open'
import IconCamera from '~icons/tabler/camera'
import IconMic from '~icons/tabler/microphone'
import IconMapPin from '~icons/tabler/map-pin'
import IconBell from '~icons/tabler/bell'
import IconClipboard from '~icons/tabler/clipboard'
import IconTrash from '~icons/tabler/trash'
import './styles.css'

const si = window.siteinfo

const PERM: Record<PermKey, { label: string; Icon: typeof IconCamera }> = {
  camera: { label: 'Cámara', Icon: IconCamera },
  microphone: { label: 'Micrófono', Icon: IconMic },
  geolocation: { label: 'Ubicación', Icon: IconMapPin },
  notifications: { label: 'Notificaciones', Icon: IconBell },
  clipboard: { label: 'Portapapeles', Icon: IconClipboard }
}

function Row({ children, onClick }: { children: React.ReactNode; onClick?: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3.5 py-2.5 text-left rounded-lg text-[13.5px] text-text hover:bg-white/[0.05] [&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:shrink-0 [&>svg]:text-text-dim"
    >
      {children}
    </button>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}
      className={'w-9 h-5 rounded-full shrink-0 relative transition-colors ' + (on ? 'bg-emerald-500/80' : 'bg-white/15')}
    >
      <span className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ' + (on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

function SiteInfoWindow(): JSX.Element {
  const [data, setData] = useState<SiteInfoData | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => si.onData(setData), [])
  useLayoutEffect(() => {
    if (boxRef.current) si.reportHeight(Math.ceil(boxRef.current.getBoundingClientRect().height))
  }, [data])

  if (!data) return <div className="p-3" />
  const perms: SitePermission[] = data.permissions

  return (
    <div className="p-3">
      <div ref={boxRef} className="rounded-2xl border border-white/10 bg-[#1c1c20] shadow-xl shadow-black/50 overflow-hidden p-1.5">
        {/* Dominio */}
        <div className="px-3.5 pt-2 pb-1 text-[13px] text-text-dim truncate">{data.internal ? 'Página de Monper' : data.domain}</div>

        {/* Conexión */}
        <div className={'mx-1 mb-1 flex items-center gap-3 px-3 py-2.5 rounded-lg ' + (data.secure ? 'bg-emerald-500/10' : 'bg-amber-500/10')}>
          {data.secure ? <IconLock className="w-[18px] h-[18px] text-emerald-400 shrink-0" /> : <IconLockOpen className="w-[18px] h-[18px] text-amber-400 shrink-0" />}
          <span className={'flex-1 text-[13.5px] ' + (data.secure ? 'text-emerald-300' : 'text-amber-300')}>
            {data.internal ? 'Página interna' : data.secure ? 'La conexión es segura' : 'La conexión no es segura'}
          </span>
        </div>

        {/* Permisos */}
        {perms.length > 0 && (
          <>
            <div className="h-px bg-white/[0.06] my-1 mx-2" />
            <div className="px-3.5 pt-1.5 pb-1 text-[11px] font-medium text-text-faint">Permisos</div>
            {perms.map(({ key, state }) => {
              const { label, Icon } = PERM[key]
              const on = state !== 'denied'
              return (
                <div key={key} className="flex items-center gap-3 w-full px-3.5 py-2 text-[13.5px] text-text">
                  <Icon className="w-[18px] h-[18px] shrink-0 text-text-dim" />
                  <span className="flex-1">{label}</span>
                  <Toggle on={on} onChange={(v) => si.toggle(key, v ? 'granted' : 'denied')} />
                </div>
              )
            })}
          </>
        )}

        {/* Datos del sitio */}
        {!data.internal && (
          <>
            <div className="h-px bg-white/[0.06] my-1 mx-2" />
            <Row onClick={() => si.clearData()}>
              <IconTrash />
              <span className="flex-1">Borrar cookies y datos del sitio</span>
            </Row>
          </>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<SiteInfoWindow />)
