import { createRoot } from 'react-dom/client'
import { useEffect, useState, type JSX } from 'react'
import type { Profile } from '@shared/types'
import { Avatar } from '@renderer/components/ui'
import { PopoverPanel, PopoverRow, PopoverLabel, PopoverDivider } from '@renderer/components/popover'
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
  const [profile, setProfile] = useState<Profile>({ name: 'Tú', initials: '?', avatar: null })
  useEffect(() => pm.onProfile(setProfile), [])
  const act = (name: string): void => pm.action(name)

  return (
    <PopoverPanel onHeight={pm.reportHeight} measure={profile}>
      <PopoverLabel>Profiles</PopoverLabel>

      <PopoverRow
        icon={<Avatar initials={profile.initials} src={profile.avatar} size="sm" />}
        label={profile.name}
        active
        onClick={() => act('switch-profile')}
        meta={<><IconCheck className="w-3.5 h-3.5" /><IconDots className="w-3.5 h-3.5" /></>}
      />
      <PopoverRow icon={<IconUserPlus />} label="New profile" onClick={() => act('new-profile')} />

      <PopoverDivider />
      <PopoverRow icon={<IconBookmark />} label="Bookmarks" meta={<Chevron />} onClick={() => act('bookmarks')} />
      <PopoverRow icon={<IconDownload />} label="Downloads" meta={<Chevron />} onClick={() => act('downloads')} />
      <PopoverRow icon={<IconPuzzle />} label="Extensions" meta={<Chevron />} onClick={() => act('extensions')} />
      <PopoverRow icon={<IconHistory />} label="History" meta={<Chevron />} onClick={() => act('history')} />
      <PopoverRow icon={<IconCode />} label="Developers" meta={<Chevron />} onClick={() => act('developers')} />
      <PopoverRow icon={<IconSettings />} label="Settings" meta="⌘," onClick={() => act('settings')} />

      <PopoverDivider />
      <PopoverRow icon={<IconPlus />} label="New Tab" meta="⌘T" onClick={() => act('new-tab')} />
      <PopoverRow icon={<IconSpy />} label="Incognito Window" meta="⇧⌘N" onClick={() => act('incognito')} />
    </PopoverPanel>
  )
}

createRoot(document.getElementById('root')!).render(<ProfileMenuWindow />)
