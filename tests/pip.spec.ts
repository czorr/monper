import { test, expect } from '@playwright/test'
import { launch, api, serve, waitForState, type Harness } from './helpers'
import { itemsDeVideo } from '../src/main/contextmenu'

/**
 * Picture-in-picture, las DOS formas.
 *
 * 1. **PiP de un `<video>`** (`video.requestPictureInPicture()`) — el clásico: saca el vídeo a
 *    una ventanita flotante.
 * 2. **Document PiP** (`documentPictureInPicture.requestWindow()`) — el que usa Google Meet
 *    para su panel de controles. Abre una ventana con DOM propio, no un vídeo.
 *
 * Se prueban por separado porque fallan por motivos distintos. Y se prueba el EFECTO, no que la
 * API exista: la checklist de lanzamiento daba el PiP por bueno porque
 * `document.pictureInPictureEnabled` era `true` — que es exactamente comprobar la llamada en
 * vez del resultado, el error que ya nos costó dos sesiones.
 */

let h: Harness
let site: { url: string; close: () => Promise<void> }

const PAGINA = `<!doctype html><meta charset="utf-8"><title>PiP</title>
<body><video id="v" muted playsinline></video></body>
<script>
  // Un vídeo real y diminuto generado con canvas: pedir PiP sobre un <video> sin pistas falla
  // por falta de metadatos, no por el navegador, y eso enmascararía el resultado.
  const c = document.createElement('canvas')
  c.width = 320; c.height = 180
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#c33'; ctx.fillRect(0, 0, 320, 180)
  setInterval(() => { ctx.fillRect(0, 0, 320, 180) }, 100)
  const v = document.getElementById('v')
  v.srcObject = c.captureStream(10)
  v.play().catch(() => {})
</script>`

test.beforeAll(async () => {
  site = await serve({ '/': PAGINA })
  h = await launch()
  await api(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/')
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'PiP')
})
test.afterAll(async () => { await h?.close(); await site?.close() })

/** Activa la pestaña del vídeo. El auto-PiP se dispara al DEJARLA, así que hay que estar en ella. */
async function activarLaDelVideo(): Promise<void> {
  const s = await waitForState(h.win, (st) => st.tabs.some((t) => t.title === 'PiP'))
  const v = s.tabs.find((t) => t.title === 'PiP')!
  if (s.activeId !== v.id) {
    await api(h.win, 'selectTab', v.id)
    await waitForState(h.win, (st) => st.activeId === v.id)
  }
}

/** Ejecuta código en la pestaña activa CON gesto de usuario: el PiP lo exige. */
async function enPagina<T>(codigo: string): Promise<T> {
  return h.app.evaluate(async ({ webContents }, codigo) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('127.0.0.1'))
    if (!wc) throw new Error('la página de prueba no está abierta')
    return (await wc.executeJavaScript(codigo, true)) as T
  }, codigo) as Promise<T>
}

test('el PiP de un vídeo funciona de verdad, no solo existe la API', async () => {
  const r = await enPagina<{ ok: boolean; error?: string; enPip?: boolean }>(`(async () => {
    const v = document.getElementById('v')
    if (!document.pictureInPictureEnabled) return { ok: false, error: 'pictureInPictureEnabled=false' }
    if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }))
    try {
      const w = await v.requestPictureInPicture()
      return { ok: true, enPip: document.pictureInPictureElement === v, ancho: w.width }
    } catch (e) { return { ok: false, error: String(e && e.message || e) } }
  })()`)
  expect(r.error ?? '', 'el vídeo no entró en picture-in-picture').toBe('')
  expect(r.ok).toBe(true)
  expect(r.enPip, 'la API resolvió pero el vídeo no quedó en PiP').toBe(true)
})

