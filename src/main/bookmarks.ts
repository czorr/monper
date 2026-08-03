import { readJson, writeJson } from './jsonfile'
import { rutaDePerfil } from './perfiles'
import { nombreDeUrl } from '../shared/url'
import type { Bookmark } from '../shared/types'

let file = ''
let items: Bookmark[] = []

/**
 * Se empieza SIN marcadores, a propósito.
 *
 * Antes venían seis de fábrica (Gmail, YouTube, GitHub…). Además de presuponer a qué sitios
 * entra el usuario, obligaba a inventarles un icono antes de haber visitado nunca la página:
 * primero pidiéndoselo a Google —que los devuelve con fondo y de paso recibe los dominios—
 * y luego con logos de marca empaquetados. Sin marcadores por defecto el problema no existe:
 * el que añades se guarda con el favicon real del sitio, que ya lo tenemos.
 */

function persist(): void {
  writeJson(file, items, 'los marcadores')
}

export function initBookmarks(): void {
  file = rutaDePerfil('bookmarks.json')
  items = readJson<Bookmark[]>(file, [], 'los marcadores')
  repararTitulos()
}

/**
 * Da nombre a los marcadores que se guardaron con su propia URL como título.
 *
 * Los trajo el importador antes de que supiera derivar un nombre: Chromium guarda muchos
 * marcadores con el nombre vacío y se caía a la URL cruda. Se arregla aquí y no solo en el
 * importador para que quien ya importó no tenga que borrarlos y repetir.
 *
 * Solo toca los que son EXACTAMENTE su URL: un título que el usuario escribió, aunque parezca
 * una URL, es suyo y no se toca.
 */
function repararTitulos(): void {
  let cambios = 0
  items = items.map((b) => {
    if (b.folder || b.title !== b.url) return b
    cambios++
    return { ...b, title: nombreDeUrl(b.url) }
  })
  if (cambios) {
    console.log(`[marcadores] ${cambios} sin título: se les puso el nombre del sitio`)
    persist()
  }
}

export function listBookmarks(): Bookmark[] {
  return items
}

export function isBookmarked(url: string): boolean {
  return items.some((b) => !b.folder && b.url === url)
}

/** Los hijos de una carpeta, o los de la raíz. Respeta el orden de `items`. */
export function bookmarksDe(parentId: string | null): Bookmark[] {
  return items.filter((b) => (b.parentId ?? null) === parentId)
}

/**
 * Crea una carpeta. Si ya hay una con ese nombre en la raíz se reutiliza en vez de duplicarla:
 * el importador la llama por cada carpeta del navegador de origen, y reimportar no debe acabar
 * con tres "Trabajo".
 */
export function createFolder(title: string): Bookmark {
  const nombre = title.trim() || 'Carpeta'
  const ya = items.find((b) => b.folder && b.title === nombre)
  if (ya) return ya
  const f: Bookmark = { id: Math.random().toString(36).slice(2), title: nombre, url: '', folder: true, parentId: null, collapsed: false }
  items = [...items, f]
  persist()
  return f
}

/**
 * Mueve un marcador dentro de una carpeta (o a la raíz con `null`).
 *
 * Una carpeta no puede meterse en otra: el árbol es de un nivel (ver `Bookmark.folder`), y sin
 * esta guarda un arrastre podría crear un ciclo y perder la rama entera del sidebar.
 */
export function moveBookmark(id: string, parentId: string | null): Bookmark | null {
  const b = items.find((x) => x.id === id)
  if (!b) return null
  if (b.folder && parentId !== null) return null
  if (parentId !== null) {
    const destino = items.find((x) => x.id === parentId)
    if (!destino?.folder) return null
  }
  b.parentId = parentId
  persist()
  return b
}

export function setFolderCollapsed(id: string, collapsed: boolean): void {
  const f = items.find((x) => x.id === id)
  if (!f?.folder) return
  f.collapsed = collapsed
  persist()
}

export function addBookmark(b: Omit<Bookmark, 'id'>): Bookmark {
  const existing = items.find((x) => !x.folder && x.url === b.url)
  if (existing) return existing
  const bm: Bookmark = { id: Math.random().toString(36).slice(2), ...b }
  items = [...items, bm]
  persist()
  return bm
}

/**
 * Reordena por la lista de ids que manda el sidebar.
 *
 * Se respeta lo que llega pero se reconstruye desde `items`: si el renderer manda una id que
 * ya no existe (borraste el marcador en otra ventana mientras arrastrabas) se ignora, y los
 * que no venían en la lista se conservan al final en vez de desaparecer. Un reorden nunca
 * debe poder perder un marcador.
 */
export function reorderBookmarks(ids: string[]): Bookmark[] {
  const porId = new Map(items.map((b) => [b.id, b]))
  const ordenados: Bookmark[] = []
  for (const id of ids) {
    const b = porId.get(id)
    if (b) { ordenados.push(b); porId.delete(id) }
  }
  items = [...ordenados, ...porId.values()]
  persist()
  return items
}

/**
 * Renombrar o cambiar la URL de un marcador.
 *
 * Falta desde siempre y con 79 marcadores importados se nota: no había forma de arreglar un
 * título malo ni de corregir una URL sin borrar y volver a crear —perdiendo el orden—.
 *
 * Un título vacío NO se acepta: dejaría una fila en blanco imposible de volver a encontrar.
 * Si llega vacío se cae al nombre del sitio, igual que al importar.
 */
export function updateBookmark(id: string, cambios: { title?: string; url?: string }): Bookmark | null {
  const b = items.find((x) => x.id === id)
  if (!b) return null
  if (cambios.url !== undefined) {
    const url = cambios.url.trim()
    // Una URL vacía o sin esquema convertiría el marcador en algo que no se puede abrir.
    if (!/^https?:\/\//i.test(url)) return null
    b.url = url
  }
  // Una carpeta no tiene URL de la que sacar un nombre: se le deja uno genérico antes que
  // una fila en blanco.
  if (cambios.title !== undefined) b.title = cambios.title.trim() || (b.folder ? 'Carpeta' : nombreDeUrl(b.url))
  persist()
  return b
}

/**
 * Borrar una carpeta NO borra lo que hay dentro: sus marcadores vuelven a la raíz.
 *
 * Es la misma invariante que en `reorderBookmarks`: ninguna operación de organización puede
 * perder un marcador. Borrar una carpeta llena y llevarse 20 sitios por delante sería el peor
 * borrado accidental del producto, y encima sin deshacer.
 */
export function removeBookmark(id: string): void {
  const b = items.find((x) => x.id === id)
  if (b?.folder) {
    for (const h of items) if (h.parentId === id) h.parentId = null
  }
  items = items.filter((x) => x.id !== id)
  persist()
}

/**
 * Alterna el marcador de una URL.
 *
 * Devuelve el marcador si quedó guardada, y `null` si se quitó — no un booleano: quien llama
 * necesita el **id** para atarle la pestaña, y con un `true` tenía que volver a buscarlo por
 * URL. Ver `atarTabAlBookmark` en index.ts.
 */
export function toggleBookmark(url: string, title: string, favicon?: string | null): Bookmark | null {
  const existing = items.find((b) => !b.folder && b.url === url)
  if (existing) { removeBookmark(existing.id); return null }
  return addBookmark({ url, title, favicon })
}
