import type { JSX } from 'react'

interface Props {
  label: string
  action?: { label: string; title?: string; onClick: () => void }
}

export default function SectionLabel({ label, action }: Props): JSX.Element {
  return (
    <div className="flex items-center justify-between py-0.5 px-2 pt-2 text-[12px] font-semibold text-text-dim tracking-[0.1px]">
      <span>{label}</span>
      {action && (
        <button
          className="text-[11.5px] text-text-faint py-0.5 px-1.5 rounded-md opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-bg-hover hover:text-text-dim"
          title={action.title}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
