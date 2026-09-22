import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react'
import Button from './Button'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  /** 'md' = 32px caja / 17px icono (default), 'sm' = 24px caja / 15px icono */
  size?: 'md' | 'sm'
}

const base = 'grid place-items-center disabled:bg-transparent'

const sizes = {
  md: 'size-8 [&>svg]:w-[17px] [&>svg]:h-[17px]',
  sm: 'size-6 [&>svg]:w-[15px] [&>svg]:h-[15px]'
}

export default function IconButton({ children, size = 'md', className = '', ...rest }: Props): JSX.Element {
  return (
    <Button variant="ghost" className={`${base} ${sizes[size]} ${className}`} {...rest}>
      {children}
    </Button>
  )
}
