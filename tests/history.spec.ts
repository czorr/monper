import { test, expect } from '@playwright/test'
import { launch, api, waitForState, serve, html, type Harness } from './helpers'

/**
 * La página de historial. Hasta ahora se registraba cada visita para el autocompletado pero
 * no había forma de verlo: solo los 10 últimos en un submenú.
 */

let h: Harness
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  site = await serve({ '/uno': html('Página uno'), '/dos': html('Página dos') })
  h = await launch()
})
test.afterAll(async () => { await h?.close(); await site?.close() })

/** Llama al API desde la propia página de historial, que es un remitente interno. */
async function enHistorial<T>(js: string): Promise<T> {
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('profilesubmenu:action', null, 'history:all'))
  await expect
    .poll(async () => (await waitForState(h.win, () => true)).tabs.some((t) => (t as { internal?: string }).internal === 'history'))
    .toBe(true)
  await h.win.waitForTimeout(300)
  return h.app.evaluate(async ({ webContents }, code) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('history.html'))
    if (!wc) throw new Error('no hay página de historial')
    return wc.executeJavaScript(code)
  }, js) as Promise<T>
}

test('registra lo visitado y la página lo muestra', async () => {
  for (const r of ['/uno', '/dos']) {
    await api(h.win, 'newTab')
    await api(h.win, 'go', site.url + r)
    await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.url.endsWith(r) === true)
  }
  const r = await enHistorial<{ entries: { url: string }[]; total: number }>('window.titanioTab.browseHistory("", 0, 100)')
  expect(r.entries.some((e) => e.url.endsWith('/uno'))).toBe(true)
  expect(r.entries.some((e) => e.url.endsWith('/dos'))).toBe(true)
})

test('busca por título y por URL', async () => {
  const porTitulo = await enHistorial<{ total: number }>('window.titanioTab.browseHistory("Página uno", 0, 100)')
  expect(porTitulo.total, 'debe encontrar por el título de la página').toBeGreaterThan(0)
  const porUrl = await enHistorial<{ total: number }>('window.titanioTab.browseHistory("/dos", 0, 100)')
  expect(porUrl.total, 'y también por la URL').toBeGreaterThan(0)
  const nada = await enHistorial<{ total: number }>('window.titanioTab.browseHistory("zzzz-no-existe", 0, 100)')
  expect(nada.total).toBe(0)
})

test('borrar una entrada la quita de verdad', async () => {
  const antes = await enHistorial<{ total: number }>('window.titanioTab.browseHistory("/uno", 0, 100)')
  expect(antes.total).toBeGreaterThan(0)
  const url = (await enHistorial<{ entries: { url: string }[] }>('window.titanioTab.browseHistory("/uno", 0, 100)')).entries[0].url
  await enHistorial(`window.titanioTab.removeHistoryEntry(${JSON.stringify(url)})`)
  const despues = await enHistorial<{ entries: { url: string }[] }>('window.titanioTab.browseHistory("/uno", 0, 100)')
  expect(despues.entries.some((e) => e.url === url), 'la entrada borrada no debe volver').toBe(false)
})

test('una web NO puede leer ni borrar el historial', async () => {
  /**
   * La invariante que más importa de esta pantalla: el historial es el registro de todo lo
   * que el usuario ha visitado. `titanioTab` es el preload de CONTENIDO y existe en cualquier
   * web, así que sin `isInternalSender` cualquier página podría leerlo entero.
   */
  await api(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/uno')
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.url.endsWith('/uno') === true)

  const enWeb = async (js: string): Promise<unknown> =>
    h.app.evaluate(async ({ webContents }, code) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('/uno'))
      if (!wc) throw new Error('no hay pestaña con la web de prueba')
      return wc.executeJavaScript(code)
    }, js)

  const leido = (await enWeb('window.titanioTab.browseHistory("", 0, 100)')) as { entries: unknown[]; total: number }
  expect(leido.entries, 'una web no debe ver ni una entrada').toEqual([])
  expect(leido.total).toBe(0)
  expect(await enWeb('window.titanioTab.clearHistory()'), 'ni poder borrarlo').toBe(0)

  // Y no lo borró: se comprueba contra el historial real, no contra lo que devolvió.
  const sigue = await enHistorial<{ total: number }>('window.titanioTab.browseHistory("", 0, 100)')
  expect(sigue.total, 'el historial tiene que seguir ahí').toBeGreaterThan(0)
})
