import { createRoot } from 'react-dom/client'
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import type { Profile } from '@shared/types'
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
import './styles.css'

const pm = window.profilemenu
const Chevron = (): JSX.Element => <IconChevronRight />

function ProfileMenuWindow(): JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null)
  const [profile, setProfile] = useState<Profile>({ name: 'Tú', initials: '?', avatar: null })
  useEffect(() => pm.onProfile(setProfile), [])
  useLayoutEffect(() => { if (boxRef.current) pm.reportHeight(Math.ceil(boxRef.current.getBoundingClientRect().height)) }, [profile])

  const act = (name: string): void => pm.action(name)

  return (
    <div className="p-3">
      <div ref={boxRef} className="py-1.5 rounded-2xl border border-white/10 bg-[#1c1c20] shadow-xl shadow-black/50 overflow-hidden">
        <MenuLabel>Profiles</MenuLabel>

        <button
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13.5px] text-text text-left hover:bg-white/[0.05]"
          onClick={() => act('switch-profile')}
        >
          <Avatar initials={profile.initials} src={profile.avatar} size="sm" />
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{profile.name}</span>
          <span className="text-[12px] text-text-faint flex items-center gap-2 shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">
            <IconCheck />
            <IconDots />
          </span>
        </button>

        <MenuItem icon={<IconUserPlus />} name="New profile" onClick={() => act('new-profile')} />
        <MenuDivider />
        <MenuItem icon={<IconBookmark />} name="Bookmarks" meta={<Chevron />} onClick={() => act('bookmarks')} />
        <MenuItem icon={<IconDownload />} name="Downloads" meta={<Chevron />} onClick={() => act('downloads')} />
        <MenuItem icon={<IconPuzzle />} name="Extensions" meta={<Chevron />} onClick={() => act('extensions')} />
        <MenuItem icon={<IconHistory />} name="History" meta={<Chevron />} onClick={() => act('history')} />
        <MenuItem icon={<IconCode />} name="Developers" meta={<Chevron />} onClick={() => act('developers')} />
        <MenuItem icon={<IconSettings />} name="Settings" meta="⌘," onClick={() => act('settings')} />
        <MenuDivider />
        <MenuItem icon={<IconPlus />} name="New Tab" meta="⌘T" onClick={() => act('new-tab')} />
        <MenuItem icon={<IconSpy />} name="Incognito Window" meta="⇧⌘N" onClick={() => act('incognito')} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<ProfileMenuWindow />)
