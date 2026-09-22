import { useState, type JSX } from 'react'
import type { TabInfo } from '@shared/types'
import IconWorld from '~icons/tabler/world'
import TabRow from './TabRow'

interface Props {
  tab?: TabInfo
  activeId: number | null
  favicon?: string | null
  onClose: (id: number) => void
}

export default function PinnedTitanio({ tab, activeId, favicon, onClose }: Props): JSX.Element {
  const [failedIcon, setFailedIcon] = useState<string | null>(null)
  const open = (): void => window.titanio.openTitanioTab()

  if (tab) {
    return <TabRow tab={{ ...tab, title: 'Titanio', favicon: tab.favicon || favicon || null }} active={tab.id === activeId} onSelect={open} onClose={onClose} />
  }

  return (
    <button
      onClick={open}
      title="https://app.titanio.ai"
      className="flex items-center gap-2.5 w-full py-1 px-2 rounded-xl [corner-shape:superellipse(1.5)] border border-transparent text-text/75 text-left text-[15px] tracking-[-0.08px] min-h-[29px] hover:bg-bg-hover hover:text-text"
    >
      {favicon && favicon !== failedIcon
        ? <img src={favicon} alt="" className="w-[17px] h-[17px] shrink-0 rounded object-contain" onError={() => setFailedIcon(favicon)} />
        : <IconWorld className="w-[17px] h-[17px] shrink-0 text-text-faint" />}
      <span className="truncate">Titanio</span>
    </button>
  )
}