/**
 * Marcado como fallo ESPERADO, no saltado: Electron 43 no implementa Document PiP.
 *
 * `test.fail()` lo convierte en un chivato — el día que Electron lo soporte, este test empezará
 * a fallar por pasar, y sabremos que se puede quitar la limitación del doc. Saltarlo se
 * quedaría callado para siempre.
 *
 * Medido, no supuesto (y mi primera hipótesis era otra, ver docs/browser-hardening.md):
 * - En una pestaña (`WebContentsView`): la API existe y `requestWindow()` rechaza con
 *   "Internal error: no window". Ni siquiera llega al `setWindowOpenHandler`.
 * - En una `BrowserWindow` normal servida por http: la promesa **no se resuelve nunca**.
 * O sea, no es cosa de nuestra arquitectura de vistas: falta el soporte en Electron.
 */
test('Document PiP: Meet abre su panel de controles con esto', async () => {
  /**
   * OJO AL LEER EL RESULTADO: `test.fail()` invierte el informe. Playwright dice "passed"
   * cuando el test falla —que es lo esperado hoy— y **"failed" el día que empiece a
   * funcionar**, que es justo el aviso que queremos. Saltarlo se quedaría callado para siempre.
   */
  test.fail()
  const r = await enPagina<{ soportado: boolean; ok: boolean; error?: string }>(`(async () => {
    if (!('documentPictureInPicture' in window)) return { soportado: false, ok: false, error: 'API ausente' }
    try {
      const w = await documentPictureInPicture.requestWindow({ width: 300, height: 200 })
      const ok = !!w && !w.closed
      if (w) w.close()
      return { soportado: true, ok }
    } catch (e) { return { soportado: true, ok: false, error: String(e && e.message || e) } }
  })()`)
  expect(r.soportado, 'Electron no expone documentPictureInPicture en esta versión').toBe(true)
  expect(r.error ?? '', 'la ventana de Document PiP fue rechazada').toBe('')
  expect(r.ok).toBe(true)
})

test('el PiP sobrevive al cambiar de pestaña, y el vídeo sigue corriendo', async () => {
  /**
   * El caso real del usuario: estás viendo un vídeo, te cambias de pestaña y esperas seguir
   * viéndolo en la ventanita. Es donde Monper SÍ puede tener la culpa: al cambiar de pestaña
   * ocultamos el `WebContentsView` de la anterior (regla de "solo la activa se dibuja"), y una
   * vista oculta puede perder el PiP o suspender el vídeo.
   */
  await enPagina(`(async () => {
    const v = document.getElementById('v')
    if (!document.pictureInPictureElement) await v.requestPictureInPicture()
  })()`)
  expect(await enPagina<boolean>(`!!document.pictureInPictureElement`), 'no entró en PiP').toBe(true)

  const antes = await enPagina<number>(`document.getElementById('v').currentTime`)

  // Se cambia a otra pestaña: la del vídeo pasa a estar oculta.
  const otra = await api<number>(h.win, 'newTab')
  await waitForState(h.win, (s) => s.activeId === otra)
  await new Promise((r) => setTimeout(r, 1200))

  expect(
    await enPagina<boolean>(`!!document.pictureInPictureElement`),
    'la ventanita de PiP se perdió al cambiar de pestaña'
  ).toBe(true)

  const despues = await enPagina<number>(`document.getElementById('v').currentTime`)
  expect(despues, 'el vídeo se congeló al ocultar su pestaña').toBeGreaterThan(antes)
})

/**
 * El menú contextual: es lo que de verdad le faltaba al usuario.
 *
 * El motor soporta PiP (los tests de arriba lo prueban) pero no había forma de PEDIRLO: Monper
 * reemplaza el menú nativo de Chromium por uno propio, y el nativo trae "Picture in picture" de
 * fábrica. Al construir el nuestro se cubrió el caso de la imagen y el del vídeo se quedó fuera.
 *
 * El primer intento miraba `mediaType` de los params del clic **y no funcionaba en YouTube**,
 * que es justo donde se quiere: YouTube cancela el `contextmenu` para pintar su propio menú, así
 * que el clic derecho que nos llega es el SEGUNDO y cae sobre ESE menú — `mediaType` vale
 * 'none'. Por eso ahora se le pregunta a la página si tiene vídeo.
 */
