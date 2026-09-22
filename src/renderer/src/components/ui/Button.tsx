import type { ComponentPropsWithRef, JSX } from 'react'

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'custom'
  size?: 'sm' | 'md' | 'icon' | 'custom'
  shape?: 'rounded' | 'pill'
}

const variants = {
  primary: 'bg-white/90 text-black hover:bg-white',
  secondary: 'bg-white/[0.08] text-text hover:bg-white/[0.13]',
  ghost: 'text-text-dim hover:text-text hover:bg-bg-hover',
  danger: 'bg-red-500/15 text-red-400 hover:bg-red-500/25',
  'danger-ghost': 'text-text-faint hover:text-red-400 hover:bg-red-500/15',
  custom: ''
}
const sizes = {
  sm: 'inline-flex items-center justify-center gap-1.5 h-8 px-3 text-[13px] font-medium [&>svg]:size-4',
  md: 'inline-flex items-center justify-center gap-2 h-10 px-4 text-[13.5px] font-medium [&>svg]:size-4',
  icon: 'grid place-items-center size-8 shrink-0 [&>svg]:size-4',
  custom: ''
}

/** Base única para acciones, filas clicables y controles de selección. */
export default function Button({ variant = 'custom', size = 'custom', shape = 'rounded', type = 'button', className = '', ...props }: ButtonProps): JSX.Element {
  return <button {...props} type={type} data-ui-button={shape}
    className={`transition-colors disabled:opacity-40 disabled:cursor-default [-webkit-app-region:no-drag] ${variants[variant]} ${sizes[size]} ${className}`} />
}
