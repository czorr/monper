import { useEffect, useRef, type RefObject } from 'react'
import type { Suggestion } from '@shared/types'
import { urlVisible } from '@shared/url'
import type { Autocomplete } from './useAutocomplete'

/**
 * Base de completado de una sugerencia.
 *
 * Tiene que ser EXACTAMENTE lo mismo que el subtexto que se muestra: si difieren, el usuario
 * ve `mediotiempo.com` y el completado compara contra `www.mediotiempo.com`. Por eso sale de
 * `urlVisible`, en shared, y no de una expresión regular local.
 */
export function completionBase(s: Suggestion): string {
  return urlVisible(s.url)
}

export interface InlineCompletion {
  inputRef: RefObject<HTMLInputElement | null>
  /** onChange del input (no-controlado): vuelca el valor real a la query. */
  onChange: () => void
  /**
   * Gestiona las teclas que afectan al completado (flechas, borrado, escritura).
   * Devuelve true si ya consumió la tecla; quien llame se ocupa de Enter/Escape/Tab.
   */
  onKeyDown: (e: React.KeyboardEvent) => boolean
  /** Lo que hay escrito ahora mismo (incluye lo completado). */
  value: () => string
  setValue: (v: string) => void
}

/**
 * Completado inline al estilo Chrome: cuando llegan sugerencias y el usuario escribe *hacia
 * adelante*, el input se rellena con la mejor coincidencia y la parte añadida queda
 * seleccionada — que es lo que se ve en gris, vía `::selection`.
 *
 * Por eso el input tiene que ser NO-CONTROLADO: con `value={query}` React repinta en cada
 * tecla y se lleva por delante la selección, así que el completado no llegaba a verse. Es la
 * razón de que este hook trabaje sobre un ref en vez de sobre estado.
 *
 * `deleting` existe porque completar mientras alguien borra es pelearse con el usuario: cada
 * Backspace volvería a rellenar lo que acaba de quitar. Se rearma al escribir un carácter.
 */
export function useInlineCompletion(ac: Autocomplete): InlineCompletion {
  const inputRef = useRef<HTMLInputElement>(null)
  const deleting = useRef(false)

  const onChange = (): void => { ac.setQuery(inputRef.current?.value ?? '') }

  useEffect(() => {
    if (deleting.current) return
    const el = inputRef.current
    const q = ac.query.trim()
    if (!el || !q || el.value.toLowerCase() !== q.toLowerCase()) return
    const cand = ac.items.find((s) => {
      if (s.kind === 'search') return false
      const base = completionBase(s)
      return base.toLowerCase().startsWith(q.toLowerCase()) && base.length > q.length
    })
    if (!cand) return
    const base = completionBase(cand)
    el.value = base
    el.setSelectionRange(q.length, base.length)
  }, [ac.items]) // eslint-disable-line react-hooks/exhaustive-deps

  // Vuelca la sugerencia resaltada al input (al navegar con flechas).
  const fillFrom = (i: number): void => {
    const s = ac.items[i]
    const el = inputRef.current
    if (!s || !el) return
    const t = s.kind === 'search' ? s.title : completionBase(s)
    el.value = t
    el.setSelectionRange(t.length, t.length)
  }

  const onKeyDown = (e: React.KeyboardEvent): boolean => {
    const n = ac.items.length
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!n) return true
      deleting.current = true // no re-autocompletar sobre la selección de flechas
      const x = e.key === 'ArrowDown' ? (ac.active + 1 >= n ? 0 : ac.active + 1) : (ac.active - 1 < 0 ? n - 1 : ac.active - 1)
      ac.setActive(x)
      fillFrom(x)
      return true
    }
    if (e.key === 'Backspace' || e.key === 'Delete') deleting.current = true
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) deleting.current = false
    return false
  }

  return {
    inputRef,
    onChange,
    onKeyDown,
    value: () => inputRef.current?.value ?? '',
    setValue: (v: string) => { if (inputRef.current) inputRef.current.value = v }
  }
}
