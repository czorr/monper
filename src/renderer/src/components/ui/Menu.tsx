import type { JSX, ReactNode } from 'react'

export function MenuLabel({ children }: { children: ReactNode }): JSX.Element {
  return <div className="m-label">{children}</div>
}

export function MenuDivider(): JSX.Element {
  return <div className="m-divider" />
}

interface MenuItemProps {
  icon?: ReactNode
  name: string
  meta?: ReactNode
  onClick?: () => void
}

export function MenuItem({ icon, name, meta, onClick }: MenuItemProps): JSX.Element {
  return (
    <button className="m-item" onClick={onClick}>
      {icon && <span className="ico">{icon}</span>}
      <span className="name">{name}</span>
      {meta && <span className="meta">{meta}</span>}
    </button>
  )
}
