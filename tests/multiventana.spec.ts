import { test, expect } from '@playwright/test'
import { launch, api, waitForState, installStateListener, type Harness } from './helpers'
import type { Page } from '@playwright/test'

let h: Harness
let segunda: Page

test.beforeAll(async () => {
  h = await launch()
  await waitForState(h.win, (s) => s.tabs.length > 0)
  await nuevaVentana()
  segunda = await otraVentana(h.win)
  await installStateListener(segunda)
})
test.afterAll(async () => { await h?.close() })

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
