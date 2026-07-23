import type { JSX } from 'react'
import type { BrowserState } from '../../../shared/types'
import AccountPill from './AccountPill'
import TabList from './TabList'
import { IconButton, SectionLabel } from './ui'
import { PlusIcon, SidebarIcon } from './Icons'

interface Props {
  state: BrowserState
  onOpenMenu: (rect: DOMRect) => void
  onCollapse: () => void
  onNewTab: () => void
  onSelectTab: (id: number) => void
  onCloseTab: (id: number) => void
}

export default function Sidebar({ state, onOpenMenu, onCollapse, onNewTab, onSelectTab, onCloseTab }: Props): JSX.Element {
  const closeOthers = (): void => state.tabs.forEach((t) => t.id !== state.activeId && onCloseTab(t.id))

  return (
    <aside id="sidebar">
      <div className="drag-region" />

      <div className="account">
        <AccountPill initials="LC" name="Luis Carlos" onOpen={onOpenMenu} />
        <IconButton variant="subtle" title="Colapsar sidebar (⌘S)" onClick={onCollapse}>
          <SidebarIcon />
        </IconButton>
        <IconButton variant="subtle" title="Nueva pestaña (⌘T)" onClick={onNewTab}>
          <PlusIcon />
        </IconButton>
      </div>

      <SectionLabel label="Tabs" action={{ label: 'Clear', title: 'Cerrar todas menos la activa', onClick: closeOthers }} />

      <button className="row new-row" onClick={onNewTab}>
        <PlusIcon />
        <span>New tab</span>
      </button>

      <TabList tabs={state.tabs} activeId={state.activeId} onSelect={onSelectTab} onClose={onCloseTab} />
    </aside>
  )
}
