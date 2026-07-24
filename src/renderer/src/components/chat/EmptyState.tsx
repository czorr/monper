import type { JSX } from 'react'
import logo from '@renderer/assets/monper.png'

/** Estado vacío del panel (sin mensajes todavía). */
export default function EmptyState(): JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-4">
      <img src={logo} alt="Monper" className="w-16 h-16 object-contain" />
      <p className="text-[13.5px] text-text-dim leading-relaxed">
        Pregúntame lo que sea. Conecta un proveedor de IA en Settings para empezar.
      </p>
    </div>
  )
}
