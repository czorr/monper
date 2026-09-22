import { join } from 'path'
import { createServer, type Server, type ServerResponse } from 'http'
import { randomBytes } from 'crypto'
import { app, type WebContents } from 'electron'
import { readJson, writeJson } from './jsonfile'

/**
 * Control remoto del navegador: deja que un proceso externo (Claude Code, un script, otro
 * agente) conduzca Titanio.
 *
 * **Está apagado por defecto y tiene que encenderse a mano.** Encenderlo es una decisión con
 * consecuencias reales, así que se toman las precauciones que sí dependen de nosotros:
 *
 * - **Solo 127.0.0.1.** Nada de escuchar en la red; ni siquiera en la red local.
 * - **Token obligatorio** en cada petición, generado al azar la primera vez. Sin él, 401.
 * - **No hay ningún verbo que toque el vault.** Quien controla el navegador puede leer lo que
 *   la página muestre —eso es inherente a controlarlo— pero no puede pedir un secreto ni
 *   disparar un autofill: esos caminos siguen siendo solo del usuario.
 *
 * Lo que el usuario debe saber, y por eso está escrito en la UI: con esto encendido, quien
 * tenga el token puede navegar a los sitios donde tengas sesión abierta y leer lo que salga
 * en pantalla.
 *
 * No usa CDP a propósito: `--remote-debugging-port` solo puede fijarse al arrancar (no se
 * podría encender ni apagar en caliente) y da acceso total al navegador, incluidas cookies de
 * sesión. Esto expone un verbo por operación, que es justo lo que necesita `titaniowright`.
 */

const PORT = 9223

/**
 * En disco solo vive el token. **`enabled` es de memoria a propósito**: si se recordara, un
 * día lo enciendes para trabajar y al día siguiente la app arranca escuchando en silencio.
 * Encenderlo tiene que ser un gesto consciente en cada sesión.
 */
interface Config {
  token: string
}

/** Lo que el módulo necesita del resto del main, inyectado para no depender de index.ts. */
export interface RemoteDeps {
  activeWc: () => WebContents | undefined
  /** La vista de una pestaña concreta: un cliente externo NO debe tener que robarte el foco. */
  wcFor: (id: number) => WebContents | undefined
  listTabs: () => { id: number; url: string; title: string }[]
  activateTab: (id: number) => void
  /** `background: true` abre sin activar, para que el agente trabaje sin quitarte la vista. */
  newTab: (url?: string, background?: boolean) => number
  navigate: (url: string) => void
  /**
   * Pide permiso al usuario la primera vez que un cliente manda algo. Devuelve si lo concede.
   *
   * El token dice "este proceso conoce el secreto", no "el usuario quiere que ESTO conduzca su
   * navegador ahora mismo". Un diálogo nativo con el nombre del cliente es lo que convierte
   * un puerto abierto en una decisión.
   */
  confirmClient: (name: string) => Promise<boolean>
}

let file = ''
let cfg: Config = { token: '' }
let enabled = false
let server: Server | null = null
let deps: RemoteDeps | null = null

export function initRemote(d: RemoteDeps): void {
  deps = d
  file = join(app.getPath('userData'), 'remote.json')
  cfg = readJson<Config>(file, { token: '' }, 'la configuración del control remoto')
  if (!cfg.token) {
    cfg.token = randomBytes(24).toString('hex')
    writeJson(file, cfg, 'la configuración del control remoto', false)
  }
  enabled = false // siempre apagado al arrancar; ver el comentario de Config
}

export function remoteState(): { enabled: boolean; token: string; port: number } {
  return { enabled, token: cfg.token, port: PORT }
}

let avisar: (s: { enabled: boolean; port: number }) => void = () => {}
/** El chrome pinta un indicador mientras esté encendido: nunca debe estarlo sin verse. */
export function onRemoteState(cb: (s: { enabled: boolean; port: number }) => void): void {
  avisar = cb
}

export function setRemoteEnabled(on: boolean): void {
  enabled = on
  if (on) start()
  else stop()
  avisar({ enabled, port: PORT })
}

function stop(): void {
  server?.close()
  server = null
  olvidarAutorizaciones()
  console.log('[remote] apagado')
}

/**
 * Clientes ya autorizados, **solo en memoria**: al cerrar Titanio se olvidan, igual que
 * `enabled`. Un permiso concedido hace tres semanas no es un permiso.
 *
 * El Map guarda la promesa, no el booleano: si llegan cinco peticiones a la vez del mismo
 * cliente (y llegan: un agente encadena tools), sin esto saldrían cinco diálogos.
 */
const autorizaciones = new Map<string, Promise<boolean>>()
function autorizado(cliente: string): Promise<boolean> {
  let p = autorizaciones.get(cliente)
  if (!p) {
    p = (deps?.confirmClient(cliente) ?? Promise.resolve(false)).then((ok) => {
      // Un "no" no se cachea: si lo rechazaste por sorpresa, poder decir que sí luego.
      if (!ok) autorizaciones.delete(cliente)
      return ok
    })
    autorizaciones.set(cliente, p)
  }
  return p
}
/** Al apagar el control remoto se olvidan: volver a encenderlo vuelve a preguntar. */
function olvidarAutorizaciones(): void {
  autorizaciones.clear()
}

