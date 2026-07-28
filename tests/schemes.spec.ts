import { test, expect } from '@playwright/test'
import { launch, api, waitForState, serve, type Harness } from './helpers'

/**
 * Esquemas que no son web (`mailto:`, `tel:`…).
 *
 * Un WebContentsView no sabe navegarlos: el enlace fallaba y **no pasaba nada**, sin error.
 * Se le pasan al sistema, pero solo los de una lista blanca — `shell.openExternal` con lo que
 * venga de una página es un agujero conocido.
 *
 * `shell.openExternal` se sustituye para no abrir Mail de verdad en cada ejecución. Lo que se
 * comprueba es a quién se le pasa y a quién no, que es exactamente la decisión de seguridad.
 */

const PAGINA = `<!doctype html><meta charset="utf-8"><title>Enlaces</title><body>
  <a id="correo" href="mailto:alguien@sitio.com?subject=hola">correo</a>
  <a id="tel" href="tel:+34600000000">llamar</a>
  <a id="fichero" href="file:///etc/passwd">fichero</a>
  <a id="raro" href="ms-msdt:/id">raro</a>
  <a id="nueva" href="mailto:otro@sitio.com" target="_blank">correo en nueva</a>
</body>`

let h: Harness
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  site = await serve({ '/': PAGINA })
  h = await launch()
  await h.app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __abiertos: string[] }
    g.__abiertos = []
    ;(shell as unknown as { openExternal: unknown }).openExternal = async (u: string) => { g.__abiertos.push(u) }
  })
  await api(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/')
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'Enlaces')
})
test.afterAll(async () => { await h?.close(); await site?.close() })

const abiertos = (): Promise<string[]> =>
  h.app.evaluate(() => (globalThis as unknown as { __abiertos: string[] }).__abiertos)

const limpiar = (): Promise<unknown> =>
  h.app.evaluate(() => { (globalThis as unknown as { __abiertos: string[] }).__abiertos = [] })

/** Pulsa un enlace de la página de prueba. */
const clic = (id: string): Promise<unknown> =>
  h.app.evaluate(async ({ webContents }, sel) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('http://127.0.0.1'))
    if (!wc) throw new Error('no hay pestaña de prueba')
    return wc.executeJavaScript(`document.getElementById(${JSON.stringify(sel)}).click()`)
  }, id)

test('mailto: y tel: se le pasan al sistema', async () => {
  await limpiar()
  await clic('correo')
  await clic('tel')
  await expect.poll(abiertos).toEqual([
    'mailto:alguien@sitio.com?subject=hola',
    'tel:+34600000000'
  ])
})

test('la pestaña NO navega: sigue donde estaba', async () => {
  // Si la navegación no se cancela, la pestaña se queda en un estado roto aunque el sistema
  // haya abierto el correo.
  const s = await waitForState(h.win, () => true)
  expect(s.tabs.find((t) => t.id === s.activeId)?.title).toBe('Enlaces')
})

test('file: y esquemas desconocidos se bloquean, no se abren', async () => {
  /**
   * La parte de seguridad. `shell.openExternal` con lo que venga de una página es un agujero
   * conocido: `file:` daría acceso al disco por el visor del sistema y hay esquemas que
   * ejecutan cosas (`ms-msdt:` en Windows). Es lista BLANCA: lo que no se conoce, no se abre.
   */
  await limpiar()
  await clic('fichero')
  await clic('raro')
  await h.win.waitForTimeout(300)
  expect(await abiertos(), 'ni file: ni un esquema desconocido deben llegar al sistema').toEqual([])
})

test('target=_blank con mailto: también se abre, sin dejar pestaña vacía', async () => {
  // `<a target="_blank">` no pasa por will-navigate sino por setWindowOpenHandler.
  const antes = (await waitForState(h.win, () => true)).tabs.length
  await limpiar()
  await clic('nueva')
  await expect.poll(abiertos).toEqual(['mailto:otro@sitio.com'])
  await h.win.waitForTimeout(300)
  const s = await waitForState(h.win, () => true)
  expect(s.tabs.length, 'no debe quedarse una pestaña en blanco').toBe(antes)
})

test('escribirlo en la barra lo abre, no lo busca en Google', async () => {
  // `normalizeUrl` mandaba a Google cualquier cosa que no fuese http(s): escribir
  // `mailto:x@y.com` acababa en una búsqueda de ese texto.
  await limpiar()
  await api(h.win, 'go', 'mailto:desde-la-barra@sitio.com')
  await expect.poll(abiertos).toEqual(['mailto:desde-la-barra@sitio.com'])
  const s = await waitForState(h.win, () => true)
  expect(s.tabs.find((t) => t.id === s.activeId)?.url, 'y la pestaña no se mueve').not.toContain('google.com/search')
})
