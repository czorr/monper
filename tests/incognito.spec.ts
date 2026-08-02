import { readFileSync } from 'fs'
import { join } from 'path'
import { test, expect } from '@playwright/test'
import { launch, api, serve, waitForState, type Harness } from './helpers'
import { PARTICION_INCOGNITO, PARTICION_NORMAL, particionDe, esPersistente } from '../src/main/particiones'

/**
 * Ventanas de incógnito.
 *
 * Lo que se prueba es el AISLAMIENTO, no que exista un botón. Una ventana que dice ser de
 * incógnito y comparte cookies con la normal es peor que no tenerla: el usuario confía en ella
 * justo cuando más le importa. Por eso los tests van contra la sesión de Chromium de verdad
 * (cookies, localStorage) y contra lo que escribimos en disco (historial, sesión).
 */

let h: Harness
let site: { url: string; close: () => Promise<void> }
/** Los JSON de estado se leen desde el proceso de test: dentro de `evaluate` no hay `require`. */
let userData = ''

const PAGINA = `<!doctype html><meta charset="utf-8"><title>Aislada</title><body>hola</body>`

test.beforeAll(async () => {
  site = await serve({ '/': PAGINA })
  h = await launch()
  userData = await h.app.evaluate(({ app }) => app.getPath('userData'))
})
test.afterAll(async () => { await h?.close(); await site?.close() })

/** Crea una ventana de incógnito y devuelve su id. */
async function nuevaIncognito(): Promise<number> {
  return h.app.evaluate(({ BrowserWindow, Menu }) => {
    const antes = new Set(BrowserWindow.getAllWindows().map((w) => w.id))
    // El menú es el camino real del usuario, así que se dispara desde ahí y no por una API interna.
    const item = Menu.getApplicationMenu()
      ?.items.flatMap((i) => i.submenu?.items ?? [])
      .find((i) => i.label === 'Nueva ventana de incógnito')
    if (!item) throw new Error('no existe la entrada de menú de incógnito')
    item.click()
    const nueva = BrowserWindow.getAllWindows().find((w) => !antes.has(w.id))
    if (!nueva) throw new Error('el menú no abrió ninguna ventana')
    return nueva.id
  })
}

test('la partición de incógnito NO persiste, la normal sí', () => {
  /**
   * Es la línea que sostiene todo lo demás. Sin el prefijo `persist:`, Chromium tira cookies,
   * localStorage y caché al cerrar el proceso; con él, no. Si alguien "arregla" esta cadena
   * poniéndole `persist:`, incógnito deja de serlo en silencio y nada más se entera.
   */
  expect(particionDe(true)).toBe(PARTICION_INCOGNITO)
  expect(particionDe(false)).toBe(PARTICION_NORMAL)
  expect(esPersistente(PARTICION_INCOGNITO), 'incógnito no puede sobrevivir al cierre').toBe(false)
  expect(esPersistente(PARTICION_NORMAL)).toBe(true)
})

test('dos ventanas de incógnito comparten UNA sola sesión', async () => {
  // Si cada una tuviera la suya, iniciar sesión y abrir el sitio en otra ventana de incógnito
  // pediría el login otra vez. Chrome hace esto mismo.
  await nuevaIncognito()
  await nuevaIncognito()
  await expect.poll(async () => h.app.evaluate(({ webContents }) => {
    const enMemoria = new Set(
      webContents.getAllWebContents().filter((w) => w.session.storagePath === null).map((w) => w.session)
    )
    return enMemoria.size
  }), { timeout: 10_000 }).toBe(1)
})

/** Navega la pestaña de la ventana de incógnito y espera a que cargue. */
async function navegarEnIncognito(url: string): Promise<void> {
  await h.app.evaluate(async ({ webContents }, url) => {
    // La pestaña de incógnito es la única cuya sesión NO tiene ruta en disco.
    const wc = webContents.getAllWebContents().find((w) => w.session.storagePath === null && !w.getURL().startsWith('devtools'))
    if (!wc) throw new Error('no hay ninguna pestaña en una sesión en memoria')
    await wc.loadURL(url)
  }, url)
}

