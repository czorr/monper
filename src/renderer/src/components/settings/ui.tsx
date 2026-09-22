import type { JSX, ReactNode } from 'react'

interface SettingsHeaderProps {
  title: string
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
}

export function SettingsHeader({ title, description, icon, actions }: SettingsHeaderProps): JSX.Element {
  return (
    <header className="mb-9">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          {icon && <span className="shrink-0">{icon}</span>}
          <h1 className="text-[30px] leading-9 font-semibold tracking-tight break-words min-w-0">{title}</h1>
        </div>
        {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
      </div>
      {description && <p className="mt-3 text-[13.5px] leading-relaxed text-text-dim">{description}</p>}
    </header>
  )
}

/** El mismo margen de entrada, también en las secciones con navegación propia. */
export function SettingsContent({ children }: { children: ReactNode }): JSX.Element {
  return <div className="max-w-[680px] mx-auto px-8 py-12">{children}</div>
}

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

/** Interruptor de dos estados: aquí no existe "preguntar", eso es olvidar la decisión. */
export function Toggle({
  on,
  onChange,
  disabled
}: {
  on: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={
        'relative w-[38px] h-[22px] rounded-full shrink-0 transition-colors disabled:opacity-40 ' +
        (on ? 'bg-emerald-500/80' : 'bg-white/[0.14]')
      }
    >
      <span
        className={
          'absolute top-[3px] w-4 h-4 rounded-full bg-white transition-[left] duration-150 ' +
          (on ? 'left-[19px]' : 'left-[3px]')
        }
      />
    </button>
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
