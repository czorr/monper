import { join } from 'path'
import { readJson, writeJson } from './jsonfile'
import { app } from 'electron'
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
  file = join(app.getPath('userData'), 'bookmarks.json')
  items = readJson<Bookmark[]>(file, [], 'los marcadores')
}

export function listBookmarks(): Bookmark[] {
  return items
}

export function isBookmarked(url: string): boolean {
  return items.some((b) => b.url === url)
}

export function addBookmark(b: Omit<Bookmark, 'id'>): Bookmark {
  const existing = items.find((x) => x.url === b.url)
  if (existing) return existing
  const bm: Bookmark = { id: Math.random().toString(36).slice(2), ...b }
  items = [...items, bm]
  persist()
  return bm
}

export function removeBookmark(id: string): void {
  items = items.filter((b) => b.id !== id)
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
  const existing = items.find((b) => b.url === url)
  if (existing) { removeBookmark(existing.id); return null }
  return addBookmark({ url, title, favicon })
}
