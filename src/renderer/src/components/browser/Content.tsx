import { useEffect, useRef, type JSX, type ReactNode } from 'react'
import titanioPng from '@renderer/assets/titanio.png' // el PNG a pelo: aquí el fondo es siempre oscuro

const { titanio } = window

interface Props {
  /** sidebar izquierdo expandido → inset y redondeo del lado izquierdo */
  leftInset: boolean
  /** panel de chat derecho abierto → inset y redondeo del lado derecho */
  rightInset: boolean
  /** color seamless de la página, para tapar la muesca de las esquinas superiores */
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
 * La vista nativa va CUADRADA a propósito (ver CONTENT_RADIUS en main): redondearla
 * dejaba un arco por el antialiasing del compositor, medido y confirmado. El look
 * "flotante" lo da el topbar, que al ser DOM sí redondea limpio.
 */
export default function Content({ leftInset, rightInset, pageColor, controlling, onTakeOver, children }: Props): JSX.Element {
  const box = useRef<HTMLDivElement>(null)

  /**
   * ESTE div no anima. Su posición la manda SIEMPRE el main, que es quien mueve la vista
   * nativa: el mismo rect, en el mismo tick, escrito directo en el nodo.
   *
   * Es la única forma de que el topbar y la página se muevan como una sola pieza. Todo lo
   * demás se probó y se midió:
   *  - dos animaciones independientes (transición CSS + intervalo en el main), aunque
   *    coincidan curva y duración: se ven desfasadas;
   *  - pasar el rect por estado de React a 60fps: la reconciliación deja el topbar 140px
   *    por detrás;
   *  - dejar que la clase CSS retome al terminar: dispara una segunda animación (380ms).
   * Las clases `left-*`/`right-*` solo sirven de posición inicial, hasta el primer frame.
   */
  useEffect(
    () =>
      titanio.onLayoutFrame((r) => {
        const el = box.current
        if (!el) return
        el.style.left = `${r.left}px`
        el.style.right = `${r.right}px`
      }),
    []
  )

  const cls = [
    'fixed top-0 bottom-0 overflow-hidden',
    leftInset ? 'left-sidebar rounded-tl-[14px]' : 'left-0',
    rightInset ? 'right-panel rounded-tr-[14px]' : 'right-0'
  ].join(' ')

  return (
    // SIN fondo, a propósito. Las muescas del redondeado nativo son lo ÚNICO que se ve
    // de esta capa, y deben mostrar la vibrancy de la ventana. Ponerle un color opaco
    // dibuja una cuña sólida en cada esquina (los "piquitos"): ya pasó, no repetirlo.
    <div ref={box} className={cls}>
      {children}
      {/* Tapa la muesca de las esquinas SUPERIORES para que la costura con el topbar
          sea invisible. Solo arriba: si cubriera todo, se perdería el redondeado de abajo. */}
      {(leftInset || rightInset) && (
        <div
          className="absolute left-0 right-0 top-topbar h-4 pointer-events-none transition-[background] duration-150"
          style={{ background: pageColor }}
        />
      )}
      {controlling && (
        <div className="absolute left-0 right-0 bottom-0 h-10 flex items-center justify-center gap-3 px-4 text-[12.5px] text-text-dim">
          <span className="flex items-center gap-2 [&>img]:w-4 [&>img]:h-4 [&>img]:opacity-80">
            <img src={titanioPng} alt="" />
            Titanio is controlling this tab
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
