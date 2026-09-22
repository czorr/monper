import { t as tr, useLocale } from '@renderer/lib/i18n'
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
 * Borde arrastrable para redimensionar un panel.
 *
 * OJO con la geometría: la vista de la página (`WebContentsView`) se dibuja ENCIMA del DOM y
 * empieza justo en el borde, así que todo lo que quede del lado del contenido no recibe el
 * ratón ni se ve. La zona activa estaba centrada en el borde (±4px) y **la mitad estaba
 * muerta**: por eso costaba apuntar. Ahora la zona entera vive del lado del chrome.
 */
export default function ResizeHandle({ side, width, min, max, onResize, onEnd }: Props): JSX.Element {
  useLocale()
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
      title={tr("Arrastra para redimensionar (doble click para restablecer)")}
      className={
        // 10px de zona activa, TODA del lado del chrome (ver el comentario de arriba).
        'group/rz fixed top-0 bottom-0 z-40 w-2.5 cursor-col-resize [-webkit-app-region:no-drag] ' +
        (side === 'left' ? '-ml-2.5 left-sidebar' : '-mr-2.5 right-panel')
      }
    >
      {/*
       * Indicador pegado al borde (no centrado en la zona: los píxeles del otro lado los tapa
       * la vista nativa). Invisible en reposo y solo al hacer hover o arrastrar, para no
       * dibujar dos líneas permanentes en una UI que quiere ser tranquila.
       */}
      <span
        className={
          'absolute top-1/2 -translate-y-1/2 w-[4px] h-9 rounded-full transition-opacity duration-150 ' +
          (side === 'left' ? 'right-0' : 'left-0') + ' ' +
          (dragging ? 'bg-white/45 opacity-100' : 'bg-white/35 opacity-0 group-hover/rz:opacity-100')
        }
      />
    </div>
  )
}
