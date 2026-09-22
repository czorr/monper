import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useState, type JSX } from 'react'
import type { ChatContext } from '@shared/types'
import IconPlug from '~icons/tabler/plug'
import IconChevronDown from '~icons/tabler/chevron-down'
import IconCheck from '~icons/tabler/check'
import ProviderIcon from '@renderer/components/ui/ProviderIcon'

interface Props {
  ctx: ChatContext
  onPick: (id: string, providerId?: string) => void
  onConnect: () => void
}

/** Selector de modelo del composer. Si no hay proveedor, invita a conectarlo. */
export default function ModelSelector({ ctx, onPick, onConnect }: Props): JSX.Element {
  useLocale()
  const [open, setOpen] = useState(false)

  if (!ctx.provider) {
    return (
      <button
        onClick={onConnect}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12.5px] text-text-faint hover:text-text hover:bg-white/[0.06] transition-colors"
      >
        <IconPlug className="w-4 h-4" /> {tr("Conectar proveedor")} </button>
    )
  }

  const actual = ctx.models.find((m) => m.id === ctx.model && (!m.providerId || m.providerId === ctx.provider?.id))
  const current = actual?.name ?? ctx.model

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12.5px] text-text-dim hover:text-text hover:bg-white/[0.06] transition-colors"
      >
        <ProviderIcon provider={actual?.provider ?? ctx.provider} className="w-3.5 h-3.5" />
        {current}
        <IconChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          {/* Todos los modelos de todos los proveedores conectados, en una sola lista. Elegir
              uno cambia el proveedor activo solo: con quién tienes cuenta es un detalle de
              facturación nuestro, no una decisión que el usuario tenga que tomar antes. */}
          <div className="absolute z-50 bottom-full left-0 mb-1.5 w-56 max-h-[320px] overflow-y-auto p-1.5 rounded-2xl border border-white/10 bg-[#1c1c20]/95 shadow-2xl shadow-black/50 [&::-webkit-scrollbar]:w-0">
            {ctx.models.map((m) => (
              <button
                key={`${m.providerId ?? ''}:${m.id}`}
                onClick={() => { onPick(m.id, m.providerId); setOpen(false) }}
                className="flex items-center gap-2 w-full h-8 px-2 rounded-lg text-[13px] text-text text-left hover:bg-white/[0.08]"
              >
                <ProviderIcon provider={m.provider ?? { id: m.providerId, kind: m.providerKind }} className="w-3.5 h-3.5 text-text-dim shrink-0" />
                <span className="flex-1 truncate">{m.name}</span>
                {m.id === ctx.model && (!m.providerId || m.providerId === ctx.provider?.id) && <IconCheck className="w-4 h-4 text-text shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
