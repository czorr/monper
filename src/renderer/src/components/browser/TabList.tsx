import { useState, type JSX } from 'react'
import type { TabInfo } from '@shared/types'
import TabRow from './TabRow'

interface Props {
  tabs: TabInfo[]
  activeId: number | null
  onSelect: (id: number) => void
  onClose: (id: number) => void
  onReorder: (orderedIds: number[]) => void
}

export default function TabList({ tabs, activeId, onSelect, onClose, onReorder }: Props): JSX.Element {
  const [dragId, setDragId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)

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
    <div className="flex-1 overflow-y-auto flex flex-col gap-px mt-px pb-px [&::-webkit-scrollbar]:w-0">
      {tabs.map((t) => (
        <div
          key={t.id}
          draggable
          onDragStart={() => setDragId(t.id)}
          onDragOver={(e) => { e.preventDefault(); if (dragId != null) setOverId(t.id) }}
          onDragEnd={() => { setDragId(null); setOverId(null) }}
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
