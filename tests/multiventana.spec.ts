import { test, expect } from '@playwright/test'
import { launch, api, waitForState, installStateListener, serve, html, type Harness } from './helpers'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let h: Harness
let segunda: Page
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  site = await serve({ '/a': html('A'), '/b': html('B') })
  h = await launch()
  await waitForState(h.win, (s) => s.tabs.length > 0)
  await nuevaVentana()
  segunda = await otraVentana(h.win)
  await installStateListener(segunda)
})
test.afterAll(async () => { await h?.close(); await site?.close() })

/** ⌘N no se puede pulsar desde Playwright: se dispara el propio item del menú. */
async function nuevaVentana(): Promise<void> {
  await h.app.evaluate(({ Menu }) => {
    const archivo = Menu.getApplicationMenu()?.items.find((i) => i.label === 'Archivo')
    const item = archivo?.submenu?.items.find((i) => i.label === 'Nueva ventana')
    if (!item) throw new Error('no existe el item "Nueva ventana"')
    item.click()
  })
}

/** La ventana de chrome que no es la que ya conocemos. */
async function otraVentana(conocida: Page): Promise<Page> {
  const hasta = Date.now() + 10_000
  while (Date.now() < hasta) {
    const w = h.app.windows().find((p) => p !== conocida && p.url().includes('index.html'))
    if (w) { await w.waitForLoadState('domcontentloaded'); return w }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('no apareció una segunda ventana')
}

test('⌘N abre una segunda ventana con su propia pestaña', async () => {
  const sb = await waitForState(segunda, (s) => s.tabs.length > 0)
  expect(sb.activeId).not.toBeNull()
})

test('cada ventana tiene sus pestañas: abrir en una no toca la otra', async () => {
  const b = segunda
  const antesA = await waitForState(h.win, (s) => s.tabs.length > 0)
  const antesB = await waitForState(b, (s) => s.tabs.length > 0)

  await api(b, 'newTab')
  const despB = await waitForState(b, (s) => s.tabs.length === antesB.tabs.length + 1)
  const despA = await waitForState(h.win, (s) => s.tabs.length === antesA.tabs.length)

  expect(despB.tabs.length).toBe(antesB.tabs.length + 1)
  expect(despA.tabs.length).toBe(antesA.tabs.length)
  // Y los ids no se solapan: son mapas distintos, no una lista global filtrada.
  const idsA = new Set(despA.tabs.map((t) => t.id))
  expect(despB.tabs.some((t) => idsA.has(t.id))).toBe(false)
})

test('cerrar una pestaña en la segunda ventana no cierra nada en la primera', async () => {
  const b = segunda
  const antesA = await waitForState(h.win, (s) => s.tabs.length > 0)
  const id = await api<number>(b, 'newTab')
  await waitForState(b, (s) => s.tabs.some((t) => t.id === id))
  await api(b, 'closeTab', id)
  await waitForState(b, (s) => !s.tabs.some((t) => t.id === id))
  const despA = await waitForState(h.win, (s) => s.tabs.length === antesA.tabs.length)
  expect(despA.tabs.map((t) => t.id).sort()).toEqual(antesA.tabs.map((t) => t.id).sort())
})

test('sacar una pestaña la MUDA a una ventana nueva, con su historial', async () => {
  // Que se mude y no se recree es todo el punto: recrearla desde la URL perdería el historial
  // de navegación, el scroll y lo que hubiera escrito en un formulario.
  await api(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/a')
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'A')
  await api(h.win, 'go', site.url + '/b')
  const antes = await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'B')
  const id = antes.activeId!
  expect((antes.active as { canBack: boolean }).canBack).toBe(true)

  const ventanasAntes = h.app.windows().length
  await h.app.evaluate(({ ipcMain }, tabId) => ipcMain.emit('tabs:tearOff', null, tabId), id)

  // Ya no está en la de origen…
  await waitForState(h.win, (s) => !s.tabs.some((t) => t.id === id))
  // …y está en una tercera ventana, con su historial intacto.
  const nueva = await new Promise<Page>((res, rej) => {
    const hasta = Date.now() + 10_000
    const mira = async (): Promise<void> => {
      const w = h.app.windows().find((p) => p !== h.win && p !== segunda && p.url().includes('index.html'))
      if (w) { await w.waitForLoadState('domcontentloaded'); res(w); return }
      if (Date.now() > hasta) { rej(new Error('no apareció la ventana de la pestaña sacada')); return }
      setTimeout(() => void mira(), 100)
    }
    void mira()
  })
  expect(h.app.windows().length).toBeGreaterThan(ventanasAntes)
  await installStateListener(nueva)
  const s = await waitForState(nueva, (st) => st.tabs.some((t) => t.id === id))
  expect(s.tabs.find((x) => x.id === id)!.title).toBe('B')
  expect(s.activeId, 'la pestaña mudada queda activa en su ventana nueva').toBe(id)
  expect((s.active as { canBack: boolean }).canBack,
    'si se hubiera recreado desde la URL no habría historial').toBe(true)
})

test('no se saca la única pestaña de una ventana', async () => {
  const s0 = await waitForState(segunda, (s) => s.tabs.length > 0)
  for (const t of s0.tabs.slice(1)) await api(segunda, 'closeTab', t.id)
  const uno = await waitForState(segunda, (s) => s.tabs.length === 1)
  // Se cuentan solo las ventanas de chrome: `windows()` incluye popovers, que van y vienen.
  const chromes = (): number => h.app.windows().filter((p) => p.url().includes('index.html')).length
  const antes = chromes()
  await h.app.evaluate(({ ipcMain }, tabId) => ipcMain.emit('tabs:tearOff', null, tabId), uno.tabs[0].id)
  await new Promise((r) => setTimeout(r, 400))
  expect(chromes()).toBe(antes)
})

test('la sesión nunca guarda una página interna, aunque en dev sean http', async () => {
  /**
   * `pnpm dev` sirve las páginas internas desde `http://localhost:5173`, y dev comparte perfil
   * con la app instalada. El filtro de sesión solo miraba el esquema, así que la New tab de dev
   * se guardaba y la app EMPAQUETADA arrancaba pidiendo un servidor que no existe:
   * ERR_CONNECTION_REFUSED en su propia página de bienvenida.
   */
  const userData = await h.app.evaluate(({ app }) => app.getPath('userData'))
  let guardada = ''
  try { guardada = readFileSync(join(userData, 'session.json'), 'utf-8') } catch { /* aún no existe */ }
  // Puede no existir todavía; lo que no puede es contener una interna.
  for (const p of ['newtab.html', 'settings.html', 'downloads.html', 'history.html', 'bookmarks.html', 'error.html']) {
    expect(guardada, `la sesión guardó ${p}`).not.toContain(p)
  }
})
