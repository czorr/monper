import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  /** 'subtle' = 24px atenuado, 'default' = 28px estándar */
  variant?: 'default' | 'subtle'
}

const base =
  'grid place-items-center rounded-lg transition-colors [-webkit-app-region:no-drag] ' +
  'disabled:opacity-30 disabled:bg-transparent'

const variants = {
  default: 'w-7 h-7 text-text-dim hover:bg-bg-hover hover:text-text [&>svg]:w-[17px] [&>svg]:h-[17px]',
  subtle: 'w-6 h-6 text-text-faint hover:text-text [&>svg]:w-[15px] [&>svg]:h-[15px]'
}

export default function IconButton({ children, variant = 'default', className = '', ...rest }: Props): JSX.Element {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}
