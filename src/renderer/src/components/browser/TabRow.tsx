import type { JSX } from 'react'
import type { TabInfo } from '@shared/types'
import { domainOf } from '@renderer/lib/dom'
import { CloseIcon } from '@renderer/lib/icons'

interface Props {
  tab: TabInfo
  active: boolean
  onSelect: (id: number) => void
  onClose: (id: number) => void
}

const rowBase =
  'group/tab flex items-center gap-2.5 w-full py-1.5 px-2 rounded-lg text-left text-[14px] min-h-[30px]'

export default function TabRow({ tab, active, onSelect, onClose }: Props): JSX.Element {
  const state = active
    ? 'bg-bg-active text-text backdrop-blur-sm'
    : 'text-text-dim hover:bg-bg-hover hover:text-text'

  return (
    <div
      className={`${rowBase} ${state}`}
      onClick={() => onSelect(tab.id)}
      onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
    >
      {tab.loading ? (
        <div className="w-3 h-3 m-0.5 shrink-0 rounded-full border-[1.5px] border-text-faint border-t-text animate-spin" />
      ) : tab.favicon ? (
        <img
          className="w-4 h-4 shrink-0 rounded object-contain"
          src={tab.favicon}
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
        />
      ) : (
        <span className="w-4 h-4 shrink-0 rounded bg-bg-elev" />
      )}

      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[14px] tracking-[-0.08px]">
        {tab.title || domainOf(tab.url) || 'New tab'}
      </span>

      <button
        className="w-[18px] h-[18px] grid place-items-center rounded-md text-text-faint shrink-0 opacity-0 group-hover/tab:opacity-100 hover:text-text hover:bg-white/15 [&>svg]:w-[13px] [&>svg]:h-[13px]"
        title="Cerrar"
        onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}
      >
        <CloseIcon />
      </button>
    </div>
  )
}
