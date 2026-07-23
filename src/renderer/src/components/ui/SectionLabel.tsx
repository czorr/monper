import type { JSX } from 'react'

interface Props {
  label: string
  action?: { label: string; title?: string; onClick: () => void }
}

export default function SectionLabel({ label, action }: Props): JSX.Element {
  return (
    <div className="section-label">
      <span>{label}</span>
      {action && (
        <button className="text-btn" title={action.title} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
