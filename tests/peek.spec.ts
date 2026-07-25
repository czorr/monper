import { test, expect } from '@playwright/test'
import { launch, api, type Harness } from './helpers'

/**
 * El peek: el sidebar flotante que sale al pasar el ratón por el botón de expandir.
 * Entra deslizándose desde el borde izquierdo y se retrae hacia él — y para que la salida
 * exista, el main tiene que avisar ANTES de esconder la ventana (una ventana oculta no pinta).
 */

/**
 * Local-only: el peek se abre con hover intent y a los 180ms comprueba dónde está el cursor
 * REAL (`screen.getCursorScreenPoint()`). En un runner de CI no hay cursor que valga, así que
 * el peek nunca llega a abrirse y el test no mide nada del producto.
 */
test.skip(() => !!process.env['CI'], 'necesita el cursor real del sistema')

let h: Harness

test.beforeAll(async () => { h = await launch() })
test.afterAll(async () => { await h?.close() })

const peekPage = async (): Promise<ReturnType<Harness['app']['windows']>[number]> => {
  await expect.poll(() => h.app.windows().some((p) => p.url().includes('peekbar.html'))).toBe(true)
  return h.app.windows().find((p) => p.url().includes('peekbar.html'))!
}

/**
 * Pide el peek anclado a donde está el cursor REAL.
 *
 * No vale con `peekShow`: el main aplica hover intent y a los 180ms comprueba
 * `screen.getCursorScreenPoint()`. Playwright manda eventos sintéticos y no mueve el cursor
 * del sistema, así que el peek nunca llegaba a abrirse. En vez de tocar el producto para
 * hacerlo testeable, se le pasa un anchor que contiene al cursor.
 */
const mostrar = async (): Promise<void> => {
  await h.app.evaluate(({ ipcMain, screen, BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.getParentWindow())!
    const cb = w.getContentBounds()
    const p = screen.getCursorScreenPoint()
    ipcMain.emit('peek:show', null, { x: p.x - cb.x - 30, y: p.y - cb.y - 30, width: 60, height: 60 })
  })
  await new Promise((r) => setTimeout(r, 300)) // hover intent
}

const visible = (): Promise<boolean> =>
  h.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((w) => w.isVisible() && !!w.getParentWindow()))

/** Animación CSS que tiene puesta el panel del peek ahora mismo. */
const animacion = async (): Promise<string> => {
  const p = await peekPage()
  return p.evaluate(() => {
    const el = document.querySelector('[style*="animation"]') as HTMLElement | null
    return el ? getComputedStyle(el).animationName : 'ninguna'
  })
}

test('entra deslizándose desde la izquierda', async () => {
  await api(h.win, 'setCollapsed', true)
  await new Promise((r) => setTimeout(r, 700)) // el peek ignora el hover justo tras colapsar
  await mostrar()
  await expect.poll(visible).toBe(true)
  // Con poll, no una lectura única: en la corrida completa el React del peek puede no haber
  // pintado todavía y `querySelector` devolvía nada.
  await expect.poll(animacion).toBe('peek-slide-in')
})

test('al ocultarlo se retrae antes de desaparecer', async () => {
  // La ventana NO se esconde en el mismo tick: si lo hiciera, no habría salida que ver.
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('peek:hide'))
  await expect.poll(animacion).toBe('peek-slide-out')
  expect(await visible(), 'sigue visible mientras se retrae').toBe(true)
  await expect.poll(visible, { timeout: 3000 }).toBe(false)
})

test('si vuelve el ratón mientras se retrae, entra otra vez', async () => {
  await mostrar()
  await expect.poll(visible).toBe(true)
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('peek:hide'))
  // Se vuelve a pedir enseguida, antes de que termine la retirada.
  await mostrar()
  await expect.poll(animacion).toBe('peek-slide-in')
  await new Promise((r) => setTimeout(r, 400))
  expect(await visible(), 'la retirada cancelada no debe esconderlo después').toBe(true)
})
