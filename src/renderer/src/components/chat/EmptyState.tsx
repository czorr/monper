import { t as tr, useLocale } from '@renderer/lib/i18n'
import type { JSX } from 'react'
import type { ChatContext } from '@shared/types'
import { GlassLogo } from '@renderer/components/ui/GlassLogo'

const { titanio } = window

/**
 * Estado vacío del panel (sin mensajes todavía).
 *
 * Decía siempre "Conecta un proveedor de IA en Settings para empezar", tuvieras uno conectado
 * o no: quien ya lo tenía configurado leía una instrucción que no le tocaba hacer, y encima
 * sembraba la duda de si su clave había dejado de funcionar. El estado vacío es lo primero
 * que se ve al abrir el chat, así que tiene que decir la verdad de ESTE momento.
 */
export default function EmptyState({ provider }: { provider: ChatContext['provider'] }): JSX.Element {
  useLocale()
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-4">
      <GlassLogo />

      {provider ? (
        <p className="text-[13.5px] text-text-dim leading-relaxed">
          {tr("Pregúntame lo que sea sobre esta página, o pídeme que haga algo en ella.")} </p>
      ) : (
        <>
          <p className="text-[13.5px] text-text-dim leading-relaxed">
            {tr("Para empezar, conecta un proveedor de IA con tu clave.")} </p>
          {/* El enlace, no solo la instrucción: decirle a alguien dónde ir y no llevarle es
              trabajo que se le deja al usuario por nada. */}
          <button
            onClick={() => titanio.openSettings()}
            className="px-3.5 h-9 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-[13px] font-medium text-text transition-colors"
          >
            {tr("Abrir Settings")} </button>
        </>
      )}
    </div>
  )
}
