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
  query: string
  onHover: (i: number) => void
  onChoose: (s: Suggestion) => void
}

const KIND_ICON = { search: IconSearch, url: IconWorld, history: IconClock, bookmark: IconStar }

function Leading({ s }: { s: Suggestion }): JSX.Element {
  const [broken, setBroken] = useState(false)
  if (s.kind !== 'search' && s.favicon && !broken) {
    return <img src={s.favicon} alt="" className="w-[18px] h-[18px] rounded-[4px] object-contain" onError={() => setBroken(true)} />
  }
  const Icon = KIND_ICON[s.kind]
  return <Icon className="w-[18px] h-[18px] text-text-faint" />
}

/** Resalta lo que el usuario tecleó (prefijo en negrita); el completado va tenue. */
function Highlight({ text, query }: { text: string; query: string }): JSX.Element {
  const q = query.trim()
  let n = 0
  const a = text.toLowerCase()
  const b = q.toLowerCase()
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  if (n === 0) return <span className="text-text-dim">{text}</span>
  return (
    <>
      <span className="font-semibold text-text">{text.slice(0, n)}</span>
      <span className="text-text-dim">{text.slice(n)}</span>
    </>
  )
}

/** Lista desplegable de sugerencias del omnibox (estilo Arc: full-width, completado en negrita). */
export default function SuggestionList({ items, active, query, onHover, onChoose }: Props): JSX.Element {
  return (
    <ul className="py-2">
      {items.map((s, i) => (
        <li key={s.kind + s.url}>
          <button
            type="button"
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => { e.preventDefault(); onChoose(s) }}
            className={
              'flex items-center gap-3.5 w-full px-4 py-2.5 text-left ' +
              (i === active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]')
            }
          >
            <span className="w-[18px] h-[18px] shrink-0 grid place-items-center"><Leading s={s} /></span>
            <span className="flex-1 min-w-0 text-[14px] overflow-hidden text-ellipsis whitespace-nowrap">
              <Highlight text={s.title} query={query} />
              {s.detail && <span className="ml-2 text-[13px] text-text-faint">{s.detail}</span>}
            </span>
            {i === active && <IconArrowRight className="w-4 h-4 text-text-faint shrink-0" />}
          </button>
        </li>
      ))}
    </ul>
  )
}
