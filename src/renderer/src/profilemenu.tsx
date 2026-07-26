import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState, type JSX } from 'react'
import type { Profile, SubmenuSection } from '@shared/types'
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

/**
 * Fila que abre un submenú al pasar el ratón por encima.
 *
 * El submenú es otra ventana nativa (sale fuera de este panel), así que aquí solo se manda la
 * sección y la posición vertical de la fila; el main la coloca al lado. Al salir NO se cierra
 * de inmediato: el puntero tiene que poder cruzar el hueco hasta el submenú, igual que en el
 * peek del sidebar.
 */
function RowConSubmenu({ section, icon, label }: { section: SubmenuSection; icon: JSX.Element; label: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      onMouseEnter={() => {
        const r = ref.current?.getBoundingClientRect()
        if (r) pm.submenu(section, { top: Math.round(r.top), height: Math.round(r.height) })
      }}
    >
      <PopoverRow icon={icon} label={label} meta={<Chevron />} onClick={() => {
        const r = ref.current?.getBoundingClientRect()
        if (r) pm.submenu(section, { top: Math.round(r.top), height: Math.round(r.height) })
      }} />
    </div>
  )
}

function ProfileMenuWindow(): JSX.Element {
  const [profile, setProfile] = useState<Profile>({ name: 'Tú', initials: '?', avatar: null })
  useEffect(() => pm.onProfile(setProfile), [])
  const act = (name: string): void => pm.action(name)

  // Pasar por cualquier fila SIN submenú lo cierra: es lo que se espera de un menú.
  return (
    <PopoverPanel onHeight={pm.reportHeight} measure={profile}>
      <div onMouseEnter={() => pm.submenuMaybeClose()}>
        <PopoverLabel>Profiles</PopoverLabel>

      <PopoverRow
        icon={<Avatar initials={profile.initials} src={profile.avatar} size="sm" />}
        label={profile.name}
        active
        onClick={() => act('switch-profile')}
        meta={<><IconCheck className="w-3.5 h-3.5" /><IconDots className="w-3.5 h-3.5" /></>}
      />
        <PopoverRow icon={<IconUserPlus />} label="New profile" onClick={() => act('new-profile')} />
      </div>

      <PopoverDivider />
      <RowConSubmenu section="bookmarks" icon={<IconBookmark />} label="Bookmarks" />
      <RowConSubmenu section="downloads" icon={<IconDownload />} label="Downloads" />
      <RowConSubmenu section="extensions" icon={<IconPuzzle />} label="Extensions" />
      <RowConSubmenu section="history" icon={<IconHistory />} label="History" />
      <RowConSubmenu section="developers" icon={<IconCode />} label="Developers" />
      <div onMouseEnter={() => pm.submenuMaybeClose()}>
        <PopoverRow icon={<IconSettings />} label="Settings" meta="⌘," onClick={() => act('settings')} />
      </div>

      <PopoverDivider />
      <PopoverRow icon={<IconPlus />} label="New Tab" meta="⌘T" onClick={() => act('new-tab')} />
      <PopoverRow icon={<IconSpy />} label="Incognito Window" meta="⇧⌘N" onClick={() => act('incognito')} />
    </PopoverPanel>
  )
}

createRoot(document.getElementById('root')!).render(<ProfileMenuWindow />)
