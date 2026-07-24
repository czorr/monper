import { createRoot } from 'react-dom/client'
import type { JSX, ComponentType, SVGProps } from 'react'
import IconWifiOff from '~icons/tabler/wifi-off'
import IconWorldOff from '~icons/tabler/world-off'
import IconLockOff from '~icons/tabler/lock-off'
import IconAlertTriangle from '~icons/tabler/alert-triangle'
import IconRefresh from '~icons/tabler/refresh'
import './styles.css'

const { monperTab } = window

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// Mapea el error a un mensaje humano + icono. Códigos = net errors de Chromium.
type IconType = ComponentType<SVGProps<SVGSVGElement>>
function describe(kind: string, code: number): { Icon: IconType; title: string; detail: string } {
  if (kind === 'crash') {
    return { Icon: IconAlertTriangle, title: 'Esta página se cerró inesperadamente', detail: 'El proceso de la página dejó de responder. Recárgala para volver a intentarlo.' }
  }
  const cert = code <= -200 && code >= -219
  if (cert) {
    return { Icon: IconLockOff, title: 'Tu conexión no es privada', detail: 'No se pudo verificar el certificado de seguridad del sitio. Puede que la conexión no sea segura.' }
  }
  switch (code) {
    case -106:
      return { Icon: IconWifiOff, title: 'Sin conexión a internet', detail: 'Revisa tu Wi-Fi o cable de red y vuelve a intentarlo.' }
    case -105:
    case -137:
      return { Icon: IconWorldOff, title: 'No se encontró el sitio', detail: 'No pudimos resolver la dirección. Verifica que esté bien escrita.' }
    case -102:
      return { Icon: IconWorldOff, title: 'Conexión rechazada', detail: 'El sitio rechazó la conexión. Puede estar caído o bloqueando el acceso.' }
    case -7:
    case -118:
      return { Icon: IconWorldOff, title: 'Tiempo de espera agotado', detail: 'El sitio tardó demasiado en responder.' }
    default:
      return { Icon: IconWorldOff, title: 'No se pudo cargar la página', detail: 'Ocurrió un error al abrir el sitio.' }
  }
}

function ErrorPage(): JSX.Element {
  const params = new URLSearchParams(location.search)
  const url = params.get('url') || ''
  const code = Number(params.get('code') || 0)
  const kind = params.get('kind') || 'network'
  const desc = params.get('desc') || ''
  const { Icon, title, detail } = describe(kind, code)

  const retry = (): void => { if (url) monperTab.navigate(url) }

  return (
    <div className="h-full w-full grid place-items-center bg-bg text-text select-none px-6">
      <div className="max-w-[440px] w-full text-center flex flex-col items-center">
        <div className="w-16 h-16 grid place-items-center rounded-2xl bg-white/[0.05] text-text-dim mb-6 [&>svg]:w-8 [&>svg]:h-8">
          <Icon />
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight mb-2">{title}</h1>
        <p className="text-[14px] text-text-dim leading-relaxed mb-1">{detail}</p>
        {url && <p className="text-[12.5px] text-text-faint mb-6 truncate max-w-full">{hostOf(url)}</p>}

        <button
          onClick={retry}
          className="flex items-center gap-2 px-4 h-10 rounded-xl bg-white/90 text-black text-[13.5px] font-medium hover:bg-white transition-colors [&>svg]:w-[16px] [&>svg]:h-[16px]"
        >
          <IconRefresh />
          Reintentar
        </button>

        {(desc || code) && (
          <p className="mt-6 text-[11px] text-text-faint font-mono">
            {desc}{code ? ` (${code})` : ''}
          </p>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<ErrorPage />)
