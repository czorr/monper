import { test, expect } from '@playwright/test'
import { launch, api, waitForState, serve, type Harness } from './helpers'

/**
 * El topbar se pinta con el color REAL de los píxeles bajo él (se captura la franja
 * superior de la página), para que funcione con gradientes, imágenes y video.
 */

/** Franja superior roja, resto azul, y muy alta para poder scrollear. */
const pagina = `<!doctype html><meta charset="utf-8"><title>Franjas</title>
  <body style="margin:0">
    <div id="top" style="height:300px;background:#ff0000"></div>
    <div style="height:5000px;background:#0000ff"></div>
  </body>`

let h: Harness
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  site = await serve({ '/': pagina })
  h = await launch()
  // La navegación va aquí: si vive en el primer test, el segundo no funciona aislado.
  await api(h.win, 'go', site.url + '/')
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'Franjas')
})
test.afterAll(async () => { await h?.close(); await site?.close() })

const color = async (): Promise<string> => {
  const s = await waitForState(h.win, () => true)
  return String((s.active as { pageColor?: string } | null)?.pageColor ?? '')
}

/**
 * Canal dominante del color muestreado. Con tolerancia a propósito: la muestra promedia
 * 24x4 px a 1x1, así que un rojo puro puede salir `#fe0100`. Comparar hex exacto hacía
 * fallar el test por un 1 en un canal, que es ruido, no comportamiento.
 */
async function dominante(): Promise<'r' | 'g' | 'b' | '?'> {
  const c = await color()
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c)
  if (!m) return '?'
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16))
  if (r > 180 && g < 60 && b < 60) return 'r'
  if (g > 180 && r < 60 && b < 60) return 'g'
  if (b > 180 && r < 60 && g < 60) return 'b'
  return '?'
}

/**
 * Scroll SUAVE a propósito: un `scrollTo` seco genera un único evento y no reproduce el
 * bug. Lo que fallaba era la ráfaga de eventos de un flick real, donde el throttle se queda
 * con una muestra de mitad del recorrido y nadie mira el final.
 */
const scrollA = (y: number): Promise<unknown> =>
  h.app.evaluate(async ({ webContents }, top) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('http://127.0.0.1'))
    await wc?.executeJavaScript(`window.scrollTo({ top: ${top}, behavior: 'smooth' })`)
    await new Promise((r) => setTimeout(r, 900)) // deja que la animación termine
  }, y)

test('arriba de la página el topbar coge el color de la franja superior', async () => {
  await expect.poll(dominante, { timeout: 8000 }).toBe('r')
})

test('al volver arriba coge el color sin necesitar otro scroll', async () => {
  // El bug: el throttle descartaba los eventos que llegaban mientras había una muestra
  // pendiente y no tomaba ninguna al final, así que se quedaba con el color de MITAD del
  // recorrido. Hacía falta un scroll extra para que reaccionara.
  await scrollA(4000)
  await expect.poll(dominante, { timeout: 8000 }).toBe('b')

  await scrollA(0)
  // Sin más scrolls: tiene que llegar al rojo por sí solo.
  await expect.poll(dominante, { timeout: 8000 }).toBe('r')
})

test('lo que se pinta después del último evento de scroll también se muestrea', async () => {
  // El muestreo captura píxeles con `capturePage`, que en un runner sin GPU no devuelve nada
  // fiable; los otros dos tests aguantan porque cualquier muestra posterior los corrige, pero
  // este depende de que UNA muestra concreta caiga en su ventana.
  test.skip(!!process.env['CI'], 'capturePage no es fiable en CI (sin GPU)')
  // Esta es la forma del bug real: en macOS el momentum y el rebote elástico siguen
  // animando DESPUÉS del último evento `scroll` del DOM, así que el píxel final se pinta
  // cuando ya nadie está mirando. Aquí se emula cambiando el color 150ms después del último
  // evento — más tarde que la captura del throttle, y dentro de la ventana de reposo.
  await scrollA(2000)
  await expect.poll(dominante, { timeout: 8000 }).toBe('b')

  const pintarVerde = h.app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('http://127.0.0.1'))
    await wc?.executeJavaScript(`
      window.scrollTo(0, 0);
      setTimeout(() => { document.getElementById('top').style.background = '#00ff00' }, 150)
    `)
  })
  await pintarVerde
  await expect.poll(dominante, { timeout: 8000 }).toBe('g')
})
