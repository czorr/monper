import type { JSX } from 'react'
import logo from '@renderer/assets/titanio.png'

/**
 * El iso de Titanio, recolorable.
 *
 * El PNG es blanco sobre transparente, y el topbar se pinta con el color REAL de la página:
 * sobre un sitio de fondo claro el iso desaparecía. Un `<img>` no se puede recolorear, así
 * que se usa el **alfa del PNG como máscara** y se rellena con `currentColor`.
 *
 * Por eso no lleva color propio: hereda el del texto de al lado. Y como `.on-light` redefine
 * los tokens del tema (ver styles.css), en una página clara se vuelve oscuro **solo**, sin
 * condicionales en cada sitio donde se use.
 */
export default function TitanioMark({ className = '' }: { className?: string }): JSX.Element {
  return (
    <span
      aria-hidden
      className={`titanio-mark inline-block shrink-0 bg-current ${className}`}
      style={{
        maskImage: `url(${logo})`,
        WebkitMaskImage: `url(${logo})`,
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
