import type { MenuItemConstructorOptions } from 'electron'

/**
 * Las entradas de corrector del menú contextual.
 *
 * Está aparte de `index.ts` para poder probarla: construir el menú es una decisión con reglas
 * (cuántas sugerencias, qué hacer sin ninguna) y dentro del god file no había forma de
 * verificarla sin abrir un menú nativo, que en un test bloquea.
 *
 * Sin esto el subrayado rojo aparece pero no se puede hacer NADA con él: hay que borrar la
 * palabra y reescribirla adivinando. Eso es lo que hace inútil a un corrector.
 */

/** Techo de sugerencias. Chromium devuelve hasta 5 y más no caben sin tapar el resto del menú. */
export const MAX_SUGERENCIAS = 5

export interface AccionesCorrector {
  reemplazar: (palabra: string) => void
  aprender: (palabra: string) => void
}

export function itemsDeCorrector(
  p: { isEditable: boolean; misspelledWord: string; dictionarySuggestions: string[] },
  acciones: AccionesCorrector
): MenuItemConstructorOptions[] {
  // Solo en campos editables y solo si Chromium marcó algo: en el resto no hay nada que ofrecer.
  if (!p.isEditable || !p.misspelledWord) return []

  const items: MenuItemConstructorOptions[] = p.dictionarySuggestions
    .slice(0, MAX_SUGERENCIAS)
    .map((s) => ({ label: s, click: () => acciones.reemplazar(s) }))

  // Una entrada desactivada y no un menú vacío: sin ella, el usuario ve el subrayado, abre el
  // menú, no encuentra nada y no sabe si el corrector funciona o si esa palabra no tiene arreglo.
  if (!items.length) items.push({ label: 'Sin sugerencias', enabled: false })

  items.push({
    label: `Añadir “${p.misspelledWord}” al diccionario`,
    click: () => acciones.aprender(p.misspelledWord)
  })
  items.push({ type: 'separator' })
  return items
}
