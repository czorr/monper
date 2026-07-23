import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  /** 'md' = 28px caja / 17px icono (default), 'sm' = 24px caja / 15px icono */
  size?: 'md' | 'sm'
}

const base =
  'grid place-items-center rounded-lg transition-colors text-text-dim ' +
  'hover:bg-bg-hover hover:text-text disabled:opacity-30 disabled:bg-transparent ' +
  '[-webkit-app-region:no-drag]'

const sizes = {
  md: 'size-8 [&>svg]:w-[17px] [&>svg]:h-[17px]',
  sm: 'size-6 [&>svg]:w-[15px] [&>svg]:h-[15px]'
}

export default function IconButton({ children, size = 'md', className = '', ...rest }: Props): JSX.Element {
  return (
    <button className={`${base} ${sizes[size]} ${className}`} {...rest}>
      {children}
    </button>
  )
}
