import type { JSX } from 'react'
import { Avatar } from './ui'
import { ChevronDown } from './Icons'

interface Props {
  initials: string
  name: string
  onOpen: (rect: DOMRect) => void
}

export default function AccountPill({ initials, name, onOpen }: Props): JSX.Element {
  return (
    <button id="profile-btn" onClick={(e) => onOpen((e.currentTarget as HTMLElement).getBoundingClientRect())}>
      <Avatar initials={initials} />
      <span className="account-name">{name}</span>
      <ChevronDown className="acc-chev" />
    </button>
  )
}
