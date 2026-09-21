import { test, expect } from '@playwright/test'
import { launch, api, serve, html, waitForState, type Harness } from './helpers'
import type { Bookmark } from '../src/shared/types'

/**
 * Carpetas de marcadores.
 *
 * Lo que se comprueba es la invariante que ya tenía el reorden y que las carpetas podían
 * romper: **ninguna operación de organizar puede perder un marcador**. Borrar una carpeta llena
 * y llevarse veinte sitios por delante sería el peor borrado accidental del producto, y encima
 * sin deshacer.
 */

let h: Harness
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  // Sitio local: sin red, `https://example.com` cae en la página de error y lo que se marcaría
  // sería la página de error, no la URL.
  site = await serve({ '/dentro': html('Dentro'), '/en-carpeta': html('En carpeta') })
  h = await launch()
})
test.afterAll(async () => { await h?.close(); await site?.close() })

const marcadores = (): Promise<Bookmark[]> => api<Bookmark[]>(h.win, 'getBookmarks')

/**
 * Llama a `window.titanioTab.<metodo>` dentro de la página de marcadores.
 *
 * Hace falta porque `bookmarks:remove` está restringido a páginas internas —el chrome NO lo es,
 * ver isInternalSender— así que borrar desde el sidebar va por el menú nativo, que un test no
 * puede pulsar. Esto ejercita exactamente el mismo camino que usa el gestor de verdad.
 */
async function enGestor<T>(metodo: string, ...args: unknown[]): Promise<T> {
  return h.app.evaluate(async ({ webContents }, { metodo, args }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('bookmarks.html'))
    if (!wc) throw new Error('la página de marcadores no está abierta')
    const call = `window.titanioTab.${metodo}(${args.map((a) => JSON.stringify(a)).join(',')})`
    return (await wc.executeJavaScript(call)) as T
  }, { metodo, args }) as Promise<T>
}

/** Abre el gestor por su item de menú: ⌘⌥B no se puede pulsar desde Playwright. */
async function abrirGestor(): Promise<void> {
  await h.app.evaluate(({ Menu }) => {
    const archivo = Menu.getApplicationMenu()?.items.find((i) => i.label === 'Archivo')
    const item = archivo?.submenu?.items.find((i) => i.label === 'Marcadores')
    if (!item) throw new Error('no existe el item "Marcadores"')
    item.click()
  })
  await expect.poll(async () => h.app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().some((w) => w.getURL().includes('bookmarks.html'))
  ), { timeout: 8000 }).toBe(true)
}

/** Crea un marcador de verdad: navega a una URL y la marca. */
async function marcar(url: string): Promise<Bookmark> {
  await api(h.win, 'newTab')
  await api(h.win, 'go', url)
  // Hay que esperar a que la pestaña ACTIVA sea ya esa página: `bookmarks:toggle` ignora la
  // pestaña de bienvenida, así que marcar antes de que termine de navegar no hace nada.
  await waitForState(h.win, (st) => st.tabs.find((t) => t.id === st.activeId)?.url === url)
  await api(h.win, 'toggleBookmark')
  await expect.poll(async () => (await marcadores()).some((b) => b.url === url), { timeout: 8000 }).toBe(true)
  return (await marcadores()).find((b) => b.url === url)!
}

test('una carpeta nueva no se duplica al pedirla dos veces con el mismo nombre', async () => {
  const a = await api<Bookmark>(h.win, 'newBookmarkFolder', 'Trabajo')
  const b = await api<Bookmark>(h.win, 'newBookmarkFolder', 'Trabajo')
  expect(b.id, 'el importador la pide por cada marcador: duplicar dejaría tres "Trabajo"').toBe(a.id)
  const lista = await marcadores()
  expect(lista.filter((x) => x.folder && x.title === 'Trabajo')).toHaveLength(1)
})

test('borrar una carpeta NO borra lo que hay dentro: vuelve a la raíz', async () => {
  const carpeta = await api<Bookmark>(h.win, 'newBookmarkFolder', 'Para borrar')
  const bm = await marcar(site.url + '/dentro')

  await api(h.win, 'moveBookmark', bm.id, carpeta.id)
  await expect.poll(async () => (await marcadores()).find((b) => b.id === bm.id)?.parentId).toBe(carpeta.id)

  await abrirGestor()
  await enGestor('removeBookmark', carpeta.id)

  await expect.poll(async () => {
    const l = await marcadores()
    return { carpeta: l.some((b) => b.id === carpeta.id), hijo: l.find((b) => b.id === bm.id)?.parentId ?? null }
  }, { timeout: 8000 }).toEqual({ carpeta: false, hijo: null })
})

test('una carpeta no se puede meter dentro de otra', async () => {
  // El árbol es de un nivel. Sin esta guarda, un arrastre podría crear un ciclo y llevarse por
  // delante toda la rama del sidebar.
  const a = await api<Bookmark>(h.win, 'newBookmarkFolder', 'Padre')
  const b = await api<Bookmark>(h.win, 'newBookmarkFolder', 'Hija')
  await api(h.win, 'moveBookmark', b.id, a.id)
  await new Promise((r) => setTimeout(r, 300))
  expect((await marcadores()).find((x) => x.id === b.id)?.parentId ?? null).toBeNull()
})

test('un marcador dentro de una carpeta sigue contando como marcado', async () => {
  // `isBookmarked` decide la estrella del topbar. Si ignorara los que están en carpetas, marcar
  // un sitio ya guardado lo duplicaría.
  const carpeta = await api<Bookmark>(h.win, 'newBookmarkFolder', 'Guardados')
  const bm = await marcar(site.url + '/en-carpeta')
  await api(h.win, 'moveBookmark', bm.id, carpeta.id)
  await expect.poll(async () => (await marcadores()).find((b) => b.id === bm.id)?.parentId).toBe(carpeta.id)

  const url = site.url + '/en-carpeta'
  const antes = (await marcadores()).filter((b) => b.url === url).length
  await api(h.win, 'newTab')
  await api(h.win, 'go', url)
  await new Promise((r) => setTimeout(r, 500))
  const despues = (await marcadores()).filter((b) => b.url === url).length
  expect(despues, 'no debe duplicarse por estar dentro de una carpeta').toBe(antes)
})
