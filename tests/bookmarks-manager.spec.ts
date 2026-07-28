import { test, expect } from '@playwright/test'
import { launch, api, waitForState, serve, html, type Harness } from './helpers'

/**
 * Gestor de marcadores. Hasta ahora solo existía la lista del sidebar: sin buscar, sin
 * renombrar y sin poder corregir una URL — con 79 marcadores importados eso deja de valer.
 */

let h: Harness
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  site = await serve({ '/uno': html('Uno'), '/dos': html('Dos') })
  h = await launch()
})
test.afterAll(async () => { await h?.close(); await site?.close() })

/** Llama al API desde el propio gestor, que es un remitente interno. */
async function enGestor<T>(js: string): Promise<T> {
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('profilesubmenu:action', null, 'bookmarks:all'))
  await expect
    .poll(async () => (await waitForState(h.win, () => true)).tabs.some((t) => (t as { internal?: string }).internal === 'bookmarks'))
    .toBe(true)
  await h.win.waitForTimeout(300)
  return h.app.evaluate(async ({ webContents }, code) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('bookmarks.html'))
    if (!wc) throw new Error('no hay gestor de marcadores')
    return wc.executeJavaScript(code)
  }, js) as Promise<T>
}

async function marcar(ruta: string): Promise<void> {
  await api(h.win, 'newTab')
  await api(h.win, 'go', site.url + ruta)
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.url.endsWith(ruta) === true)
  const ya = await api<{ url: string }[]>(h.win, 'getBookmarks')
  if (!ya.some((b) => b.url.endsWith(ruta))) await api(h.win, 'toggleBookmark')
}

test('renombrar un marcador lo cambia de verdad', async () => {
  await marcar('/uno')
  const bm = (await api<{ id: string; url: string }[]>(h.win, 'getBookmarks')).find((b) => b.url.endsWith('/uno'))!
  await enGestor(`window.monperTab.updateBookmark(${JSON.stringify(bm.id)}, { title: "Mi nombre" })`)
  await expect
    .poll(async () => (await api<{ id: string; title: string }[]>(h.win, 'getBookmarks')).find((b) => b.id === bm.id)?.title)
    .toBe('Mi nombre')
})

test('un título vacío cae al nombre del sitio, no deja la fila en blanco', async () => {
  const bm = (await api<{ id: string; url: string }[]>(h.win, 'getBookmarks')).find((b) => b.url.endsWith('/uno'))!
  await enGestor(`window.monperTab.updateBookmark(${JSON.stringify(bm.id)}, { title: "   " })`)
  const t = (await api<{ id: string; title: string }[]>(h.win, 'getBookmarks')).find((b) => b.id === bm.id)!.title
  expect(t.length, 'una fila sin texto es imposible de volver a encontrar').toBeGreaterThan(0)
  expect(t).toBe('127.0.0.1:' + new URL(site.url).port)
})

test('una URL inválida se rechaza y no toca el marcador', async () => {
  /**
   * Se devuelve null en vez de guardar: un marcador con una URL que no se puede abrir es
   * peor que no haber editado — parece que está y no funciona.
   */
  const antes = (await api<{ id: string; url: string }[]>(h.win, 'getBookmarks')).find((b) => b.url.endsWith('/uno'))!
  const r = await enGestor<unknown>(`window.monperTab.updateBookmark(${JSON.stringify(antes.id)}, { url: "no-es-una-url" })`)
  expect(r, 'debe rechazarse').toBeNull()
  const despues = (await api<{ id: string; url: string }[]>(h.win, 'getBookmarks')).find((b) => b.id === antes.id)!
  expect(despues.url, 'la URL original tiene que seguir intacta').toBe(antes.url)
})

test('una web no puede editar marcadores', async () => {
  // Mismo filtro que `bookmarks:add` y `bookmarks:remove`: `monperTab` existe en cualquier web.
  await marcar('/dos')
  const bm = (await api<{ id: string; url: string }[]>(h.win, 'getBookmarks')).find((b) => b.url.endsWith('/dos'))!
  const r = await h.app.evaluate(async ({ webContents }, id) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().endsWith('/dos'))
    if (!wc) throw new Error('no hay pestaña web')
    return wc.executeJavaScript(`window.monperTab.updateBookmark(${JSON.stringify(id)}, { title: "hackeado" })`)
  }, bm.id)
  expect(r, 'una web no debe poder editar').toBeNull()
  const t = (await api<{ id: string; title: string }[]>(h.win, 'getBookmarks')).find((b) => b.id === bm.id)!.title
  expect(t).not.toBe('hackeado')
})
