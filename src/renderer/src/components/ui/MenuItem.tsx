import type { JSX, ReactNode } from 'react'

export function MenuLabel({ children }: { children: ReactNode }): JSX.Element {
  return <div className="px-3 py-1.5 text-[11px] font-medium text-text-faint">{children}</div>
}

export function MenuDivider(): JSX.Element {
  return <div className="h-px bg-border my-1.5" />
}

interface MenuItemProps {
  icon?: ReactNode
  name: string
  meta?: ReactNode
  onClick?: () => void
}

// Diseño canónico de item de dropdown (mismo que las sugerencias del omnibox).
export const menuItemClass =
  'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13.5px] text-text text-left hover:bg-white/[0.05]'

export function MenuItem({ icon, name, meta, onClick }: MenuItemProps): JSX.Element {
  return (
    <button className={menuItemClass} onClick={onClick}>
      {icon && <span className="w-4 h-4 grid place-items-center text-text-faint shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{name}</span>
      {meta && (
        <span className="text-[12px] text-text-faint flex items-center gap-2 shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">
          {meta}
        </span>
      )}
    </button>
  )
}
