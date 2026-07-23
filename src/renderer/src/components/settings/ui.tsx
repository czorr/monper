import type { JSX, ReactNode } from 'react'

export function Card({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05] overflow-hidden">
      {children}
    </div>
  )
}

export function Group({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="mb-9">
      <h2 className="text-[13px] font-medium text-text-faint mb-3">{title}</h2>
      {children}
    </section>
  )
}

export function Row({
  icon,
  label,
  desc,
  children
}: {
  icon?: ReactNode
  label: string
  desc?: string
  children?: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
      {icon && (
        <span className="w-8 h-8 rounded-lg grid place-items-center bg-white/[0.05] text-text-dim shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px]">
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] text-text leading-tight">{label}</div>
        {desc && <div className="text-[12.5px] text-text-dim mt-0.5 truncate">{desc}</div>}
      </div>
      {children}
    </div>
  )
}

export function Pill({ children, onClick }: { children: ReactNode; onClick?: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[13px] text-text-dim transition-colors"
    >
      {children}
    </button>
  )
}
