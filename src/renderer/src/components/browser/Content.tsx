import type { JSX, ReactNode } from 'react'

interface Props {
  /** true cuando el sidebar está expandido → esquinas redondeadas */
  expanded: boolean
  /** color seamless de la página, para rellenar la costura con el topbar */
  pageColor: string
  children: ReactNode
}

/**
 * Área de contenido a la derecha del sidebar: contiene el Topbar (HTML) y,
 * superpuesta, la página nativa (WebContentsView).
 *
 * El redondeo nativo (setBorderRadius, en el main) redondea las 4 esquinas por
 * igual. Como sólo queremos las de ABAJO (el topbar da las de arriba), pintamos
 * una franja del color de la página en la costura: la vista nativa se dibuja
 * encima del DOM, así que esa franja sólo asoma por las muescas superiores y
 * las rellena → costura unificada, esquinas inferiores redondeadas.
 */
export default function Content({ expanded, pageColor, children }: Props): JSX.Element {
  return (
    <div
      className={
        'fixed top-0 right-0 bottom-0 overflow-hidden transition-[left] duration-[180ms] ease-[cubic-bezier(0.33,1,0.68,1)] ' +
        (expanded ? 'left-sidebar rounded-tl-[11px]' : 'left-0')
      }
    >
      {children}
      {/* franja que rellena las muescas superiores de la vista nativa (ver comentario arriba) */}
      {expanded && (
        <div className="absolute left-0 right-0 top-topbar h-3 pointer-events-none" style={{ background: pageColor }} />
      )}
    </div>
  )
}
