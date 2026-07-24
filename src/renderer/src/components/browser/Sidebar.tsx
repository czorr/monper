import type { JSX } from 'react'
import type { BrowserState, Bookmark, Profile } from '@shared/types'
import AccountPill from './AccountPill'
import TabList from './TabList'
import TabRow from './TabRow'
import BookmarkRow from './BookmarkRow'
import { IconButton, SectionLabel } from '@renderer/components/ui'
import { PlusIcon, SidebarIcon } from '@renderer/lib/icons'
import MonperMark from '@renderer/assets/monper.png'

interface Props {
  state: BrowserState
  profile: Profile
  bookmarks: Bookmark[]
  collapsed: boolean
  onOpenBookmark: (url: string) => void
  onOpenMenu: (rect: DOMRect) => void
  onCollapse: () => void
  onNewTab: () => void
  onSelectTab: (id: number) => void
  onCloseTab: (id: number) => void
  onReorderTabs: (ids: number[]) => void
}

const newRowClass =
  'flex items-center gap-2.5 w-full py-1.5 px-2 rounded-lg text-text-faint text-left text-[15px] ' +
  'min-h-[30px] hover:bg-bg-hover hover:text-text [&>svg]:opacity-80 [&>svg]:w-[15px] [&>svg]:h-[15px]'

export default function Sidebar({ state, profile, bookmarks, collapsed, onOpenBookmark, onOpenMenu, onCollapse, onNewTab, onSelectTab, onCloseTab, onReorderTabs }: Props): JSX.Element {
  // Las pestañas ligadas a un bookmark se muestran en su slot de bookmarks, no en Tabs.
  const userTabs = state.tabs.filter((t) => !t.agent && !t.bookmarkId)
  const agentTabs = state.tabs.filter((t) => t.agent)
  const liveBookmark = (id: string): (typeof state.tabs)[number] | undefined =>
    state.tabs.find((t) => t.bookmarkId === id)
  const closeOthers = (): void => userTabs.forEach((t) => t.id !== state.activeId && onCloseTab(t.id))

  return (
    <aside className={`group fixed inset-y-0 left-0 w-sidebar flex flex-col pb-3 px-2.5 ${collapsed ? 'hidden' : ''}`}>
      {/* Row del semáforo nativo (izquierda) + colapsar (derecha) */}
      <div className="h-11 shrink-0 flex items-center justify-end [-webkit-app-region:drag]">
        <IconButton size="sm" title="Colapsar sidebar (⌘S)" onClick={onCollapse}>
          <SidebarIcon />
        </IconButton>
      </div>

      <div className="flex items-center justify-between gap-1 pt-1 pr-1 pb-3.5 pl-0 [-webkit-app-region:drag]">
        <AccountPill initials={profile.initials} name={profile.name} avatar={profile.avatar} onOpen={onOpenMenu} />
        <IconButton size="sm" title="Nueva pestaña (⌘T)" onClick={onNewTab}>
          <PlusIcon />
        </IconButton>
      </div>

      {bookmarks.length > 0 && (
        <div className="shrink-0 mb-1">
          <SectionLabel label="Bookmarks" />
          <div className="flex flex-col gap-px max-h-[35vh] overflow-y-auto [&::-webkit-scrollbar]:w-0">
            {bookmarks.map((b) => {
              const live = liveBookmark(b.id)
              return live ? (
                <TabRow key={b.id} tab={live} active={live.id === state.activeId} onSelect={onSelectTab} onClose={onCloseTab} />
              ) : (
                <BookmarkRow key={b.id} bookmark={b} onOpen={onOpenBookmark} />
              )
            })}
          </div>
        </div>
      )}

      <SectionLabel label="Tabs" action={{ label: 'Clear', title: 'Cerrar todas menos la activa', onClick: closeOthers }} />

      <button className={newRowClass} onClick={onNewTab}>
        <PlusIcon />
        <span>New tab</span>
      </button>

      <TabList tabs={userTabs} activeId={state.activeId} onSelect={onSelectTab} onClose={onCloseTab} onReorder={onReorderTabs} />

      {agentTabs.length > 0 && (
        <div className="shrink-0 mt-1.5">
          <div className="flex items-center gap-1.5 px-2 pb-1 text-[12px] font-medium text-text-faint [&>img]:w-3.5 [&>img]:h-3.5 [&>img]:opacity-80">
            <img src={MonperMark} alt="" />
            <span>Agent tabs</span>
          </div>
          <div className="flex flex-col gap-px max-h-[40vh] overflow-y-auto [&::-webkit-scrollbar]:w-0">
            {agentTabs.map((t) => (
              <TabRow key={t.id} tab={t} active={t.id === state.activeId} onSelect={onSelectTab} onClose={onCloseTab} />
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
