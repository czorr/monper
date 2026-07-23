import type { JSX, ReactNode } from 'react'

export function MenuLabel({ children }: { children: ReactNode }): JSX.Element {
  return <div className="text-[12px] text-text-faint py-1.5 px-2.5 pt-1.5 font-medium">{children}</div>
}

export function MenuDivider(): JSX.Element {
  return <div className="h-px bg-border my-1.5 mx-2" />
}

interface MenuItemProps {
  icon?: ReactNode
  name: string
  meta?: ReactNode
  onClick?: () => void
}

export const menuItemClass =
  'flex items-center gap-2.5 h-[34px] px-2.5 rounded-lg text-text w-full text-left hover:bg-bg-hover'

export function MenuItem({ icon, name, meta, onClick }: MenuItemProps): JSX.Element {
  return (
    <button className={menuItemClass} onClick={onClick}>
      {icon && <span className="w-[18px] grid place-items-center text-text-dim shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{name}</span>
      {meta && (
        <span className="text-text-faint text-[13px] flex items-center gap-2 shrink-0 [&>svg]:w-[15px] [&>svg]:h-[15px]">
          {meta}
        </span>
      )}
    </button>
  )
}
