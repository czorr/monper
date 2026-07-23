import { useEffect, useRef, useState } from 'react'
import type { Suggestion } from '@shared/types'

type SuggestFn = (query: string) => Promise<Suggestion[]>

export interface Autocomplete {
  query: string
  setQuery: (q: string) => void
  items: Suggestion[]
  open: boolean
  active: number
  setActive: (i: number) => void
  /** Mueve la selección (±1) con wrap-around */
  move: (dir: 1 | -1) => void
  /** Sugerencia actualmente seleccionada (o null) */
  current: Suggestion | null
  /** Cierra la lista (Escape / blur / al elegir) */
  close: () => void
  /** Limpia todo (tras navegar) */
  reset: () => void
}

/**
 * Autocompletado con debounce y guardia de respuestas obsoletas.
 * `suggestFn` es la API concreta (monper.suggest o monperTab.suggest).
 */
export function useAutocomplete(suggestFn: SuggestFn, debounceMs = 110): Autocomplete {
  const [query, setQueryRaw] = useState('')
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const reqId = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (!q) { setItems([]); setOpen(false); setActive(-1); return }
    const id = ++reqId.current
    const t = setTimeout(() => {
      suggestFn(q).then((res) => {
        if (id !== reqId.current) return // llegó tarde: descarta
        setItems(res)
        setOpen(res.length > 0)
        setActive(-1)
      })
    }, debounceMs)
    return () => clearTimeout(t)
  }, [query, suggestFn, debounceMs])

  const setQuery = (q: string): void => setQueryRaw(q)
  const move = (dir: 1 | -1): void => {
    setActive((i) => {
      if (!items.length) return -1
      const n = i + dir
      return n < 0 ? items.length - 1 : n >= items.length ? 0 : n
    })
  }
  const close = (): void => setOpen(false)
  const reset = (): void => { setQueryRaw(''); setItems([]); setOpen(false); setActive(-1); reqId.current++ }

  return {
    query, setQuery, items, open, active, setActive, move,
    current: active >= 0 ? items[active] ?? null : null,
    close, reset
  }
}
