import { join } from 'path'
import { createServer, type Server, type ServerResponse } from 'http'
import { randomBytes } from 'crypto'
import { app, type WebContents } from 'electron'
import { readJson, writeJson } from './jsonfile'

/**
 * Control remoto del navegador: deja que un proceso externo (Claude Code, un script, otro
 * agente) conduzca Monper.
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
 * sesión. Esto expone un verbo por operación, que es justo lo que necesita `monperwright`.
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
  listTabs: () => { id: number; url: string; title: string }[]
  activateTab: (id: number) => void
  newTab: (url?: string) => number
  navigate: (url: string) => void
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
  console.log('[remote] apagado')
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

/** Los verbos: los mismos que necesita el Transport de monperwright, ni uno más. */
async function run(cmd: { action?: string; [k: string]: unknown }): Promise<unknown> {
  if (!deps) throw new Error('el control remoto no está inicializado')
  const wc = deps.activeWc()
  const n = (v: unknown): number => Number(v ?? 0)
  const s = (v: unknown): string => String(v ?? '')

  switch (cmd.action) {
    case 'tabs':
      return deps.listTabs()
    case 'activate':
      deps.activateTab(n(cmd.id))
      return true
    case 'newTab':
      return deps.newTab(cmd.url ? s(cmd.url) : undefined)
    case 'goto':
      deps.navigate(s(cmd.url))
      return true
    case 'eval': {
      if (!wc) throw new Error('no hay pestaña activa')
      return wc.executeJavaScript(s(cmd.expression), true)
    }
    case 'mouse': {
      if (!wc) throw new Error('no hay pestaña activa')
      wc.sendInputEvent({ type: s(cmd.type) as 'mouseDown', x: n(cmd.x), y: n(cmd.y), button: 'left', clickCount: 1 } as never)
      return true
    }
    case 'key': {
      if (!wc) throw new Error('no hay pestaña activa')
      wc.sendInputEvent({ type: s(cmd.type) as 'keyDown', keyCode: s(cmd.keyCode) } as never)
      return true
    }
    case 'screenshot': {
      if (!wc) throw new Error('no hay pestaña activa')
      const img = await wc.capturePage()
      return img.toDataURL()
    }
    default:
      throw new Error(`acción desconocida: ${cmd.action}`)
  }
}
