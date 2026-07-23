import type { JSX } from 'react'
import type { BrowserState } from '@shared/types'
import AccountPill from './AccountPill'
import TabList from './TabList'
import { IconButton, SectionLabel } from '@renderer/components/ui'
import { PlusIcon, SidebarIcon } from '@renderer/lib/icons'

interface Props {
  state: BrowserState
  collapsed: boolean
  onOpenMenu: (rect: DOMRect) => void
  onCollapse: () => void
  onNewTab: () => void
  onSelectTab: (id: number) => void
  onCloseTab: (id: number) => void
}

const newRowClass =
  'flex items-center gap-2.5 w-full py-1.5 px-2 rounded-lg text-text-faint text-left text-[14px] ' +
  'min-h-[30px] hover:bg-bg-hover hover:text-text [&>svg]:opacity-80 [&>svg]:w-[15px] [&>svg]:h-[15px]'

export default function Sidebar({ state, collapsed, onOpenMenu, onCollapse, onNewTab, onSelectTab, onCloseTab }: Props): JSX.Element {
  const closeOthers = (): void => state.tabs.forEach((t) => t.id !== state.activeId && onCloseTab(t.id))

  return (
    <aside className={`group fixed inset-y-0 left-0 w-sidebar flex flex-col pb-3 px-2.5 ${collapsed ? 'hidden' : ''}`}>
      {/* Row del semáforo nativo (izquierda) + colapsar (derecha) */}
      <div className="h-11 shrink-0 flex items-center justify-end [-webkit-app-region:drag]">
        <IconButton size="sm" title="Colapsar sidebar (⌘S)" onClick={onCollapse}>
          <SidebarIcon />
        </IconButton>
      </div>

      <div className="flex items-center justify-between gap-1 pt-1 pr-1 pb-3.5 pl-0 [-webkit-app-region:drag]">
        <AccountPill initials="LC" name="Luis Carlos" onOpen={onOpenMenu} />
        <IconButton size="sm" title="Nueva pestaña (⌘T)" onClick={onNewTab}>
          <PlusIcon />
        </IconButton>
      </div>

      <SectionLabel label="Tabs" action={{ label: 'Clear', title: 'Cerrar todas menos la activa', onClick: closeOthers }} />

      <button className={newRowClass} onClick={onNewTab}>
        <PlusIcon />
        <span>New tab</span>
      </button>

      <TabList tabs={state.tabs} activeId={state.activeId} onSelect={onSelectTab} onClose={onCloseTab} />
    </aside>
  )
}
