import type { JSX, SVGProps } from 'react'
import IconStar from '~icons/tabler/star'
import IconStarFilled from '~icons/tabler/star-filled'

// Iconos del chrome, todos de Tabler vía Iconify (unplugin-icons, offline).
export { default as PlusIcon } from '~icons/tabler/plus'
export { default as SidebarIcon } from '~icons/tabler/layout-sidebar'
export { default as ChevronDown } from '~icons/tabler/chevron-down'
export { default as BackIcon } from '~icons/tabler/chevron-left'
export { default as ForwardIcon } from '~icons/tabler/chevron-right'
export { default as ReloadIcon } from '~icons/tabler/reload'
export { default as CloseIcon } from '~icons/tabler/x'

export function StarIcon({ filled, ...props }: SVGProps<SVGSVGElement> & { filled?: boolean }): JSX.Element {
  return filled ? <IconStarFilled {...props} /> : <IconStar {...props} />
}
