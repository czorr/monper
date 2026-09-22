import type { JSX } from 'react'
import { Avatar } from '@renderer/components/ui'

interface Props {
  initials: string
  name: string
  avatar?: string | null
  onOpen: (rect: DOMRect) => void
}

export default function AccountPill({ initials, name, avatar, onOpen }: Props): JSX.Element {
  return (
    <button
      title={name}
      aria-label={`Abrir menú de ${name}`}
      aria-haspopup="menu"
      onPointerEnter={() => window.titanio.warmProfileMenu()}
      onFocus={() => window.titanio.warmProfileMenu()}
      onClick={(e) => onOpen((e.currentTarget as HTMLElement).getBoundingClientRect())}
      className="grid place-items-center w-10 h-10 rounded-lg hover:bg-bg-hover [-webkit-app-region:no-drag]"
    >
      <Avatar initials={initials} src={avatar} />
    </button>
  )
}
