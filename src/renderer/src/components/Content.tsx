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
    <div id="content" className={expanded ? 'expanded' : undefined}>
      {children}
      {expanded && <div className="content-seam" style={{ background: pageColor }} />}
    </div>
  )
}
