import { useRef, useState, type JSX } from 'react'
import type { TabInfo } from '@shared/types'
import TabRow from './TabRow'

interface Props {
  tabs: TabInfo[]
  activeId: number | null
  onSelect: (id: number) => void
  onClose: (id: number) => void
  onReorder: (orderedIds: number[]) => void
  /** El sidebar necesita saber QUÉ se arrastra para permitir soltarlo en Bookmarks. */
  onDragTab?: (id: number) => void
  onDragEnd?: () => void
  /** Soltada fuera de la ventana: se muda a una ventana nueva. */
  onTearOff?: (id: number) => void
}

export default function TabList({ tabs, activeId, onSelect, onClose, onReorder, onDragTab, onDragEnd, onTearOff }: Props): JSX.Element {
  const lista = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)

  /**
   * ¿La soltaron fuera del sidebar?
   *
   * Este es el gesto de "sacar la pestaña": en un sidebar VERTICAL, salirse de la tira es
   * salirse por la derecha, igual que en Chrome salirse de la tira horizontal es salirse por
   * abajo. Cuenta también soltarla fuera de la ventana entera (escritorio, otra app).
   *
   * Ojo con la tentación de usar "no hubo drop": el área de página es un `WebContentsView` que
   * se dibuja ENCIMA del DOM, así que soltar sobre la web tampoco dispara ningún `drop` del
   * chrome. Por eso la condición es geométrica.
   */
  const fuera = (e: { clientX: number; clientY: number }): boolean => {
    const { clientX: x, clientY: y } = e
    if (x === 0 && y === 0) return false // algunas plataformas no reportan el punto final
    const m = 8 // holgura: rozar el borde no cuenta
    if (x < -m || y < -m || x > window.innerWidth + m || y > window.innerHeight + m) return true
    // Aquí el margen es de 2px, no de 8: al pasar sobre el área de página el arrastre puede
    // terminar justo en el borde, y con 8px de holgura el gesto no se reconocería.
    const r = lista.current?.getBoundingClientRect()
    return !!r && x > r.right + 2
  }

  const drop = (targetId: number): void => {
    if (dragId != null && dragId !== targetId) {
      const ids = tabs.map((t) => t.id).filter((id) => id !== dragId)
      const at = ids.indexOf(targetId)
      ids.splice(at < 0 ? ids.length : at, 0, dragId)
      onReorder(ids)
    }
    setDragId(null)
    setOverId(null)
  }

  return (
    <div ref={lista} className="flex-1 overflow-y-auto flex flex-col gap-px mt-px pb-px [&::-webkit-scrollbar]:w-0">
      {tabs.map((t) => (
        <div
          key={t.id}
          draggable
          onDragStart={() => { setDragId(t.id); onDragTab?.(t.id) }}
          onDragOver={(e) => { e.preventDefault(); if (dragId != null) setOverId(t.id) }}
          onDragEnd={(e) => {
            const sacar = dragId != null && fuera(e)
            const id = dragId
            setDragId(null); setOverId(null); onDragEnd?.()
            if (sacar && id != null) onTearOff?.(id)
          }}
          onDrop={() => drop(t.id)}
          className={
            'rounded-lg ' +
            (dragId === t.id ? 'opacity-40 ' : '') +
            (overId === t.id && dragId != null && dragId !== t.id ? 'shadow-[inset_0_2px_0_0_rgba(255,255,255,0.4)] ' : '')
          }
        >
          <TabRow tab={t} active={t.id === activeId} onSelect={onSelect} onClose={onClose} />
        </div>
      ))}
    </div>
  )
}
