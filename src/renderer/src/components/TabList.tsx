import type { JSX } from 'react'
import type { TabInfo } from '../../../shared/types'
import TabRow from './TabRow'

interface Props {
  tabs: TabInfo[]
  activeId: number | null
  onSelect: (id: number) => void
  onClose: (id: number) => void
}

export default function TabList({ tabs, activeId, onSelect, onClose }: Props): JSX.Element {
  return (
    <div id="tab-list">
      {tabs.map((t) => (
        <TabRow key={t.id} tab={t} active={t.id === activeId} onSelect={onSelect} onClose={onClose} />
      ))}
    </div>
  )
}
