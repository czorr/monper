import { useEffect, type JSX } from 'react'
import { Avatar, MenuLabel, MenuDivider, MenuItem } from '@renderer/components/ui'
import IconChevronRight from '~icons/tabler/chevron-right'
import IconCheck from '~icons/tabler/check'
import IconDots from '~icons/tabler/dots'
import IconUserPlus from '~icons/tabler/user-plus'
import IconBookmark from '~icons/tabler/bookmark'
import IconDownload from '~icons/tabler/download'
import IconPuzzle from '~icons/tabler/puzzle'
import IconHistory from '~icons/tabler/history'
import IconCode from '~icons/tabler/code'
import IconSettings from '~icons/tabler/settings'
import IconPlus from '~icons/tabler/plus'
import IconSpy from '~icons/tabler/spy'

const { monper } = window

const Chevron = (): JSX.Element => <IconChevronRight />

const Ic = {
  newProfile: <IconUserPlus />,
  bookmarks: <IconBookmark />,
  downloads: <IconDownload />,
  extensions: <IconPuzzle />,
  history: <IconHistory />,
  developers: <IconCode />,
  settings: <IconSettings />,
  newTab: <IconPlus />,
  incognito: <IconSpy />
}

export default function ProfileMenu(): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') monper.closeMenu() }
    window.addEventListener('keydown', onKey)
    // Ajusta la ventana del menú a la altura real del contenido (sin hueco).
    const root = document.getElementById('menu-root')
    if (root) monper.resizeMenu(Math.ceil(root.getBoundingClientRect().height))
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div id="menu-root" className="p-1.5 overflow-hidden">
      <MenuLabel>Profiles</MenuLabel>

      <button
        className="flex items-center gap-2.5 h-[34px] px-2.5 rounded-lg text-text w-full text-left hover:bg-bg-hover"
        onClick={() => monper.menuAction('switch-profile')}
      >
        <Avatar initials="LC" size="sm" />
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">Luis Carlos Zorrilla</span>
        <span className="text-text-faint text-[13px] flex items-center gap-2 shrink-0 [&>svg]:w-[15px] [&>svg]:h-[15px]">
          <IconCheck />
          <IconDots />
        </span>
      </button>

      <MenuItem icon={Ic.newProfile} name="New profile" onClick={() => monper.menuAction('new-profile')} />

      <MenuDivider />

      <MenuItem icon={Ic.bookmarks} name="Bookmarks" meta={<Chevron />} onClick={() => monper.menuAction('bookmarks')} />
      <MenuItem icon={Ic.downloads} name="Downloads" meta={<Chevron />} onClick={() => monper.menuAction('downloads')} />
      <MenuItem icon={Ic.extensions} name="Extensions" meta={<Chevron />} onClick={() => monper.menuAction('extensions')} />
      <MenuItem icon={Ic.history} name="History" meta={<Chevron />} onClick={() => monper.menuAction('history')} />
      <MenuItem icon={Ic.developers} name="Developers" meta={<Chevron />} onClick={() => monper.menuAction('developers')} />
      <MenuItem icon={Ic.settings} name="Settings" meta="⌘," onClick={() => monper.menuAction('settings')} />

      <MenuDivider />

      <MenuItem icon={Ic.newTab} name="New Tab" meta="⌘T" onClick={() => monper.menuAction('new-tab')} />
      <MenuItem icon={Ic.incognito} name="Incognito Window" meta="⇧⌘N" onClick={() => monper.menuAction('incognito')} />
    </div>
  )
}