/** El historial tal y como queda EN DISCO. Es lo que sobrevive al cierre, que es lo que importa. */
function hostsDelHistorial(): string[] {
  try {
    const d = JSON.parse(readFileSync(join(userData, 'history.json'), 'utf-8'))
    const filas: { url?: string }[] = Array.isArray(d) ? d : (d.entries ?? d.items ?? [])
    return filas.map((e) => { try { return new URL(e.url ?? '').host } catch { return '' } })
  } catch { return [] }
}

test('la pestaña de incógnito vive en una sesión que no toca el disco', async () => {
  await nuevaIncognito()
  await expect.poll(async () => h.app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().some((w) => w.session.storagePath === null)
  ), { timeout: 10_000 }).toBe(true)

  // Y la ventana normal sigue en una sesión persistente: el aislamiento va en los dos sentidos.
  const normalEnDisco = await h.app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().some((w) => w.session.storagePath !== null)
  )
  expect(normalEnDisco, 'la ventana normal se quedó sin sesión persistente').toBe(true)
})

test('navegar en incógnito no deja rastro en el historial; en normal sí', async () => {
  /**
   * Va con CONTROL a propósito. Comprobar solo que el host no aparece pasaría igual si el
   * historial no se escribiera nunca en el arnés de pruebas — o sea, sería un test que no
   * puede fallar. La misma URL en una pestaña normal SÍ tiene que aparecer.
   */
  const host = new URL(site.url).host
  await nuevaIncognito()
  await navegarEnIncognito(site.url + '/')
  await expect.poll(hostsDelHistorial, { timeout: 8000 }).not.toContain(host)

  // Control: la misma URL, en una pestaña normal.
  const id = await api<number>(h.win, 'newTab')
  await waitForState(h.win, (s) => s.tabs.some((t) => t.id === id))
  await api(h.win, 'go', site.url + '/')
  await expect
    .poll(hostsDelHistorial, { timeout: 10_000 })
    .toContain(host)
})

/** Las URLs que quedan en session.json, forzando el guardado antes de leer. */
async function urlsDeLaSesionGuardada(): Promise<string[]> {
  // `before-quit` fuerza el guardado: si no, el debounce de 800 ms haría el test una carrera.
  await h.app.evaluate(({ app }) => { app.emit('before-quit') })
  try {
    const d = JSON.parse(readFileSync(join(userData, 'session.json'), 'utf-8'))
    return (d.ventanas ?? []).flatMap((g: { urls?: string[] }) => g.urls ?? [])
  } catch { return [] }
}

test('la sesión guardada no incluye las ventanas de incógnito', async () => {
  /**
   * Reabrir mañana las pestañas de incógnito sería contar en voz alta justo lo que se pidió no
   * contar. Se comprueba sobre el fichero que se escribe de verdad.
   */
  // Marca en la URL, no el host: el mismo host ya lo visitó una pestaña normal en el test de
  // arriba, así que buscar el host daría un falso positivo. Se busca lo que SOLO tocó incógnito.
  const MARCA = 'solo-incognito'
  await nuevaIncognito()
  await navegarEnIncognito(`${site.url}/?${MARCA}`)

  // Control otra vez: una pestaña normal en OTRO sitio, para saber que el fichero sí se escribe.
  const otro = await serve({ '/': '<!doctype html><title>Normal</title>' })
  try {
    await api(h.win, 'newTab')
    await api(h.win, 'go', otro.url + '/')
    await expect
      .poll(async () => (await urlsDeLaSesionGuardada()).some((u) => u.includes(new URL(otro.url).host)), { timeout: 10_000 })
      .toBe(true)
    expect(
      (await urlsDeLaSesionGuardada()).some((u) => u.includes(MARCA)),
      'la URL abierta en incógnito acabó en session.json'
    ).toBe(false)
  } finally { await otro.close() }
})

test('el estado que llega al chrome dice si la ventana es de incógnito', async () => {
  // Sin esto la ventana se vería idéntica a una normal, que es la peor ambigüedad posible.
  const s = await waitForState(h.win, () => true)
  expect(typeof s.incognito, 'BrowserState no expone `incognito`').toBe('boolean')
  expect(s.incognito, 'la ventana principal no es de incógnito').toBe(false)
})
