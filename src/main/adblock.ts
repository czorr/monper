import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { app, net, webContents, type Session } from 'electron'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import { readJson, writeJson } from './jsonfile'

/**
 * Bloqueo de anuncios y rastreadores a nivel de RED.
 *
 * Se usa el motor de Ghostery (el mismo linaje que uBlock/Brave) porque lo difícil de un
 * adblocker no es interceptar la petición, es el matching de decenas de miles de filtros: eso
 * no se reescribe a mano.
 *
 * Deliberadamente **sin filtros cosméticos** por ahora: ocultar los huecos que deja el anuncio
 * exige inyectar CSS/JS en cada página, y eso es superficie nueva en las pestañas. Primero lo
 * que no puede romper nada; la cosmética vendrá después, medida.
 *
 * Efecto de lado que sí buscamos: el agente headless corre en esta misma partición
 * (`agent/headless.ts`), así que navega sin anuncios — menos DOM que leer y páginas más
 * rápidas. El adblocker es tanto para el usuario como para el agente.
 */

interface AdblockState {
  enabled: boolean
  /** Dominios donde el usuario desactivó el bloqueo (un adblocker sin escape rompe sitios). */
  allow: string[]
}

const POR_DEFECTO: AdblockState = { enabled: true, allow: [] }

let file = ''
let estado: AdblockState = POR_DEFECTO
let blocker: ElectronBlocker | null = null
let sesion: Session | null = null
let refresco: NodeJS.Timeout | null = null

/** Bloqueos contados por webContents, para poder enseñar "N bloqueados en esta página". */
const contador = new Map<number, number>()

function guardar(): void {
  writeJson(file, estado, 'la configuración del adblocker', false)
}

/** Dominio registrable, que es la unidad con la que razona el usuario ("youtube.com"). */
function dominioDe(hostname: string): string {
  return hostname.replace(/^www\./, '')
}

/**
 * El sitio de la PESTAÑA, preguntándoselo al webContents.
 *
 * `Request.sourceHostname` sale del `referrer`, y el referrer llega vacío o recortado según la
 * política de la página: con él, la allowlist habría fallado justo en los sitios que más
 * cuidan su referrer. La URL del webContents es la que el usuario tiene delante, y es la que
 * él cree estar permitiendo.
 */
function sitioDe(webContentsId: number | undefined): string {
  if (webContentsId === undefined) return ''
  const wc = webContents.fromId(webContentsId)
  if (!wc) return ''
  try {
    return new URL(wc.getURL()).hostname
  } catch {
    return '' // about:blank y demás: no es un sitio que se pueda permitir
  }
}

function permitido(hostname: string): boolean {
  if (!hostname) return false
  const d = dominioDe(hostname)
  return estado.allow.some((a) => d === a || d.endsWith('.' + a))
}

/**
 * Caché del motor ya compilado en `userData`.
 *
 * Sin esto, cada arranque son varios MB de listas descargadas y parseadas, y hasta que termina
 * las primeras páginas se pintan CON anuncios — que es justo lo que el usuario nota. Con la
 * caché, el motor está listo antes de la primera navegación y la actualización va detrás.
 */
function caching(): { path: string; read: (p: string) => Promise<Uint8Array>; write: (p: string, b: Uint8Array) => Promise<void> } {
  return {
    path: join(app.getPath('userData'), 'adblock', 'engine.bin'),
    read: (p) => readFile(p),
    write: async (p, b) => {
      await mkdir(join(app.getPath('userData'), 'adblock'), { recursive: true })
      await writeFile(p, b)
    }
  }
}

/**
 * Construye el motor. `net.fetch` (no el `fetch` global) para que respete el proxy y las
 * opciones de red de Electron.
 *
 * Descargar las listas le revela nuestra IP al CDN, nada más: el matching es 100% local, así
 * que nadie de fuera se entera de qué páginas visitas. Es la misma línea que se trazó con los
 * favicons (ver favicons.ts): un servicio externo puede vernos pedir un recurso genérico,
 * nunca la navegación.
 */
