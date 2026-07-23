import type { JSX } from 'react'
import { Avatar } from '@renderer/components/ui'
import { ChevronDown } from '@renderer/lib/icons'

interface Props {
  initials: string
  name: string
  onOpen: (rect: DOMRect) => void
}

export default function AccountPill({ initials, name, onOpen }: Props): JSX.Element {
  return (
    <button
      onClick={(e) => onOpen((e.currentTarget as HTMLElement).getBoundingClientRect())}
      className="flex-1 min-w-0 flex items-center gap-0.5 py-1.5 px-2 rounded-lg hover:bg-bg-hover [-webkit-app-region:no-drag]"
    >
      <div className="flex items-center gap-2">
        <Avatar initials={initials} />
        <span className="flex-1 text-[14px] font-semibold overflow-hidden text-ellipsis whitespace-nowrap tracking-[-0.1px]">
          {name}
        </span>
      </div>
      <ChevronDown className="text-text-faint shrink-0 w-3.5 h-3.5" />
    </button>
  )
}
