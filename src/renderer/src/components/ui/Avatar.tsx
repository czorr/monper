import type { JSX } from 'react'

interface Props {
  initials: string
  /** 'md' = 24px (sidebar), 'sm' = 22px (dropdown) */
  size?: 'md' | 'sm'
}

export default function Avatar({ initials, size = 'md' }: Props): JSX.Element {
  return <div className={size === 'sm' ? 'avatar-sm' : 'avatar'}>{initials}</div>
}
