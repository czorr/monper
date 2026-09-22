import type { CSSProperties, JSX } from 'react'
import logo from '@renderer/assets/logo.svg'

interface Props {
  /** Hereda el color del contexto por defecto, también en superficies claras. */
  color?: CSSProperties['color']
  height?: number
  className?: string
  decorative?: boolean
}

/** Logo oficial completo. La máscara usa el alfa del SVG, no su relleno negro. */
export default function TitanioLogo({ color = 'currentColor', height = 16, className = '', decorative = false }: Props): JSX.Element {
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'Titanio'}
      aria-hidden={decorative || undefined}
      className={`titanio-logo inline-block shrink-0 align-middle ${className}`}
      style={{
        width: height * 2454 / 501,
        height,
        backgroundColor: color,
        maskImage: `url(${JSON.stringify(logo)})`,
        WebkitMaskImage: `url(${JSON.stringify(logo)})`,
        maskMode: 'alpha',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center'
      }}
    />
  )
}
