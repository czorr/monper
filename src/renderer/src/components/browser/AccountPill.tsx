import type { JSX } from 'react'
import { Avatar } from '@renderer/components/ui'
import { ChevronDown } from '@renderer/lib/icons'

interface Props {
  initials: string
  name: string
  avatar?: string | null
  onOpen: (rect: DOMRect) => void
}

export default function AccountPill({ initials, name, avatar, onOpen }: Props): JSX.Element {
  return (
    <button
      onClick={(e) => onOpen((e.currentTarget as HTMLElement).getBoundingClientRect())}
      className="flex items-center gap-0.5 py-1 px-2 rounded-lg hover:bg-bg-hover [-webkit-app-region:no-drag] max-w-full min-w-0"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Avatar initials={initials} src={avatar} />
        <span className="text-[14px] font-semibold truncate max-w-[150px] tracking-[-0.1px]">
          {name}
        </span>
      </div>
      <ChevronDown className="text-text-faint shrink-0 w-3.5 h-3.5" />
    </button>
  )
}
