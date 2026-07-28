import { test, expect } from '@playwright/test'
import { launch, waitForState, serve, html, type Harness } from './helpers'

/**
 * Ser el navegador predeterminado.
 *
 * Lo que se prueba NO es el banner: es lo que pasa cuando otra app te manda un enlace. Un
 * banner que funciona con un backend que pierde el enlace es peor que no tener banner.
 */

let h: Harness
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  site = await serve({ '/desde-mail': html('Enlace externo') })
  h = await launch()
})
test.afterAll(async () => { await h?.close(); await site?.close() })

/** Simula lo que hace macOS al abrir un enlace con Monper como predeterminado. */
const enlaceDelSistema = (url: string): Promise<unknown> =>
  h.app.evaluate(({ app }, u) => app.emit('open-url', { preventDefault: () => {} }, u), url)

test('un enlace de otra app abre una pestaña', async () => {
  const antes = (await waitForState(h.win, () => true)).tabs.length
  await enlaceDelSistema(site.url + '/desde-mail')

  const s = await waitForState(h.win, (st) => st.tabs.some((t) => t.title === 'Enlace externo'), 15_000)
  expect(s.tabs.length, 'tiene que abrirse una pestaña, no reemplazar la que había').toBe(antes + 1)
  const abierta = s.tabs.find((t) => t.title === 'Enlace externo')!
  expect(s.activeId, 'y quedar delante: el usuario acaba de pedirla').toBe(abierta.id)
})

test('no abre nada con un esquema que no es web', async () => {
  // Solo declaramos http/https. Si llegara otra cosa —por una asociación mal hecha, o por un
  // enlace malicioso— no debe convertirse en una pestaña.
  const antes = (await waitForState(h.win, () => true)).tabs.length
  for (const u of ['file:///etc/passwd', 'javascript:alert(1)', 'monper://loquesea']) {
    await enlaceDelSistema(u)
  }
  await h.win.waitForTimeout(500)
  const s = await waitForState(h.win, () => true)
  expect(s.tabs.length, 'ninguno de esos esquemas debe abrir pestaña').toBe(antes)
})

test('en desarrollo no se ofrece ser el predeterminado', async () => {
  // `electron .` corre dentro de Electron.app: hacerlo predeterminado registraría ELECTRON,
  // no Monper, y dejaría los enlaces del usuario apuntando a un binario de desarrollo.
  const estado = await h.app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('newtab'))
    return wc ? wc.executeJavaScript('window.monperTab.getDefaultBrowser()') : null
  }) as { isDefault: boolean; shouldOffer: boolean } | null

  expect(estado, 'la new tab tiene que poder consultarlo').toBeTruthy()
  expect(estado!.shouldOffer, 'el banner no debe salir en desarrollo').toBe(false)
})