async function construir(): Promise<ElectronBlocker | null> {
  try {
    return await ElectronBlocker.fromPrebuiltAdsAndTracking(net.fetch, caching())
  } catch (err) {
    // Sin listas no hay bloqueo, pero el navegador tiene que seguir navegando.
    console.error('[adblock] no se pudieron cargar las listas de filtros:', err)
    return null
  }
}

/**
 * Engancha los listeners en la sesión.
 *
 * OJO: Electron admite UN solo listener por sesión y por evento — registrar otro
 * `onBeforeRequest` en `persist:monper` DESACTIVA este sin avisar de nada. Si algún día hace
 * falta otro interceptor, tiene que encadenarse aquí dentro, no registrarse por su cuenta.
 */
function enganchar(ses: Session): void {
  ses.webRequest.onBeforeRequest((details, callback) => {
    const b = blocker
    if (!b || !estado.enabled) return callback({})

    // El main frame nunca se bloquea: cargar la página que el usuario pidió no es negociable,
    // y de paso es el momento natural para reiniciar el contador de esa pestaña.
    if (details.resourceType === 'mainFrame') {
      if (details.webContentsId !== undefined) contador.set(details.webContentsId, 0)
      return callback({})
    }

    // Allowlist: se mira el sitio DE LA PESTAÑA, no el del recurso. Si no, desactivar el
    // bloqueo en un sitio no serviría de nada: sus anuncios vienen de terceros.
    // La consulta sólo se hace si hay algo en la allowlist: sin ella, cero coste por petición.
    if (estado.allow.length > 0 && permitido(sitioDe(details.webContentsId))) return callback({})

    b.onBeforeRequest(details, callback)
  })

  ses.webRequest.onHeadersReceived((details, callback) => {
    const b = blocker
    if (!b || !estado.enabled) return callback({})
    b.onHeadersReceived(details, callback)
  })
}

function desenganchar(ses: Session): void {
  ses.webRequest.onBeforeRequest(null)
  ses.webRequest.onHeadersReceived(null)
}

export async function initAdblock(ses: Session): Promise<void> {
  file = join(app.getPath('userData'), 'adblock.json')
  estado = readJson<AdblockState>(file, POR_DEFECTO, 'la configuración del adblocker')
  sesion = ses

  // Los listeners se registran YA, aunque el motor tarde en cargar: si se registran después,
  // las peticiones de la primera página pasan sin filtrar.
  enganchar(ses)

  blocker = await construir()
  if (blocker) {
    // `tabId` es el webContentsId (así lo rellena fromElectronDetails).
    blocker.on('request-blocked', (req) => {
      contador.set(req.tabId, (contador.get(req.tabId) ?? 0) + 1)
    })
  }

  // Las listas caducan: se refrescan cada 12 h contra la caché (si no cambiaron, no hay
  // descarga). Un adblocker con listas de hace un mes bloquea la mitad.
  refresco = setInterval(() => { void refrescar() }, 12 * 60 * 60 * 1000)
}

async function refrescar(): Promise<void> {
  const nuevo = await construir()
  if (nuevo) blocker = nuevo
}

export function adblockState(): { enabled: boolean; allow: string[]; ready: boolean } {
  return { enabled: estado.enabled, allow: [...estado.allow], ready: blocker !== null }
}

export function setAdblockEnabled(on: boolean): void {
  estado = { ...estado, enabled: on }
  guardar()
}

/** Activa/desactiva el bloqueo en un dominio concreto (lo que ve el usuario como "en este sitio"). */
export function setAdblockAllowed(hostname: string, permitir: boolean): void {
  const d = dominioDe(hostname)
  if (!d) return
  const allow = estado.allow.filter((a) => a !== d)
  if (permitir) allow.push(d)
  estado = { ...estado, allow }
  guardar()
}

export function adblockCountFor(webContentsId: number): number {
  return contador.get(webContentsId) ?? 0
}

export function stopAdblock(): void {
  if (refresco) { clearInterval(refresco); refresco = null }
  if (sesion) desenganchar(sesion)
}
