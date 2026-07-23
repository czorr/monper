import type { JSX } from 'react'

type P = { className?: string }

export const PlusIcon = ({ className }: P): JSX.Element => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
)
export const SidebarIcon = ({ className }: P): JSX.Element => (
  <svg className={className} width="15" height="15" viewBox="0 0 15 15"><rect x="1.5" y="2.5" width="12" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><line x1="5.5" y1="2.5" x2="5.5" y2="12.5" stroke="currentColor" strokeWidth="1.3" /></svg>
)
export const ChevronDown = ({ className }: P): JSX.Element => (
  <svg className={className} width="13" height="13" viewBox="0 0 13 13"><path d="M3.5 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
export const BackIcon = ({ className }: P): JSX.Element => (
  <svg className={className} width="15" height="15" viewBox="0 0 15 15"><path d="M9.5 3 5 7.5 9.5 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
export const ForwardIcon = ({ className }: P): JSX.Element => (
  <svg className={className} width="15" height="15" viewBox="0 0 15 15"><path d="M5.5 3 10 7.5 5.5 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
export const ReloadIcon = ({ className }: P): JSX.Element => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14"><path d="M12 7a5 5 0 1 1-1.7-3.75M12 1.5V4h-2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
export const CloseIcon = ({ className }: P): JSX.Element => (
  <svg className={className} width="9" height="9" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
)
export const StarIcon = ({ className, filled }: P & { filled?: boolean }): JSX.Element => (
  <svg className={className} width="15" height="15" viewBox="0 0 15 15"><path d="M7.5 1.8l1.65 3.35 3.7.54-2.68 2.6.63 3.68L7.5 10.72 4.2 12.45l.63-3.68L2.15 6.17l3.7-.54z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
)
