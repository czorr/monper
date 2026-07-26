import { test, expect } from '@playwright/test'
import { launch, api, type Harness } from './helpers'

/**
 * Los popovers son ventanas nativas (la vista de la página se dibuja encima del DOM, así
 * que un div no sirve). Estos tests existen porque los cuatro se migraron a una factoría
 * común y hasta entonces nada comprobaba que abrieran, midieran y se cerraran.
 */

let h: Harness

test.beforeAll(async () => { h = await launch() })
test.afterAll(async () => { await h?.close() })

/** Ventanas visibles que no son la principal. */
async function visiblePopovers(): Promise<{ width: number; height: number }[]> {
  return h.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed() && w.isVisible() && !!w.getParentWindow())
      .map((w) => {
        const b = w.getBounds()
        return { width: b.width, height: b.height }
      })
  )
}

test('al arrancar no hay ninguna ventana de popover', async () => {
  // Se pre-creaban las tres para que el primer click fuera instantáneo, y costaba 344MB de
  // base (3 renderers) por 30ms que nadie nota. Ahora nacen en el primer uso.
  const total = await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  expect(total, 'alguien volvió a pre-crear popovers: mide antes de hacerlo').toBe(1)
  expect(await visiblePopovers()).toEqual([])
})

test('un popover se crea una vez y se reutiliza', async () => {
  const ids = async (): Promise<number[]> =>
    h.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter((w) => !!w.getParentWindow()).map((w) => w.id)
    )
  await api(h.win, 'openProfileMenu', { x: 40, y: 60, width: 32, height: 32 })
  await expect.poll(visiblePopovers).toHaveLength(1)
  const primera = await ids()
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('profilemenu:close'))
  await expect.poll(visiblePopovers).toEqual([])
  await api(h.win, 'openProfileMenu', { x: 40, y: 60, width: 32, height: 32 })
  await expect.poll(visiblePopovers).toHaveLength(1)
  // Misma ventana: se oculta y se reutiliza, no se destruye y recrea en cada apertura.
  expect(await ids()).toEqual(primera)
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('profilemenu:close'))
})

test('el menú de perfil abre anclado y con su ancho', async () => {
  await api(h.win, 'openProfileMenu', { x: 40, y: 60, width: 32, height: 32 })
  await expect.poll(visiblePopovers).toHaveLength(1)
  const [p] = await visiblePopovers()
  expect(p.width).toBe(264 + 24) // panel + el margen de la sombra (PAD * 2)
  expect(p.height).toBeGreaterThan(24)
})

test('se cierra desde el renderer', async () => {
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('profilemenu:close'))
  await expect.poll(visiblePopovers).toEqual([])
})

test('site info abre con su propio ancho', async () => {
  await api(h.win, 'openSiteInfo', { x: 200, y: 60, width: 120, height: 28 })
  await expect.poll(visiblePopovers).toHaveLength(1)
  expect((await visiblePopovers())[0].width).toBe(340 + 24)
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('siteinfo:close'))
  await expect.poll(visiblePopovers).toEqual([])
})

test('solo hay un popover abierto a la vez', async () => {
  await api(h.win, 'openProfileMenu', { x: 40, y: 60, width: 32, height: 32 })
  await expect.poll(visiblePopovers).toHaveLength(1)
  await api(h.win, 'openSiteInfo', { x: 200, y: 60, width: 120, height: 28 })
  // El de perfil se cierra al perder el foco (`blur`), no se quedan los dos.
  await expect.poll(visiblePopovers).toHaveLength(1)
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('siteinfo:close'))
})

test('el alto que reporta el renderer mueve la ventana', async () => {
  await api(h.win, 'openProfileMenu', { x: 40, y: 60, width: 32, height: 32 })
  await expect.poll(visiblePopovers).toHaveLength(1)
  // Hay que esperar a que el panel haya reportado SU alto antes de inyectar uno falso: si
  // no, su medición llega después y gana. (Esto se coló como test inestable, no como bug.)
  let anterior = -1
  await expect
    .poll(async () => {
      const h0 = (await visiblePopovers())[0]?.height ?? 0
      const estable = h0 > 24 && h0 === anterior
      anterior = h0
      return estable
    })
    .toBe(true)
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('profilemenu:height', null, 500))
  await expect.poll(async () => (await visiblePopovers())[0]?.height).toBe(500 + 24)
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('profilemenu:close'))
})

