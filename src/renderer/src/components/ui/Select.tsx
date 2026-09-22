import type { ComponentPropsWithRef, JSX } from 'react'
import './Select.css'

export interface SelectProps extends Omit<ComponentPropsWithRef<'select'>, 'size' | 'multiple'> {
  size?: 'sm' | 'md'
}

/** Conserva teclado, búsqueda por texto y foco nativos; el control y el menú comparten diseño. */
export default function Select({ size = 'md', className = '', children, ...props }: SelectProps): JSX.Element {
  return (
    <select {...props} data-ui-select={size} className={className}>
      {children}
    </select>
  )
}
