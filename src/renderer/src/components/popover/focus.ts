import { useEffect } from 'react'

/**
 * Evita que un popover abra con algo "seleccionado".
 *
 * Al abrir el vault o el peek aparecía una fila con el anillo de foco de macOS (del color
 * de acento del sistema), como si el usuario hubiera navegado hasta ahí con el teclado.
 *
 * Se intentó primero quitando el foco (`blur`) al activarse la ventana, y **no era eso**:
 * medido con Playwright, `document.activeElement` ya era `body` en todas las ventanas, con
 * y sin ese arreglo. Sea quien dibuje el anillo (la activación de la ventana en macOS), la
 * forma fiable de matarlo es no pintar NINGÚN anillo hasta que el usuario toque el teclado:
 *
 *   1. se marca `<html data-popover>` para que la regla de CSS solo aplique a estas
 *      ventanas y no al resto de la app;
 *   2. al primer Tab o flecha se marca `data-kbd` y desde entonces el anillo se ve normal.
 *
 * Así quien navega con teclado no pierde nada — que es justo por lo que no vale con
 * `outline: none` a secas.
 */
export function useNoInitialFocus(): void {
  useEffect(() => {
    const root = document.documentElement
    root.dataset['popover'] = '1'

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Tab' || e.key.startsWith('Arrow')) root.dataset['kbd'] = '1'
    }
    // El foco inicial tampoco lo queremos, aunque no sea lo que pinta el anillo.
    const el = document.activeElement as HTMLElement | null
    if (el && el !== document.body && typeof el.blur === 'function') el.blur()

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
