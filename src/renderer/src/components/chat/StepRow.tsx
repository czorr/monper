import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useState, type JSX } from 'react'
import type { ChatStep, StepKind } from '@shared/types'
import IconWorld from '~icons/tabler/world'
import IconFileText from '~icons/tabler/file-text'
import IconClick from '~icons/tabler/click'
import IconKeyboard from '~icons/tabler/keyboard'
import IconArrowsDown from '~icons/tabler/arrows-down'
import IconPointCheck from '~icons/tabler/circle-check'
import IconHourglass from '~icons/tabler/hourglass-low'
import IconKey from '~icons/tabler/keyboard-show'
import IconPointer from '~icons/tabler/pointer'
import IconSelect from '~icons/tabler/select'
import IconHistory from '~icons/tabler/history'
import IconLayoutColumns from '~icons/tabler/layout-columns'
import IconCamera from '~icons/tabler/camera'

const KIND_ICON: Record<StepKind, typeof IconWorld> = {
  navigate: IconWorld,
  read: IconFileText,
  click: IconClick,
  type: IconKeyboard,
  scroll: IconArrowsDown,
  wait: IconHourglass,
  press: IconKey,
  hover: IconPointer,
  select: IconSelect,
  history: IconHistory,
  tab: IconLayoutColumns,
  screenshot: IconCamera,
  generic: IconPointCheck
}

/** El icono identifica la acción desde el inicio, también mientras se procesa. */
function StepIcon({ step, active, onError }: { step: ChatStep; active: boolean; onError: () => void }): JSX.Element {
  if (step.favicon) {
    return (
      <img
        src={step.favicon}
        alt=""
        className="w-3.5 h-3.5 rounded-[3px] object-contain"
        onError={onError}
      />
    )
  }
  const Icon = KIND_ICON[step.kind ?? 'generic']
  return <Icon className={`w-3.5 h-3.5 ${active ? 'text-text' : 'text-text-faint'}`} />
}

/** Icono y texto comparten el barrido; los favicons conservan su aspecto original. */
export default function StepRow({ step, active }: { step: ChatStep; active: boolean }): JSX.Element {
  useLocale()
  const [failedFavicon, setFailedFavicon] = useState<string>()
  const favicon = step.favicon !== failedFavicon ? step.favicon : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`flex items-center gap-1 self-start ${active && !favicon ? 'chat-step-shimmer' : ''}`}>
        <span className="w-5 h-5 shrink-0 grid place-items-center">
          <StepIcon step={{ ...step, favicon }} active={active} onError={() => setFailedFavicon(step.favicon)} />
        </span>
        <span className={`text-[13px] ${active ? 'text-text' : 'text-text-dim'} ${active && favicon ? 'chat-step-shimmer' : ''}`}>{step.label}</span>
      </div>
      {step.image && (
        <img
          src={step.image}
          alt={tr("captura de pantalla")}
          className="ml-6 max-w-full h-auto aspect-auto rounded-lg border border-white/10"
        />
      )}
    </div>
  )
}