test('el vault abre con su ventana propia, alineado a la derecha', async () => {
  // El vault no pasa por la factoría: es opaco y con sombra nativa, así que su ancho es
  // el del panel sin el margen de la sombra. Es a propósito (ver docs/popovers.md).
  await api(h.win, 'openVault', { x: 600, y: 60, width: 28, height: 28 })
  await expect.poll(visiblePopovers).toHaveLength(1)
  expect((await visiblePopovers())[0].width).toBe(320)
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('vault:closeWindow'))
  await expect.poll(visiblePopovers).toEqual([])
})

test('el dropdown de la omnibox no roba el foco', async () => {
  await api(h.win, 'omniShow', { x: 300, y: 40, width: 400, height: 30 }, { items: [] })
  await expect.poll(visiblePopovers).toHaveLength(1)
  // Su ancho lo manda el anchor, no una constante.
  expect((await visiblePopovers())[0].width).toBe(400 + 24)
  const chromeKeepsFocus = await h.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow())
    return main?.isFocused() ?? false
  })
  expect(chromeKeepsFocus).toBe(true)
  await api(h.win, 'omniHide')
  await expect.poll(visiblePopovers).toEqual([])
})

test('un popover no abre con una fila resaltada', async () => {
  // El anillo de foco de macOS aparecía al activarse la ventana y parecía selección. No se
  // arregla con `blur` (medido: activeElement ya era body); se arregla no pintando anillo
  // hasta que el usuario usa el teclado. Ver components/popover/focus.ts.
  await api(h.win, 'openVault', { x: 600, y: 60, width: 28, height: 28 })
  await expect.poll(visiblePopovers).toHaveLength(1)
  // La Page tarda un instante en engancharse tras crearse la ventana.
  await expect.poll(() => h.app.windows().some((p) => p.url().includes('vault.html'))).toBe(true)
  const vault = h.app.windows().find((p) => p.url().includes('vault.html'))

  // Con poll: en la corrida completa el React del vault puede no haber pintado el botón
  // todavía, y una lectura única devolvía null. Era fragilidad del test, no del código.
  const leer = async (): Promise<{ sinTeclado: string; conTeclado: string } | null> =>
    vault!.evaluate(() => {
      const b = document.querySelector('button') as HTMLElement | null
      if (!b) return null
      const root = document.documentElement
      b.focus()
      const sinTeclado = getComputedStyle(b).outlineStyle
      root.dataset['kbd'] = '1' // simula que el usuario tabuló
      const conTeclado = getComputedStyle(b).outlineStyle
      delete root.dataset['kbd']
      return { sinTeclado, conTeclado }
    })
  await expect.poll(async () => (await leer())?.sinTeclado).toBe('none')
  expect((await leer())?.conTeclado).not.toBe('none') // el teclado no pierde el anillo
  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('vault:closeWindow'))
})

test('los submenús del menú de perfil abren al lado, sin cerrar el padre', async () => {
  // El submenú es otra ventana nativa: sale FUERA del panel y ahí un div no se vería. Y no
  // roba el foco, porque si lo robara el menú padre se cerraría por su propio `blur`.
  await api(h.win, 'openProfileMenu', { x: 40, y: 60, width: 32, height: 32 })
  await expect.poll(() => h.app.windows().some((p) => p.url().includes('profilemenu.html'))).toBe(true)
  const pm = h.app.windows().find((p) => p.url().includes('profilemenu.html'))!

  const contenido = async (): Promise<string> => {
    const sub = h.app.windows().find((p) => p.url().includes('profilesubmenu.html'))
    return sub ? (await sub.evaluate(() => document.body.innerText)).replace(/\n/g, ' ') : ''
  }

  await pm.locator('div', { hasText: /^Developers$/ }).first().hover()
  await expect.poll(contenido).toContain('Developer tools')
  // Los dos a la vez: el padre sigue abierto.
  expect(await visiblePopovers()).toHaveLength(2)

  // Cambiar de sección reusa la misma ventana con otros datos.
  await pm.locator('div', { hasText: /^Extensions$/ }).first().hover()
  await expect.poll(contenido).toContain('Manage all extensions')

  // Pasar por una fila sin submenú lo cierra. Se apunta al TEXTO: el div de esa fila incluye
  // además su atajo (`⌘,`), así que `hasText: /^Settings$/` no casaba con ella.
  await pm.getByText('Settings', { exact: true }).hover()
  await expect.poll(visiblePopovers).toHaveLength(1)

  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('profilemenu:close'))
  await expect.poll(visiblePopovers).toEqual([])
})
