import { test, expect } from '@playwright/test'
import { launch, api, serve, waitForState, type Harness } from './helpers'

/**
 * Fondo de la vista de la página.
 *
 * El bug: un sitio con **cabecera oscura y cuerpo blanco** salía con fondo negro. La causa era
 * que el color muestreado de la ESQUINA superior izquierda —que existe para pintar la costura
 * del redondeado y teñir el topbar— se usaba también como fondo de TODA la vista. En una
 * cabecera oscura esa esquina es negra, así que todo lo que la página no llegara a cubrir se
 * pintaba de negro. mediotiempo.com es exactamente ese caso.
 *
 * Son dos cosas distintas y ahora se miden por separado: `pageBg` es la esquina, `docBg` es el
 * papel (`body`/`html`, y blanco si ninguno pinta, igual que Chromium).
 */

let h: Harness
let site: { url: string; close: () => Promise<void> }

/** Cabecera negra ocupando la franja de arriba, cuerpo blanco. El caso del bug. */
const CABECERA_OSCURA = `<!doctype html><meta charset="utf-8"><title>Diario</title>
<style>html,body{margin:0;background:#ffffff}header{height:120px;background:#0b0b12}</style>
<body><header></header><main>Contenido</main></body>`

/** Sitio oscuro de verdad: el fondo NO puede volverse blanco por arreglar lo anterior. */
const TODO_OSCURO = `<!doctype html><meta charset="utf-8"><title>Oscuro</title>
<style>html,body{margin:0;background:#101014}</style><body><main>Contenido</main></body>`

/** Sin fondo declarado: Chromium lo pinta blanco, y nosotros también. */
const SIN_FONDO = `<!doctype html><meta charset="utf-8"><title>Desnudo</title><body>Hola</body>`

test.beforeAll(async () => {
  site = await serve({ '/cabecera': CABECERA_OSCURA, '/oscuro': TODO_OSCURO, '/desnudo': SIN_FONDO })
  h = await launch()
  await espiarFondos()
})
test.afterAll(async () => { await h?.close(); await site?.close() })

/**
 * Se intercepta `setBackgroundColor` en el prototipo, igual que layout.spec hace con
 * `setBorderRadius`. Electron no tiene getter para el fondo de una vista, así que la única
 * forma de medirlo es quedarse con lo que se le pidió.
 */
async function espiarFondos(): Promise<void> {
  await h.app.evaluate(({ WebContentsView }) => {
    const g = globalThis as unknown as { __fondos: string[] }
    if (g.__fondos) return
    g.__fondos = []
    const proto = WebContentsView.prototype as unknown as { setBackgroundColor: (c: string) => void }
    const orig = proto.setBackgroundColor
    proto.setBackgroundColor = function (c: string): void {
      g.__fondos.push(c)
      orig.call(this, c)
    }
  })
}

/** El último fondo pedido. Es lo que acaba viéndose donde la página no pinta. */
async function ultimoFondo(): Promise<string> {
  return h.app.evaluate(() => {
    const g = globalThis as unknown as { __fondos: string[] }
    return g.__fondos.at(-1) ?? ''
  })
}

async function limpiarFondos(): Promise<void> {
  await h.app.evaluate(() => { (globalThis as unknown as { __fondos: string[] }).__fondos = [] })
}

async function abrir(ruta: string, titulo: string): Promise<void> {
  await api(h.win, 'newTab')
  await limpiarFondos() // solo interesan los fondos de ESTA navegación
  await api(h.win, 'go', site.url + ruta)
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === titulo)
}

test('cabecera oscura sobre cuerpo blanco: el fondo es BLANCO, no el de la cabecera', async () => {
  await abrir('/cabecera', 'Diario')
  await expect
    .poll(ultimoFondo, { timeout: 8000, message: 'el fondo se tomó de la esquina, no del documento' })
    .toMatch(/^#?FFFFFF/i)
})

test('el topbar SÍ sigue el color de la esquina: son medidas distintas', async () => {
  // Si al arreglar el fondo se hubiera tocado también `pageBg`, el topbar dejaría de teñirse
  // con la cabecera y la costura del redondeado se vería como una franja de otro color.
  await abrir('/cabecera', 'Diario')
  const s = await waitForState(
    h.win,
    (st) => ((st.active as { pageColor?: string } | null)?.pageColor ?? '').toLowerCase() === '#0b0b12',
    8000
  )
  expect((s.active as { pageColor: string }).pageColor.toLowerCase()).toBe('#0b0b12')
})

test('un sitio oscuro de verdad sigue teniendo el fondo oscuro', async () => {
  // La otra dirección del arreglo: forzar blanco daría un fogonazo en cada página oscura.
  await abrir('/oscuro', 'Oscuro')
  await expect.poll(ultimoFondo, { timeout: 8000 }).toMatch(/^#?101014/i)
})

test('una página que no declara fondo se pinta blanca, como en Chromium', async () => {
  await abrir('/desnudo', 'Desnudo')
  await expect.poll(ultimoFondo, { timeout: 8000 }).toMatch(/^#?FFFFFF/i)
})
