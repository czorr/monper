import type { JSX, ReactNode } from 'react'
import MonperMark from '@renderer/assets/monper.png'

interface Props {
  /** sidebar izquierdo expandido → inset y redondeo del lado izquierdo */
  leftInset: boolean
  /** panel de chat derecho abierto → inset y redondeo del lado derecho */
  rightInset: boolean
  /** color seamless de la página, para rellenar la costura con el topbar */
  pageColor: string
  /** el agente controla la pestaña activa → leyenda inferior + botón Take over */
  controlling?: boolean
  onTakeOver?: () => void
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
export default function Content({ leftInset, rightInset, pageColor, controlling, onTakeOver, children }: Props): JSX.Element {
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
      {controlling && (
        <div className="absolute left-0 right-0 bottom-0 h-10 flex items-center justify-center gap-3 px-4 text-[12.5px] text-text-dim">
          <span className="flex items-center gap-2 [&>img]:w-4 [&>img]:h-4 [&>img]:opacity-80">
            <img src={MonperMark} alt="" />
            Monper is controlling this tab
          </span>
          <button
            onClick={onTakeOver}
            className="px-2.5 py-1 rounded-lg text-[12.5px] font-medium text-text bg-white/[0.08] hover:bg-white/[0.14] transition-colors"
          >
            Take over
          </button>
        </div>
      )}
    </div>
  )
}
