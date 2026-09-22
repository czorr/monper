import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useState, type JSX } from 'react'
import { EFFORTS, type Effort } from '@shared/types'
import IconChevronDown from '~icons/tabler/chevron-down'
import IconCheck from '~icons/tabler/check'

interface Props {
  effort: Effort
  onPick: (e: Effort) => void
}

/** Selector de esfuerzo de razonamiento (solo Anthropic). */
export default function EffortSelector({ effort, onPick }: Props): JSX.Element {
  useLocale()
  const [open, setOpen] = useState(false)
  const current = EFFORTS.find((e) => e.id === effort)?.name ?? effort

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[12.5px] text-text-dim hover:text-text hover:bg-white/[0.06] transition-colors"
        title={tr("Esfuerzo de razonamiento")}
      >
        {current}
        <IconChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div className="absolute z-50 bottom-full left-0 mb-1.5 w-36 p-1.5 rounded-2xl border border-white/10 bg-[#1c1c20]/95 shadow-2xl shadow-black/50">
            {EFFORTS.map((e) => (
              <button
                key={e.id}
                onClick={() => { onPick(e.id); setOpen(false) }}
                className="flex items-center gap-2 w-full h-8 px-2 rounded-lg text-[13px] text-text text-left hover:bg-white/[0.08]"
              >
                <span className="flex-1">{e.name}</span>
                {e.id === effort && <IconCheck className="w-4 h-4 text-text" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
