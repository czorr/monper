import type { JSX, ReactNode } from 'react'

interface Props {
  /** sidebar izquierdo expandido → inset y redondeo del lado izquierdo */
  leftInset: boolean
  /** panel de chat derecho abierto → inset y redondeo del lado derecho */
  rightInset: boolean
  /** color seamless de la página, para rellenar la costura con el topbar */
  pageColor: string
  children: ReactNode
}

/**
 * Área de contenido entre los sidebars: contiene el Topbar (HTML) y, superpuesta,
 * la página nativa (WebContentsView).
 *
 * El redondeo nativo (setBorderRadius, en main) redondea las 4 esquinas por igual;
 * las de arriba se ocultan con la franja del color de la página (ver abajo). El
 * topbar (HTML) redondea sus esquinas superiores según qué lado esté abierto.
 */
export default function Content({ leftInset, rightInset, pageColor, children }: Props): JSX.Element {
  const cls = [
    'fixed top-0 bottom-0 overflow-hidden transition-[left,right] duration-[180ms] ease-[cubic-bezier(0.33,1,0.68,1)]',
    leftInset ? 'left-sidebar rounded-tl-[32px]' : 'left-0',
    rightInset ? 'right-panel rounded-tr-[32px]' : 'right-0'
  ].join(' ')

  return (
    <div className={cls}>
      {children}
      {(leftInset || rightInset) && (
        <div className="absolute left-0 right-0 top-topbar h-8 pointer-events-none" style={{ background: pageColor }} />
      )}
    </div>
  )
}
