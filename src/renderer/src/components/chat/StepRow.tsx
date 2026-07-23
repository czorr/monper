import { useState, type JSX } from 'react'
import { ThinkingOrb } from 'thinking-orbs'
import type { ChatStep, StepKind } from '@shared/types'
import type { OrbState } from './types'
import IconWorld from '~icons/tabler/world'
import IconFileText from '~icons/tabler/file-text'
import IconClick from '~icons/tabler/click'
import IconKeyboard from '~icons/tabler/keyboard'
import IconArrowsDown from '~icons/tabler/arrows-down'
import IconPointCheck from '~icons/tabler/circle-check'

const KIND_ICON: Record<StepKind, typeof IconWorld> = {
  navigate: IconWorld,
  read: IconFileText,
  click: IconClick,
  type: IconKeyboard,
  scroll: IconArrowsDown,
  generic: IconPointCheck
}

/** Icono de un paso completado: favicon (navegación) o icono tabler de la acción. */
function StepIcon({ step }: { step: ChatStep }): JSX.Element {
  const [broken, setBroken] = useState(false)
  if (step.favicon && !broken) {
    return (
      <img
        src={step.favicon}
        alt=""
        className="w-3.5 h-3.5 rounded-[3px] object-contain"
        onError={() => setBroken(true)}
      />
    )
  }
  const Icon = KIND_ICON[step.kind ?? 'generic']
  return <Icon className="w-3.5 h-3.5 text-text-faint" />
}

/** Una fila de paso: orb animado si está activo, icono/favicon si está completado. */
export default function StepRow({ step, active }: { step: ChatStep; active: boolean }): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-5 h-5 shrink-0 grid place-items-center">
        {active ? <ThinkingOrb state={step.state as OrbState} size={20} theme="dark" /> : <StepIcon step={step} />}
      </span>
      <span className={active ? 'text-[13px] text-text' : 'text-[13px] text-text-dim'}>{step.label}</span>
    </div>
  )
}
