import { t as tr, useLocale } from '@renderer/lib/i18n'
import type { JSX } from 'react'
import type { ProfileIcon } from '@shared/profiles'
import { Avatar } from '@renderer/components/ui'
import { ChevronDown } from '@renderer/lib/icons'

interface Props {
  initials: string
  name: string
  avatar?: string | null
  color?: string
  icon?: ProfileIcon
  onOpen: (rect: DOMRect) => void
}

export default function AccountPill({ initials, name, avatar, color, icon, onOpen }: Props): JSX.Element {
  useLocale()
  return (
    <button
      title={name}
      aria-label={tr("Abrir menú de {0}", name)}
      aria-haspopup="menu"
      onPointerEnter={() => window.titanio.warmProfileMenu()}
      onFocus={() => window.titanio.warmProfileMenu()}
      onClick={(e) => onOpen((e.currentTarget as HTMLElement).getBoundingClientRect())}
      className="flex items-center gap-2 h-10 px-2.5 rounded-[18px] [corner-shape:superellipse(1.5)] hover:bg-bg-hover [-webkit-app-region:no-drag]"
    >
      <Avatar initials={initials} src={avatar} color={color} icon={icon} size="xs" />
      <ChevronDown className="w-3.5 h-3.5 shrink-0 text-text-faint" />
    </button>
  )
}
