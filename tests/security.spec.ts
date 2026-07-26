import { test, expect } from '@playwright/test'
import { launch, api, waitForState, serve, html, type Harness } from './helpers'

/**
 * Invariantes de seguridad. Si uno de estos falla, no es un test quisquilloso: es una
 * regresión que expone datos del usuario o le da a una web capacidades que no debe tener.
 */

interface BookmarkLike { id: string; url: string; title: string }

let h: Harness
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  site = await serve({ '/': html('Página cualquiera') })
  h = await launch()
  // Todos los tests miran una pestaña con una web cargada: se navega una vez aquí para
  // que ninguno dependa del orden de ejecución.
  await api(h.win, 'go', site.url + '/')
  await waitForState(h.win, (s) => s.tabs.some((t) => t.title === 'Página cualquiera'))
})
test.afterAll(async () => { await h?.close(); await site?.close() })

test('las páginas se cargan sin node y con aislamiento de contexto', async () => {
  const prefs = await h.app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .filter((wc) => wc.getURL().startsWith('http://127.0.0.1'))
      .map((wc) => {
        const p = (wc as unknown as { getLastWebPreferences: () => Record<string, unknown> }).getLastWebPreferences()
        return { nodeIntegration: p?.['nodeIntegration'], contextIsolation: p?.['contextIsolation'] }
      })
  )
  expect(prefs.length).toBeGreaterThan(0)
  for (const p of prefs) {
    expect(p.nodeIntegration).toBeFalsy()
    expect(p.contextIsolation).not.toBe(false)
  }
})

test('el API del preload no expone nada que huela a secreto', async () => {
  const keys = await h.win.evaluate(() =>
    Object.keys((window as never as Record<string, object>)['monper'] ?? {})
  )
  const sospechosos = keys.filter((k) => /secret|password|passwd|apikey|api_key|credential/i.test(k))
  expect(sospechosos, `el preload expone ${sospechosos.join(', ')}`).toEqual([])
})

test('ningún canal IPC lleva secretos en el nombre', async () => {
  const channels = await h.app.evaluate(({ ipcMain }) => ipcMain.eventNames().map(String))
  const sospechosos = channels.filter((c) => /secret|password|passwd|apikey/i.test(c))
  expect(sospechosos, `canales sospechosos: ${sospechosos.join(', ')}`).toEqual([])
})

test('el chrome no puede escribir datos privados por IPC', async () => {
  // Los canales de datos privados están restringidos a las páginas internas
  // (newtab/settings/error/downloads). El chrome no es una de ellas, y esto lo fija.
  // Hay que crear uno: la app ya no trae marcadores de fábrica.
  await api(h.win, 'toggleBookmark')
  await expect.poll(async () => (await api<BookmarkLike[]>(h.win, 'getBookmarks')).length).toBe(1)
  const before = await api<BookmarkLike[]>(h.win, 'getBookmarks')
  await api(h.win, 'removeBookmark', before[0].id)
  await new Promise((r) => setTimeout(r, 500))
  const after = await api<BookmarkLike[]>(h.win, 'getBookmarks')
  expect(after).toHaveLength(before.length)
})

test('una web no recibe el bridge de Monper', async () => {
  // El preload de contenido expone su propio API acotado; `monper` (el del chrome, con
  // newTab, closeTab, chatSend…) no debe existir en una página cualquiera.
  const leaked = await h.app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('http://127.0.0.1'))
    if (!wc) return 'sin pestaña'
    return wc.executeJavaScript('typeof window.monper')
  })
  expect(leaked).toBe('undefined')
})

test('una web no alcanza node ni el runtime de Electron', async () => {
  // Nada de pedir permisos aquí: sin decisión previa el handler abre un diálogo NATIVO y
  // el test se quedaría colgado esperando un click. Lo que sí se puede fijar es que la
  // página no tenga forma de salir del sandbox.
  const globals = await h.app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('http://127.0.0.1'))
    if (!wc) throw new Error('no hay pestaña con la web de prueba')
    return wc.executeJavaScript(
      `[typeof require, typeof process, typeof module, typeof globalThis.electron].join(',')`
    )
  })
  expect(globals).toBe('undefined,undefined,undefined,undefined')
})

test('una web no puede leer ni cambiar los permisos de los sitios', async () => {
  // `monperTab` SÍ existe en una web: es el preload de contenido. Lo que la separa de
  // settings es `isInternalSender`, y esto es lo que lo fija. Sin ello, cualquier página
  // podría enumerar dónde has dado la cámara y concedérsela a sí misma.
  const origen = 'https://ejemplo-permisos.test'
  const wcEval = async (js: string): Promise<unknown> =>
    h.app.evaluate(async ({ webContents }, code) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('http://127.0.0.1'))
      if (!wc) throw new Error('no hay pestaña con la web de prueba')
      return wc.executeJavaScript(code)
    }, js)

  expect(await wcEval('window.monperTab.listSitePermissions()'), 'una web no debe ver ningún sitio').toEqual([])
  expect(
    await wcEval(`window.monperTab.setSitePermission(${JSON.stringify(origen)}, 'camera', 'granted')`),
    'conceder desde una web tiene que ser rechazado'
  ).toBe(false)
  expect(await wcEval('window.monperTab.clearSitePermissions(null)'), 'borrar todo desde una web también').toBe(false)
})

test('el control remoto arranca apagado y se ve cuando está encendido', async () => {
  // Dos garantías que van juntas: encenderlo no sobrevive al cierre de la app (nunca escucha
  // en silencio al día siguiente) y mientras esté activo hay un indicador fijo en el chrome.
  const estado = (): Promise<{ enabled: boolean }> => api(h.win, 'getRemoteState')
  expect((await estado()).enabled, 'al arrancar tiene que estar apagado').toBe(false)

  const pill = h.win.locator('button', { hasText: 'Remoto' })
  await expect(pill).toHaveCount(0)

  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('profilesubmenu:action', null, 'dev:remote'))
  await expect(pill, 'encendido sin indicador visible es exactamente lo que no queremos').toBeVisible()
  expect((await estado()).enabled).toBe(true)

  await pill.click() // el indicador es además el interruptor de pánico
  await expect(pill).toHaveCount(0)
  expect((await estado()).enabled).toBe(false)
})
