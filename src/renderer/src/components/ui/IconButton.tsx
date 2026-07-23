import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  /** 'subtle' usa el tamaño/color atenuado (24px), 'default' el estándar (28px) */
  variant?: 'default' | 'subtle'
}

export default function IconButton({ children, variant = 'default', className = '', ...rest }: Props): JSX.Element {
  const cls = ['icon-btn', variant === 'subtle' ? 'subtle' : '', className].filter(Boolean).join(' ')
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  )
}