/** Respuesta JSON, siempre con CORS cerrado: esto no es para que lo llame una web. */
function json(res: ServerResponse, code: number, body: unknown): void {
  const s = JSON.stringify(body)
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': 'null' })
  res.end(s)
}

function start(): void {
  if (server) return
  server = createServer(async (req, res) => {
    // El token va en la cabecera, nunca en la URL: las URLs acaban en logs e historiales.
    const auth = req.headers['authorization']
    if (auth !== `Bearer ${cfg.token}`) { json(res, 401, { error: 'token inválido' }); return }

    if (req.method === 'GET' && req.url === '/status') {
      json(res, 200, { ok: true, version: app.getVersion(), tabs: deps?.listTabs() ?? [] })
      return
    }
    if (req.method !== 'POST' || req.url !== '/cmd') { json(res, 404, { error: 'no existe' }); return }

    // Quién dice ser el que llama. Se pregunta UNA vez por cliente y por sesión: ver
    // `confirmClient`. El nombre lo declara el propio cliente y por tanto no es una garantía
    // —el token es la credencial—, pero sí hace visible que algo empezó a conducir.
    const cliente = String(req.headers['x-titanio-client'] || 'un proceso sin identificar')
    if (!(await autorizado(cliente))) { json(res, 403, { error: 'el usuario no autorizó a este cliente' }); return }

    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    let cmd: { action?: string; [k: string]: unknown }
    try {
      cmd = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    } catch {
      json(res, 400, { error: 'json inválido' })
      return
    }

    try {
      json(res, 200, { result: await run(cmd) })
    } catch (e) {
      // Nunca se traga: quien conduce el navegador necesita saber por qué falló su orden.
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[remote] falló', cmd.action, '→', msg)
      json(res, 500, { error: msg })
    }
  })
  server.on('error', (e) => {
    console.error('[remote] no se pudo abrir el puerto', PORT, '→', e.message)
    server = null
    enabled = false
    avisar({ enabled, port: PORT })
  })
  // 127.0.0.1 explícito: escuchar en 0.0.0.0 lo abriría a toda la red local.
  server.listen(PORT, '127.0.0.1', () => console.log(`[remote] escuchando en 127.0.0.1:${PORT}`))
}

/** Los verbos: los mismos que necesita el Transport de titaniowright, ni uno más. */
async function run(cmd: { action?: string; [k: string]: unknown }): Promise<unknown> {
  if (!deps) throw new Error('el control remoto no está inicializado')
  const n = (v: unknown): number => Number(v ?? 0)
  const s = (v: unknown): string => String(v ?? '')
  /**
   * La pestaña sobre la que se opera: la que pida `tabId`, o la activa.
   *
   * Sin esto, un cliente externo tenía que activar una pestaña para leerla — o sea, quitarte
   * lo que estabas mirando. Poder trabajar de fondo es lo que hace que esto sea usable
   * mientras tú sigues usando el navegador.
   */
  const target = (): WebContents => {
    const w = cmd.tabId !== undefined ? deps!.wcFor(n(cmd.tabId)) : deps!.activeWc()
    if (!w) throw new Error(cmd.tabId !== undefined ? `no hay pestaña ${n(cmd.tabId)}` : 'no hay pestaña activa')
    return w
  }

  switch (cmd.action) {
    case 'tabs':
      return deps.listTabs()
    case 'activate':
      deps.activateTab(n(cmd.id))
      return true
    case 'newTab':
      return deps.newTab(cmd.url ? s(cmd.url) : undefined, cmd.background === true)
    case 'goto': {
      if (cmd.tabId !== undefined) { target().loadURL(s(cmd.url)); return true }
      deps.navigate(s(cmd.url))
      return true
    }
    case 'eval':
      return target().executeJavaScript(s(cmd.expression), true)
    case 'waitLoad': {
      // Cargar es asíncrono; sin esto el cliente lee una página en blanco y cree que no hay
      // nada. Con techo de tiempo: una promesa de red sin timeout es la app colgada.
      const w = target()
      if (!w.isLoading()) return true
      return new Promise<boolean>((resolve) => {
        const fin = (): void => { clearTimeout(t); w.off('did-stop-loading', fin); resolve(true) }
        const t = setTimeout(() => { w.off('did-stop-loading', fin); resolve(false) }, Math.min(60_000, n(cmd.timeout) || 20_000))
        w.on('did-stop-loading', fin)
      })
    }
    case 'mouse':
      target().sendInputEvent({ type: s(cmd.type) as 'mouseDown', x: n(cmd.x), y: n(cmd.y), button: 'left', clickCount: 1 } as never)
      return true
    case 'key':
      target().sendInputEvent({ type: s(cmd.type) as 'keyDown', keyCode: s(cmd.keyCode) } as never)
      return true
    case 'screenshot':
      return (await target().capturePage()).toDataURL()
    default:
      throw new Error(`acción desconocida: ${cmd.action}`)
  }
}
