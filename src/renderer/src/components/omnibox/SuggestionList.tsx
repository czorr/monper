import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useState, type JSX } from 'react'
import type { Suggestion } from '@shared/types'
import IconSearch from '~icons/tabler/search'
import IconWorld from '~icons/tabler/world'
import IconClock from '~icons/tabler/clock'
import IconStar from '~icons/tabler/star'
import IconArrowRight from '~icons/tabler/corner-down-left'
import IconX from '~icons/tabler/x'

interface Props {
  items: Suggestion[]
  active: number
  query: string
  onHover: (i: number) => void
  onChoose: (s: Suggestion) => void
  onRemove?: (s: Suggestion) => void
}

const KIND_ICON = { search: IconSearch, url: IconWorld, history: IconClock, bookmark: IconStar }

function Leading({ s }: { s: Suggestion }): JSX.Element {
  useLocale()
  const [failedFavicon, setFailedFavicon] = useState<string | null>(null)
  // Una búsqueda normal lleva lupa, pero una ENTIDAD de Google (persona, empresa) sí trae
  // foto: por eso el icono depende de que HAYA imagen, no del kind.
  if (s.favicon && s.favicon !== failedFavicon) {
    return (
      <img
        key={s.favicon}
        src={s.favicon}
        alt=""
        className={'w-[18px] h-[18px] ' + (s.round ? 'rounded-sm object-cover' : 'rounded-[4px] object-contain')}
        onError={() => setFailedFavicon(s.favicon ?? null)}
      />
    )
  }
  const Icon = KIND_ICON[s.kind]
  return <Icon className="w-[18px] h-[18px] text-text-faint" />
}

/** Resalta lo que el usuario tecleó (prefijo en negrita); el completado va tenue. */
function Highlight({ text, query }: { text: string; query: string }): JSX.Element {
  useLocale()
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
export default function SuggestionList({ items, active, query, onHover, onChoose, onRemove }: Props): JSX.Element {
  useLocale()
  return (
    <ul className="p-1">
      {items.map((s, i) => (
        <li key={s.kind + s.url} className="group/suggestion relative">
          <button
            type="button"
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => { e.preventDefault(); onChoose(s) }}
            className={
              'flex items-center gap-3.5 w-full pl-4 pr-10 py-2.5 rounded-2xl text-left ' +
              (i === active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]')
            }
          >
            <span className="w-[18px] h-[18px] shrink-0 grid place-items-center"><Leading s={s} /></span>
            <span className="flex-1 min-w-0 text-[14px] overflow-hidden text-ellipsis whitespace-nowrap">
              <Highlight text={s.title} query={query} />
              {s.detail && <span className="ml-2 text-[13px] text-text-faint">{s.detail}</span>}
            </span>
            {i === active && !(onRemove && s.kind === 'history') && <IconArrowRight className="w-4 h-4 text-text-faint shrink-0" />}
          </button>
          {onRemove && s.kind === 'history' && (
            <button
              type="button"
              aria-label={tr("Eliminar {0} del historial", s.title)}
              title={tr("Eliminar del historial")}
              className={'absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-text-faint hover:text-text hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-1 group-hover/suggestion:opacity-100 focus-visible:opacity-100 ' + (i === active ? 'opacity-100' : 'opacity-0')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onRemove(s)}
            >
              <IconX className="w-3.5 h-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
