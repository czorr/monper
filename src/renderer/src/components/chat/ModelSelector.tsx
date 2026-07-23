import { useState, type JSX } from 'react'
import type { ChatContext } from '@shared/types'
import IconSparkles from '~icons/tabler/sparkles'
import IconChevronDown from '~icons/tabler/chevron-down'
import IconCheck from '~icons/tabler/check'
import ProviderIcon from '@renderer/components/ui/ProviderIcon'

interface Props {
  ctx: ChatContext
  onPick: (id: string) => void
  onConnect: () => void
}

/** Selector de modelo del composer. Si no hay proveedor, invita a conectarlo. */
export default function ModelSelector({ ctx, onPick, onConnect }: Props): JSX.Element {
  const [open, setOpen] = useState(false)

  if (!ctx.provider) {
    return (
      <button
        onClick={onConnect}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12.5px] text-text-faint hover:text-text hover:bg-white/[0.06] transition-colors"
      >
        <IconSparkles className="w-4 h-4" /> Conectar proveedor
      </button>
    )
  }

  const kind = ctx.provider.kind
  const current = ctx.models.find((m) => m.id === ctx.model)?.name ?? ctx.model

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12.5px] text-text-dim hover:text-text hover:bg-white/[0.06] transition-colors"
      >
        <ProviderIcon kind={kind} className="w-3.5 h-3.5" />
        {current}
        <IconChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div className="absolute z-50 bottom-full left-0 mb-1.5 w-52 p-1.5 rounded-2xl border border-white/10 bg-[#1c1c20]/95 shadow-2xl shadow-black/50">
            <div className="px-2 py-1 text-[11px] text-text-faint">{ctx.provider.label}</div>
            {ctx.models.map((m) => (
              <button
                key={m.id}
                onClick={() => { onPick(m.id); setOpen(false) }}
                className="flex items-center gap-2 w-full h-8 px-2 rounded-lg text-[13px] text-text text-left hover:bg-white/[0.08]"
              >
                <ProviderIcon kind={kind} className="w-3.5 h-3.5 text-text-dim" />
                <span className="flex-1">{m.name}</span>
                {m.id === ctx.model && <IconCheck className="w-4 h-4 text-text" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
