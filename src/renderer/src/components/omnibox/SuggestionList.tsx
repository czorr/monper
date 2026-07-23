import { useState, type JSX } from 'react'
import type { Suggestion } from '@shared/types'
import IconSearch from '~icons/tabler/search'
import IconWorld from '~icons/tabler/world'
import IconClock from '~icons/tabler/clock'
import IconStar from '~icons/tabler/star'
import IconArrowRight from '~icons/tabler/corner-down-left'

interface Props {
  items: Suggestion[]
  active: number
  onHover: (i: number) => void
  onChoose: (s: Suggestion) => void
}

const KIND_ICON = { search: IconSearch, url: IconWorld, history: IconClock, bookmark: IconStar }

function Leading({ s }: { s: Suggestion }): JSX.Element {
  const [broken, setBroken] = useState(false)
  // Las búsquedas siempre muestran la lupa; el resto, favicon con fallback al icono del tipo.
  if (s.kind !== 'search' && s.favicon && !broken) {
    return <img src={s.favicon} alt="" className="w-4 h-4 rounded-[3px] object-contain" onError={() => setBroken(true)} />
  }
  const Icon = KIND_ICON[s.kind]
  return <Icon className="w-4 h-4 text-text-faint" />
}

/** Lista desplegable de sugerencias del omnibox. La posiciona el parent (absolute). */
export default function SuggestionList({ items, active, onHover, onChoose }: Props): JSX.Element {
  return (
    <ul className="py-1.5">
      {items.map((s, i) => (
        <li key={s.kind + s.url}>
          <button
            type="button"
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => { e.preventDefault(); onChoose(s) }}
            className={
              'flex items-center gap-3 w-full px-3 py-2 text-left rounded-lg ' +
              (i === active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]')
            }
          >
            <span className="w-4 h-4 shrink-0 grid place-items-center"><Leading s={s} /></span>
            <span className="flex-1 min-w-0 text-[13.5px] text-text overflow-hidden text-ellipsis whitespace-nowrap">
              {s.title}
            </span>
            {s.detail && (
              <span className="shrink-0 text-[12px] text-text-faint overflow-hidden text-ellipsis whitespace-nowrap max-w-[45%]">
                {s.detail}
              </span>
            )}
            {i === active && <IconArrowRight className="w-3.5 h-3.5 text-text-faint shrink-0" />}
          </button>
        </li>
      ))}
    </ul>
  )
}
