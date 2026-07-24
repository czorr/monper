import { useEffect, useRef, useState, type JSX } from 'react'

interface Props {
  /** Lado del contenido donde vive el borde: 'left' = sidebar, 'right' = panel de chat */
  side: 'left' | 'right'
  /** Ancho actual del panel (px) */
  width: number
  min: number
  max: number
  onResize: (width: number) => void
  /** Fin del arrastre (para persistir / reactivar transiciones) */
  onEnd?: () => void
}

/**
 * Borde arrastrable para redimensionar un panel, con un "grip" centrado que aparece
 * al hover. La zona activa es más ancha que la línea visible para que sea fácil de agarrar.
 */
export default function ResizeHandle({ side, width, min, max, onResize, onEnd }: Props): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startW = useRef(0)

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent): void => {
      // Arrastrar hacia afuera del contenido agranda el panel.
      const delta = side === 'left' ? e.clientX - startX.current : startX.current - e.clientX
      onResize(Math.min(max, Math.max(min, Math.round(startW.current + delta))))
    }
    const stop = (): void => { setDragging(false); onEnd?.() }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    // Evita que el cursor parpadee o se seleccione texto mientras se arrastra.
    const prevCursor = document.body.style.cursor
    document.body.style.cursor = 'col-resize'
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      document.body.style.cursor = prevCursor
    }
  }, [dragging, side, min, max, onResize, onEnd])

  return (
    <div
      onPointerDown={(e) => { e.preventDefault(); startX.current = e.clientX; startW.current = width; setDragging(true) }}
      onDoubleClick={() => onResize(side === 'left' ? 240 : 380)}
      title="Arrastra para redimensionar (doble click para restablecer)"
      className={
        'group/rz fixed top-0 bottom-0 z-40 w-2 cursor-col-resize [-webkit-app-region:no-drag] ' +
        (side === 'left' ? '-ml-1 left-sidebar' : '-mr-1 right-panel')
      }
    >
      {/* Indicador centrado: pastilla sutil que se resalta al hover/arrastre */}
      <span
        className={
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] h-9 rounded-full transition-colors ' +
          (dragging ? 'bg-white/45' : 'bg-white/15 group-hover/rz:bg-white/35')
        }
      />
    </div>
  )
}
