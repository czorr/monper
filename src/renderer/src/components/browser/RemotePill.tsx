import type { JSX } from 'react'
import IconPlugConnected from '~icons/tabler/plug-connected'

/**
 * Indicador de control remoto activo, en el mismo hueco que el pill de actualización.
 *
 * No es decorativo: mientras esté encendido, cualquier proceso local con el token puede
 * navegar a los sitios donde tienes sesión abierta y leer lo que muestren. Eso **nunca** debe
 * estar activo sin que se vea, así que ocupa un sitio fijo del chrome y se apaga con un click.
 *
 * En ámbar y no en rojo a propósito: no es un error, es un estado que elegiste — pero uno del
 * que conviene acordarse.
 */
export default function RemotePill({ port, onDisable }: { port: number; onDisable: () => void }): JSX.Element {
  return (
    <button
      onClick={onDisable}
      title={`Control remoto activo en 127.0.0.1:${port} — click para apagarlo`}
      className={
        'flex items-center justify-center gap-1.5 h-6 pl-2 pr-2.5 rounded-full shrink-0 ' +
        'bg-orange-400/15 text-orange-300 border border-orange-400/25 ' +
        'hover:bg-orange-400/25 hover:text-orange-200 ' +
        'text-[11.5px] font-medium tracking-[-0.1px] transition-colors ' +
        '[-webkit-app-region:no-drag] [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:shrink-0'
      }
    >
      <IconPlugConnected />
      Remoto
    </button>
  )
}
