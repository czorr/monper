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

/**
 * Vive aquí y no en index.ts por lo mismo que el corrector: construir el menú son decisiones
 * con reglas, y dentro del god file no se pueden probar sin abrir un menú nativo, que en un
 * test bloquea.
 */
export interface AccionesVideo {
  alternarPip: () => void
  copiarUrl: (url: string) => void
  guardar: (url: string) => void
}

/** Lo que la PÁGINA dice sobre su vídeo. Ver `detectarVideo` en index.ts. */
export interface VideoEnPagina {
  /** Hay un vídeo utilizable y admite picture-in-picture. */
  hay: boolean
  /** Ya está en picture-in-picture. */
  enPip: boolean
  /** URL descargable, o '' si es un blob (YouTube) o no la hay. */
  url: string
}

/**
 * Las entradas de vídeo del menú contextual — sobre todo **picture-in-picture**.
 *
 * Faltaban por completo. Titanio reemplaza el menú nativo de Chromium por uno propio, y ese
 * traía "Picture in picture" de fábrica: al construir el nuestro se cubrió el caso de la imagen
 * y el del vídeo se quedó fuera.
 *
 * **No se mira `mediaType` de los params del clic, y esa es la clave.** YouTube cancela el
 * evento `contextmenu` para pintar su propio menú, así que el clic derecho que llega hasta
 * nosotros es el SEGUNDO — y cae sobre el menú de YouTube, no sobre el vídeo. Con `mediaType`
 * la entrada no aparecía nunca justo en el sitio donde más se quiere. Se le pregunta a la
 * página si tiene un vídeo, que es lo que de verdad importa.
 */
export function itemsDeVideo(v: VideoEnPagina, acciones: AccionesVideo): MenuItemConstructorOptions[] {
  if (!v.hay) return []

  const items: MenuItemConstructorOptions[] = [
    {
      label: v.enPip ? 'Salir de picture in picture' : 'Picture in picture',
      click: acciones.alternarPip
    }
  ]
  // Un vídeo servido por blob: no tiene URL que copiar ni descargar (YouTube es así), así que
  // esas dos entradas solo salen cuando llevan a algún sitio.
  if (v.url) {
    items.push(
      { label: 'Copiar dirección del vídeo', click: () => acciones.copiarUrl(v.url) },
      { label: 'Guardar vídeo', click: () => acciones.guardar(v.url) }
    )
  }
  items.push({ type: 'separator' })
  return items
}
