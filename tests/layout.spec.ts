import { test, expect } from '@playwright/test'
import { launch, api, waitForState, serve, html, type Harness } from './helpers'

/**
 * La vista de la página es un `WebContentsView` que cuelga del `contentView` de la ventana.
 * `addChildView` sobre una vista que YA cuelga la desengancha y la vuelve a enganchar, y
 * eso se llamaba en cada layout: colapsar el sidebar, abrir el chat, redimensionar.
 * Medido antes del arreglo: 12 de 12 llamadas eran redundantes.
 */

let h: Harness
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  site = await serve({ '/a': html('A'), '/b': html('B') })
  h = await launch()
})
test.afterAll(async () => { await h?.close(); await site?.close() })

/** Cuenta llamadas a addChildView y cuántas eran sobre la vista que ya estaba encima. */
async function instrumentar(): Promise<void> {
  await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.getParentWindow())!
    const cv = w.contentView as unknown as { addChildView: (v: unknown) => void; children: unknown[] }
    const g = globalThis as unknown as { __add: number; __red: number; __orig?: (v: unknown) => void }
    if (!g.__orig) {
      g.__orig = cv.addChildView.bind(cv)
      cv.addChildView = (v: unknown): void => {
        g.__add++
        if (cv.children[cv.children.length - 1] === v) g.__red++
        g.__orig!(v)
      }
    }
    g.__add = 0
    g.__red = 0
  })
}

const contadores = (): Promise<{ add: number; red: number }> =>
  h.app.evaluate(() => {
    const g = globalThis as unknown as { __add: number; __red: number }
    return { add: g.__add, red: g.__red }
  })

test('los cambios de layout no re-enganchan la vista activa', async () => {
  const a = await api<number>(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/a')
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'A')
  await instrumentar()

  for (let i = 0; i < 3; i++) {
    await api(h.win, 'setCollapsed', true); await new Promise((r) => setTimeout(r, 250))
    await api(h.win, 'setCollapsed', false); await new Promise((r) => setTimeout(r, 250))
    await api(h.win, 'setChat', true); await new Promise((r) => setTimeout(r, 250))
    await api(h.win, 'setChat', false); await new Promise((r) => setTimeout(r, 250))
  }
  const c = await contadores()
  expect(c.add, 'colapsar/abrir chat no debe re-enganchar la vista al compositor').toBe(0)
  expect(a).toBeTruthy()
})

test('cambiar de pestaña sí la pone al frente, una sola vez', async () => {
  const b = await api<number>(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/b')
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'B')
  await instrumentar()
  await api(h.win, 'selectTab', b) // ya activa: no hace falta tocar nada
  await new Promise((r) => setTimeout(r, 150))
  expect((await contadores()).add, 'reseleccionar la activa no debe re-enganchar').toBe(0)

  const otra = (await waitForState(h.win, (s) => s.tabs.length > 1)).tabs.find((t) => t.id !== b)!
  await instrumentar()
  await api(h.win, 'selectTab', otra.id)
  await waitForState(h.win, (s) => s.activeId === otra.id)
  const c = await contadores()
  expect(c.add, 'la nueva activa tiene que subir al frente').toBe(1)
  expect(c.red, 'y esa vez no era redundante').toBe(0)
})

test('la omnibox oculta la vista y la devuelve', async () => {
  // Al editar la URL se oculta la vista nativa para que se vea el dropdown. Lo que se fija
  // aquí es que VUELVA, incluso si entre medias hubo un cambio de layout: es donde una caché
  // de visibilidad (que hubo, y se quitó) dejaba la página oculta.
  const visibles = (): Promise<number> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => !x.getParentWindow())!
      const kids = w.contentView.children as unknown as { getVisible?: () => boolean }[]
      return kids.filter((k) => k.getVisible?.() !== false).length
    })

  const antes = await visibles()
  await api(h.win, 'setOmnibox', true)
  await new Promise((r) => setTimeout(r, 150))
  expect(await visibles(), 'al editar la URL la vista activa se oculta').toBeLessThan(antes)

  await api(h.win, 'setOmnibox', false)
  await new Promise((r) => setTimeout(r, 150))
  expect(await visibles(), 'al cerrar el editor la vista tiene que volver').toBe(antes)

  // Y sigue volviendo aunque entre medias haya habido un layout.
  await api(h.win, 'setOmnibox', true)
  await api(h.win, 'setCollapsed', true)
  await new Promise((r) => setTimeout(r, 300))
  await api(h.win, 'setCollapsed', false)
  await api(h.win, 'setOmnibox', false)
  await new Promise((r) => setTimeout(r, 300))
  expect(await visibles(), 'un layout con la omnibox abierta no debe dejarla oculta').toBe(antes)
})

test('solo la pestaña activa se dibuja, sea interna o web', async () => {
  // Las vistas se apilan en el MISMO rect. Dejar varias visibles solo era inofensivo mientras
  // la de encima fuese opaca Y ya hubiese pintado, y ninguna de las dos se cumple siempre:
  // una página interna es translúcida, y una pestaña recién creada tarda ~80ms en su primer
  // frame. En ese hueco se veía lo de detrás a través de ella (abrir un marcador desde
  // settings mostraba la new tab). Por eso la regla no distingue casos.
  const visibles = (): Promise<number> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => !x.getParentWindow())!
      const kids = w.contentView.children as unknown as { getVisible?: () => boolean }[]
      return kids.filter((v) => typeof v.getVisible === 'function' && v.getVisible()).length
    })

  // Dos pestañas internas: sin el arreglo, las dos quedaban visibles a la vez.
  await api(h.win, 'newTab')
  await api(h.win, 'openSettings')
  await waitForState(h.win, (s) => (s.tabs.find((t) => t.id === s.activeId) as { internal?: string } | undefined)?.internal === 'settings')
  await expect.poll(visibles, { timeout: 5000 }).toBe(1)

  // Y con una web activa tampoco: el hueco antes de su primer frame dejaba ver las de detrás.
  await api(h.win, 'go', site.url + '/a')
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'A')
  await expect.poll(visibles, { timeout: 5000 }).toBe(1)

  // El caso que lo destapó: abrir un marcador estando en settings crea una pestaña nueva,
  // y durante sus ~80ms sin pintar no debe verse nada por detrás.
  await api(h.win, 'toggleBookmark')
  const marcadores = await api<{ id: string }[]>(h.win, 'getBookmarks')
  const s = await waitForState(h.win, () => true)
  await api(h.win, 'closeTab', s.activeId)
  await api(h.win, 'openSettings')
  await waitForState(h.win, (st) => (st.tabs.find((t) => t.id === st.activeId) as { internal?: string } | undefined)?.internal === 'settings')
  await h.app.evaluate(({ ipcMain }, id) => ipcMain.emit('bookmarks:open', null, id), marcadores[0].id)
  for (let i = 0; i < 8; i++) {
    expect(await visibles(), 'ni un solo instante con dos vistas dibujándose').toBe(1)
    await new Promise((r) => setTimeout(r, 25))
  }
})
