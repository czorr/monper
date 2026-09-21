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

const { titanio } = window
const Chevron = (): JSX.Element => <IconChevronRight />

interface Props {
  /** posición del botón de perfil, para anclar el dropdown debajo */
  anchor: DOMRect
  onClose: () => void
}

export default function ProfileMenu({ anchor, onClose }: Props): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const act = (action: string): void => {
    switch (action) {
      case 'new-tab':
      case 'bookmarks':
        titanio.newTab()
        break
      case 'settings':
        titanio.openSettings()
        break
      case 'developers':
        titanio.openDevtools()
        break
      case 'downloads':
        titanio.openDownloads()
        break
      // TODO (features aún no construidas): new-profile, switch-profile, extensions, history, incognito
    }
    onClose()
  }

  return (
    <>
      {/* click-catcher: cierra al hacer click fuera (dentro del chrome) */}
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />

      <div
        className="fixed z-50 w-60 py-1.5 rounded-2xl border border-white/10 bg-[#1c1c20]/95 shadow-2xl shadow-black/50 overflow-hidden"
        style={{ left: anchor.left, top: anchor.bottom + 6 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <MenuLabel>Profiles</MenuLabel>

        <button
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13.5px] text-text text-left hover:bg-white/[0.05]"
          onClick={() => act('switch-profile')}
        >
          <Avatar initials="LC" size="sm" />
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">Luis Carlos Zorrilla</span>
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
    </>
  )
}