const acciones = { alternarPip: (): void => {}, copiarUrl: (): void => {}, guardar: (): void => {} }

test('el menú ofrece picture in picture cuando la PÁGINA tiene vídeo', () => {
  const items = itemsDeVideo({ hay: true, enPip: false, url: '' }, acciones)
  expect(items.map((i) => i.label)).toContain('Picture in picture')
})

test('si el vídeo ya está en PiP, el menú ofrece salir', () => {
  const items = itemsDeVideo({ hay: true, enPip: true, url: '' }, acciones)
  expect(items.map((i) => i.label)).toContain('Salir de picture in picture')
})

test('sin vídeo utilizable en la página no se añade nada', () => {
  // `hay:false` cubre los dos casos: no hay vídeo, o lo hay pero con disablePictureInPicture.
  expect(itemsDeVideo({ hay: false, enPip: false, url: 'https://x.test/v.mp4' }, acciones)).toEqual([])
})

test('un vídeo servido por blob: no ofrece copiar ni guardar', () => {
  // YouTube sirve así: esas dos entradas llevarían a una URL que no se puede abrir ni descargar.
  const items = itemsDeVideo({ hay: true, enPip: false, url: '' }, acciones)
  expect(items.map((i) => i.label)).not.toContain('Guardar vídeo')
})

test('con una URL de verdad sí se puede copiar y guardar', () => {
  const items = itemsDeVideo({ hay: true, enPip: false, url: 'https://x.test/v.mp4' }, acciones)
  expect(items.map((i) => i.label)).toEqual(
    expect.arrayContaining(['Picture in picture', 'Copiar dirección del vídeo', 'Guardar vídeo'])
  )
})

test('al dejar una pestaña que REPRODUCE, el vídeo se va solo a la ventanita', async () => {
  /**
   * Lo que el usuario pidió: "estoy en un vídeo, me cambio de tab y no veo el PiP". No hacía
   * falta un botón — hacía falta que saliera SOLO.
   */
  // Hay que ESTAR en la pestaña del vídeo: el auto-PiP se dispara en la transición de dejarla.
  // (La primera versión de este test no lo hacía y fallaba por eso, no por el código.)
  await activarLaDelVideo()
  await enPagina(`(async () => {
    if (document.pictureInPictureElement) await document.exitPictureInPicture()
    await document.getElementById('v').play()
  })()`)
  expect(await enPagina<boolean>(`!document.getElementById('v').paused`), 'el vídeo no arrancó').toBe(true)
  expect(await enPagina<boolean>(`!!document.pictureInPictureElement`)).toBe(false)

  const otra = await api<number>(h.win, 'newTab')
  await waitForState(h.win, (s) => s.activeId === otra)

  await expect
    .poll(() => enPagina<boolean>(`!!document.pictureInPictureElement`), { timeout: 8000 })
    .toBe(true)
})

test('al volver a la pestaña, el vídeo sale de la ventanita', async () => {
  // Dejarla flotando encima de su propio vídeo sería absurdo.
  await activarLaDelVideo()
  await expect
    .poll(() => enPagina<boolean>(`!!document.pictureInPictureElement`), { timeout: 8000 })
    .toBe(false)
})

test('una pestaña PAUSADA no saca ninguna ventanita al cambiar', async () => {
  // Si no, cada pestaña con un vídeo cargado escupiría un pop-up al navegar.
  await activarLaDelVideo()
  await enPagina(`(async () => {
    if (document.pictureInPictureElement) await document.exitPictureInPicture()
    document.getElementById('v').pause()
  })()`)
  const otra = await api<number>(h.win, 'newTab')
  await waitForState(h.win, (st) => st.activeId === otra)
  await new Promise((r) => setTimeout(r, 1000))
  expect(
    await enPagina<boolean>(`!!document.pictureInPictureElement`),
    'un vídeo pausado no debe abrir PiP al cambiar de pestaña'
  ).toBe(false)
})
