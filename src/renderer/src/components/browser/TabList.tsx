import type { JSX } from 'react'
import type { TabInfo } from '@shared/types'
import TabRow from './TabRow'

interface Props {
  tabs: TabInfo[]
  activeId: number | null
  onSelect: (id: number) => void
  onClose: (id: number) => void
}

export default function TabList({ tabs, activeId, onSelect, onClose }: Props): JSX.Element {
  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-px mt-px [&::-webkit-scrollbar]:w-0">
      {tabs.map((t) => (
        <TabRow key={t.id} tab={t} active={t.id === activeId} onSelect={onSelect} onClose={onClose} />
      ))}
    </div>
  )
}
