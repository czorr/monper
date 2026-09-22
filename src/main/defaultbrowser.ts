import { t as tr } from '../shared/i18n'
import { join } from 'path'
import { app, BrowserWindow } from 'electron'
import { readJson, writeJson } from './jsonfile'

/**
 * Ser el navegador predeterminado del sistema.
 *
 * Lo visible es un banner, pero eso es la punta. Lo que de verdad hay que resolver es que
 * **al hacer clic en un enlace desde otra app pase lo correcto**, y ahí hay tres trampas:
 *
 * 1. **Una sola instancia.** Sin `requestSingleInstanceLock`, cada enlace que abras desde
 *    Mail o Slack lanza un Titanio NUEVO. Con dos instancias sobre el mismo `userData`, las
 *    dos escriben los mismos JSON y la última en guardar gana: pierdes marcadores y vault.
 *    Es el fallo más caro de todos y no se ve hasta que ya pasó.
 * 2. **La URL llega antes de que exista la ventana.** En macOS, abrir un enlace con la app
 *    cerrada dispara `open-url` **antes** de `ready`. Si no se guarda, se pierde y el usuario
 *    ve arrancar Titanio en la página de inicio, sin su enlace.
 * 3. **Cada plataforma la entrega distinto.** macOS por `open-url`; Windows y Linux en
 *    `argv`, tanto al arrancar como en `second-instance`.
 *
 * Nada de esto se comprueba con el banner puesto: se comprueba abriendo un enlace.
 */

/** Los dos esquemas que definen "ser un navegador". */
const ESQUEMAS = ['http', 'https'] as const

interface Estado {
  /** Cuándo se descartó el banner. Se vuelve a ofrecer pasado `RECORDAR_MS`. */
  descartadoEn: number | null
}

/**
 * Insistir cada vez que abres el navegador es lo que hace que la gente odie estos banners.
 * Un mes es suficiente para que la pregunta vuelva a ser razonable.
 */
const RECORDAR_MS = 30 * 24 * 60 * 60 * 1000

let file = ''
let estado: Estado = { descartadoEn: null }

/** URLs que llegaron antes de que hubiera dónde abrirlas. */
const pendientes: string[] = []
let abrir: ((url: string) => void) | null = null

function vaciarPendientes(): void {
  if (!abrir) return
  while (pendientes.length) {
    const u = pendientes.shift()
    if (u) abrir(u)
  }
}

function encolar(url: string): void {
  if (!/^https?:\/\//i.test(url)) return // solo web: no somos el handler de nada más
  pendientes.push(url)
  vaciarPendientes()
}

/** Las URLs que vengan en la línea de comandos (Windows y Linux entregan así los enlaces). */
function deArgv(argv: string[]): void {
  for (const a of argv) if (/^https?:\/\//i.test(a)) encolar(a)
}

/**
 * Se llama ANTES de `app.whenReady()`.
 *
 * Devuelve false si otra instancia ya tenía el lock: en ese caso el arranque debe abortar
 * inmediatamente, sin crear ventanas ni tocar los ficheros de estado.
 */
export function reservarInstanciaUnica(): boolean {
  // En desarrollo el lock estorba: `pnpm dev` relanza la app mientras la anterior aún cierra,
  // y el segundo arranque se suicidaría. Fuera de producción no hay enlaces del sistema.
  if (!app.isPackaged) return true
  if (app.requestSingleInstanceLock()) return true
  app.quit()
  return false
}

/**
 * Registra los listeners de enlaces entrantes. También antes de `ready`: en macOS `open-url`
 * puede dispararse mientras la app todavía arranca.
 */
export function escucharEnlaces(): void {
  app.on('open-url', (e, url) => { e.preventDefault(); encolar(url) })
  app.on('second-instance', (_e, argv) => {
    deArgv(argv)
    // El usuario acaba de pedir algo: traer la ventana al frente es parte de la respuesta.
    const w = BrowserWindow.getAllWindows().find((x) => !x.getParentWindow())
    if (w) { if (w.isMinimized()) w.restore(); w.focus() }
  })
  deArgv(process.argv)
}

/** Ya hay dónde abrir: se entregan los enlaces que se quedaron esperando. */
export function initDefaultBrowser(abrirEnPestana: (url: string) => void): void {
  file = join(app.getPath('userData'), 'defaultbrowser.json')
  estado = readJson<Estado>(file, { descartadoEn: null }, 'el estado de navegador predeterminado')
  abrir = abrirEnPestana
  vaciarPendientes()
}

export function esPredeterminado(): boolean {
  try {
    return ESQUEMAS.every((e) => app.isDefaultProtocolClient(e))
  } catch {
    return false
  }
}

/**
 * Pide al sistema ser el predeterminado. macOS enseña su propio diálogo de confirmación.
 *
 * En desarrollo NO se hace: `electron .` corre dentro de Electron.app, así que registraría
 * **Electron** como tu navegador, no Titanio — y el usuario se quedaría con enlaces abriendo
 * un binario de desarrollo que un día borra. Se devuelve el motivo en vez de fallar mudo.
 */
export function hacerPredeterminado(): { ok: boolean; error?: string } {
  if (!app.isPackaged) {
    return { ok: false, error: tr("En desarrollo esto registraría Electron, no Titanio. Pruébalo en la app empaquetada.") }
  }
  try {
    const ok = ESQUEMAS.every((e) => app.setAsDefaultProtocolClient(e))
    return ok ? { ok: true } : { ok: false, error: tr("El sistema no aceptó el cambio.") }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** ¿Ofrecerlo? No si ya lo somos, no si se descartó hace poco, y nunca en desarrollo. */
export function debeOfrecerse(): boolean {
  if (!app.isPackaged || esPredeterminado()) return false
  const d = estado.descartadoEn
  return !d || Date.now() - d > RECORDAR_MS
}

export function descartarOferta(): void {
  estado = { descartadoEn: Date.now() }
  writeJson(file, estado, 'el estado de navegador predeterminado', false)
}
