import { t as tr, useLocale } from '@renderer/lib/i18n'
import type { JSX } from 'react'
import type { UpdateState } from '@shared/types'
import IconRefresh from '~icons/tabler/refresh'
import IconArrowDown from '~icons/tabler/arrow-down'
import IconLoader from '~icons/tabler/loader-2'
import IconAlert from '~icons/tabler/alert-triangle'

interface Props {
  state: UpdateState
  /** empieza la descarga */
  onDownload: () => void
  /** reinicia e instala */
  onInstall: () => void
}

/**
 * Pill de actualización, junto al botón de colapsar y alineado con el semáforo.
 * Tres estados, en el orden en que ocurren:
 *   1. hay versión nueva  → "Actualizar" (click: descarga)
 *   2. descargando        → solo el loader y el %, sin texto (ocupa lo mínimo)
 *   3. lista              → "Reiniciar" (click: instala)
 * Y si algo falla, "Reintentar" en ámbar con el motivo en el tooltip. Ese estado NO es
 * decorativo: sin él un fallo de descarga volvía a pintar "Actualizar" y parecía que el
 * click no había hecho nada.
 * Cuando no hay nada que hacer, no se renderiza.
 */
export default function UpdatePill({ state, onDownload, onInstall }: Props): JSX.Element | null {
  useLocale()
  if (!state.available && !state.downloading) return null

  const base =
    'flex items-center justify-center gap-1.5 h-6 rounded-full shrink-0 ' +
    'bg-purple-400/15 text-purple-300 border border-purple-400/25 ' +
    'text-[11.5px] font-medium tracking-[-0.1px] transition-colors ' +
    '[-webkit-app-region:no-drag] [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:shrink-0'
  const hover = 'hover:bg-purple-400/25 hover:text-purple-200'

  // El error manda sobre todo lo demás: si no, el pill vuelve a "Actualizar" y el fallo
  // queda invisible.
  if (state.error && !state.downloading) {
    return (
      <button
        onClick={onDownload}
        title={tr("La actualización falló: {0}", state.error)}
        className={
          'flex items-center justify-center gap-1.5 h-6 pl-2 pr-2.5 rounded-full shrink-0 ' +
          'bg-amber-400/15 text-amber-300 border border-amber-400/25 ' +
          'hover:bg-amber-400/25 hover:text-amber-200 ' +
          'text-[11.5px] font-medium tracking-[-0.1px] transition-colors ' +
          '[-webkit-app-region:no-drag] [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:shrink-0'
        }
      >
        <IconAlert />
        {tr("Reintentar")} </button>
    )
  }

  if (state.downloading) {
    return (
      <span
        title={tr("Descargando la actualización… {0}%", state.percent)}
        className={`${base} px-1.5 tabular-nums cursor-default`}
      >
        <IconLoader className="animate-spin" />
        {state.percent > 0 && `${state.percent}%`}
      </span>
    )
  }

  if (state.downloaded) {
    return (
      <button
        onClick={onInstall}
        title={tr("Reiniciar Titanio para instalar la versión {0}", state.version ?? '')}
        className={`${base} ${hover} pl-2 pr-2.5`}
      >
        <IconRefresh />
        {tr("Reiniciar")} </button>
    )
  }

  return (
    <button
      onClick={onDownload}
      title={tr("Descargar la versión {0}", state.version ?? '')}
      className={`${base} ${hover} pl-2 pr-2.5`}
    >
      <IconArrowDown />
      {tr("Actualizar")} </button>
  )
}
