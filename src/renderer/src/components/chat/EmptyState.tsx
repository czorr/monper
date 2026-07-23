import type { JSX } from 'react'
import { ThinkingOrb } from 'thinking-orbs'

/** Estado vacío del panel (sin mensajes todavía). */
export default function EmptyState(): JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
      <ThinkingOrb state="shaping" size={64} theme="dark" />
      <p className="text-[13.5px] text-text-dim leading-relaxed">
        Pregúntame lo que sea. Conecta un proveedor de IA en Settings para empezar.
      </p>
    </div>
  )
}
