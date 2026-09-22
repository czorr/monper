import { t as tr, useLocale } from '@renderer/lib/i18n'
import { createRoot } from 'react-dom/client'
import { useEffect, useState, type JSX } from 'react'
import type { PermKey, SiteInfoData, SitePermission } from '@shared/types'
import { PopoverPanel, PopoverRow, PopoverLabel, PopoverDivider, PopoverToggle } from '@renderer/components/popover'
import IconLock from '~icons/tabler/lock'
import IconLockOpen from '~icons/tabler/lock-open'
import IconCamera from '~icons/tabler/camera'
import IconMic from '~icons/tabler/microphone'
import IconMapPin from '~icons/tabler/map-pin'
import IconBell from '~icons/tabler/bell'
import IconClipboard from '~icons/tabler/clipboard'
import IconTrash from '~icons/tabler/trash'
import IconShield from '~icons/tabler/shield-check'
import TitanioLogo from '@renderer/components/ui/TitanioLogo'
import './styles.css'

const si = window.siteinfo

const PERM: Record<PermKey, { label: string; Icon: typeof IconCamera }> = {
  camera: { get label() { return tr("Cámara") }, Icon: IconCamera },
  microphone: { get label() { return tr("Micrófono") }, Icon: IconMic },
  geolocation: { get label() { return tr("Ubicación") }, Icon: IconMapPin },
  notifications: { get label() { return tr("Notificaciones") }, Icon: IconBell },
  clipboard: { get label() { return tr("Portapapeles") }, Icon: IconClipboard }
}

function SiteInfoWindow(): JSX.Element {
  useLocale()
  const [data, setData] = useState<SiteInfoData | null>(null)
  useEffect(() => si.onData(setData), [])

  if (!data) return <div className="p-3" />
  const perms: SitePermission[] = data.permissions

  return (
    <PopoverPanel onHeight={si.reportHeight} measure={data}>
      <PopoverLabel>{data.internal ? 'Titanio' : data.domain}</PopoverLabel>

      {/* Estado de la conexión: la única fila con color propio, por semántica. */}
      {data.internal ? (
        // Nuestras páginas no son https, así que la rama de abajo las pintaba en ÁMBAR con
        // el candado abierto: "la conexión no es segura" en nuestra propia página, que es
        // una señal falsa. Aquí no hay conexión que juzgar, solo contenido local.
        <div className="mx-1 mb-1 flex items-center gap-3 px-2.5 h-9 rounded-lg bg-white/[0.04]">
          <TitanioLogo height={16} className="text-text-dim" />
          <span className="flex-1 text-[13.5px] text-text-dim">{tr("Contenido local")}</span>
        </div>
      ) : (
        <div className={'mx-1 mb-1 flex items-center gap-3 px-2.5 h-9 rounded-lg ' + (data.secure ? 'bg-emerald-500/10' : 'bg-amber-500/10')}>
          {data.secure
            ? <IconLock className="w-[18px] h-[18px] text-emerald-400 shrink-0" />
            : <IconLockOpen className="w-[18px] h-[18px] text-amber-400 shrink-0" />}
          <span className={'flex-1 text-[13.5px] ' + (data.secure ? 'text-emerald-300' : 'text-amber-300')}>
            {data.secure ? tr("La conexión es segura") : tr("La conexión no es segura")}
          </span>
        </div>
      )}

      {!data.internal && (
        <>
          <PopoverDivider />
          <PopoverRow
            icon={<IconShield />}
            label={tr("Bloquear anuncios aquí")}
            meta={
              <div className="flex items-center gap-2">
                {/* El número es la prueba de que sirve; sin él, el interruptor es un acto de fe. */}
                {data.adblockOn && data.adblockBlocked > 0 && (
                  <span className="text-[12px] text-text-faint tabular-nums">{data.adblockBlocked}</span>
                )}
                <PopoverToggle on={data.adblockOn} onChange={(v) => si.setAdblock(v)} />
              </div>
            }
          />
        </>
      )}

      {perms.length > 0 && (
        <>
          <PopoverDivider />
          <PopoverLabel>{tr("Permisos")}</PopoverLabel>
          {perms.map(({ key, state }) => {
            const { label, Icon } = PERM[key]
            return (
              <PopoverRow
                key={key}
                icon={<Icon />}
                label={label}
                meta={<PopoverToggle on={state !== 'denied'} onChange={(v) => si.toggle(key, v ? 'granted' : 'denied')} />}
              />
            )
          })}
        </>
      )}

      {!data.internal && (
        <>
          <PopoverDivider />
          <PopoverRow icon={<IconTrash />} label={tr("Borrar cookies y datos del sitio")} danger onClick={() => si.clearData()} />
        </>
      )}
    </PopoverPanel>
  )
}

createRoot(document.getElementById('root')!).render(<SiteInfoWindow />)
