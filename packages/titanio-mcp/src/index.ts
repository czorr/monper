#!/usr/bin/env node
/**
 * titanio-mcp — tu web logueada, como herramientas, para cualquier IA.
 *
 * El navegador es el único software de tu máquina que ya está autenticado en todo lo que
 * usas. Y hasta ahora era el único que no lo exponía a nada: por eso existe una industria
 * entera construyendo integraciones y apps OAuth para datos que ya están renderizados en una
 * pestaña con tu sesión abierta.
 *
 * Esto es el puente. Un servidor MCP por stdio, sin dependencias, que habla con un Titanio en
 * marcha por su servidor local. Cualquier cliente MCP —Claude Code, Cursor, lo que sea— pasa
 * a poder abrir, leer y operar sitios **con tu sesión**, sin API, sin OAuth y sin que los
 * datos salgan de tu máquina.
 *
 * Lo que NO hace, y no es un descuido:
 *  - no expone el vault ni el autofill: los secretos siguen siendo solo del usuario;
 *  - no rellena campos de contraseña (`fill` los rechaza), por lo mismo;
 *  - no arranca Titanio ni enciende el control remoto: eso es una decisión del usuario, en su
 *    UI, con un indicador visible mientras esté activo.
 */

import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { createInterface } from 'readline'

const NOMBRE = 'titanio-mcp'
const VERSION = '0.1.0'
/** Versiones del protocolo que sabemos hablar, de más nueva a más vieja. */
const PROTOCOLOS = ['2025-06-18', '2025-03-26', '2024-11-05']

// ---------------------------------------------------------------- conexión con Titanio

const PUERTO = Number(process.env['MONPER_PORT'] || 9223)
const BASE = `http://127.0.0.1:${PUERTO}`

/**
 * El token lo genera Titanio y vive en su carpeta de datos. Se lee de ahí para que instalar
 * esto sea pegar cuatro líneas de config y nada más — pedirle al usuario que copie un token
 * a mano es una barrera por nada, y acaba en un fichero de configuración compartido.
 */
function leerToken(): string {
  const delEntorno = process.env['MONPER_TOKEN']
  if (delEntorno) return delEntorno
  const candidatos = [
    join(homedir(), 'Library', 'Application Support', 'Titanio', 'remote.json'), // macOS
    join(process.env['APPDATA'] || join(homedir(), 'AppData', 'Roaming'), 'Titanio', 'remote.json'),
    join(process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config'), 'Titanio', 'remote.json')
  ]
  for (const f of candidatos) {
    try {
      const t = JSON.parse(readFileSync(f, 'utf8'))?.token
      if (typeof t === 'string' && t) return t
    } catch {
      /* ese perfil no existe en esta plataforma: se prueba el siguiente */
    }
  }
  throw new Error(
    'No encuentro el token de Titanio. Abre Titanio al menos una vez, o define MONPER_TOKEN.'
  )
}

let token = ''

interface Cmd { action: string; [k: string]: unknown }

/** Una orden al navegador. Los errores se propagan con su motivo: nunca un fallo mudo. */
async function cmd<T = unknown>(c: Cmd): Promise<T> {
  if (!token) token = leerToken()
  let r: Response
  try {
    r = await fetch(`${BASE}/cmd`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-titanio-client': process.env['MONPER_CLIENT_NAME'] || 'un cliente MCP'
      },
      body: JSON.stringify(c)
    })
  } catch {
    // El caso común con diferencia: Titanio cerrado, o el control remoto apagado.
    throw new Error(
      `No hay ningún Titanio escuchando en 127.0.0.1:${PUERTO}. Ábrelo y enciende ` +
      'Perfil → Developers → Remote debugging.'
    )
  }
  if (r.status === 401) throw new Error('Token rechazado por Titanio. Borra su remote.json o define MONPER_TOKEN.')
  if (r.status === 403) throw new Error('El usuario no autorizó a este cliente en el diálogo de Titanio.')
  const cuerpo = (await r.json().catch(() => ({}))) as { result?: T; error?: string }
  if (!r.ok || cuerpo.error) throw new Error(cuerpo.error || `Titanio respondió ${r.status}`)
  return cuerpo.result as T
}

const evalEn = <T = unknown>(tabId: number | undefined, expression: string): Promise<T> =>
  cmd<T>({ action: 'eval', tabId, expression })

// ---------------------------------------------------------------- JS que corre en la página

/**
 * Texto legible de la página. No es `innerText` del body a pelo: eso trae el menú, el footer,
 * el banner de cookies y el chat de soporte, y en un contexto de LLM eso son miles de tokens
 * de ruido que además tapan la respuesta. Se prefiere el contenedor semántico y se podan los
 * elementos que nunca son contenido.
 */
const JS_LEER = (max: number): string => `(() => {
  const basura = 'nav,header,footer,aside,script,style,noscript,svg,iframe,[role=navigation],[role=banner],[role=contentinfo],[aria-hidden=true]'
  const raiz = document.querySelector('main,article,[role=main]') || document.body
  const copia = raiz.cloneNode(true)
  copia.querySelectorAll(basura).forEach((n) => n.remove())
  const t = (copia.innerText || '').replace(/\\n{3,}/g, '\\n\\n').trim()
  return { title: document.title, url: location.href, text: t.slice(0, ${max}), truncated: t.length > ${max} }
})()`

/** Click por texto visible. Un agente piensa en "el botón de Descargar", no en un selector. */
const JS_CLICK = (texto: string): string => `(() => {
  const objetivo = ${JSON.stringify(texto)}.trim().toLowerCase()
  const clicables = [...document.querySelectorAll('a,button,[role=button],[role=link],input[type=submit],input[type=button],summary,[onclick]')]
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const etiqueta = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').trim().toLowerCase()
  const exacto = clicables.filter(visible).find((el) => etiqueta(el) === objetivo)
  const parcial = exacto || clicables.filter(visible).find((el) => etiqueta(el).includes(objetivo))
  if (!parcial) return { ok: false, error: 'no encuentro nada clicable con ese texto' }
  parcial.scrollIntoView({ block: 'center' })
  parcial.click()
  return { ok: true, clicked: etiqueta(parcial).slice(0, 80) }
})()`

/**
 * Rellena por etiqueta. **Rechaza los campos de contraseña a propósito**: los secretos son del
 * usuario y del vault, y ninguna IA —ni la nuestra— los escribe. Ver docs/vault-architecture.md.
 */
const JS_FILL = (etiqueta: string, valor: string): string => `(() => {
  const objetivo = ${JSON.stringify(etiqueta)}.trim().toLowerCase()
  const campos = [...document.querySelectorAll('input,textarea,select')]
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const nombre = (el) => {
    const l = el.labels && el.labels[0] ? el.labels[0].innerText : ''
    return (l || el.getAttribute('aria-label') || el.placeholder || el.name || '').trim().toLowerCase()
  }
  const campo = campos.filter(visible).find((el) => nombre(el) === objetivo)
    || campos.filter(visible).find((el) => nombre(el).includes(objetivo))
  if (!campo) return { ok: false, error: 'no encuentro ese campo' }
  if (campo.type === 'password') return { ok: false, error: 'Titanio no escribe contraseñas: eso es cosa del vault y del usuario' }
  const setter = Object.getOwnPropertyDescriptor(campo.constructor.prototype, 'value')?.set
  setter ? setter.call(campo, ${JSON.stringify(valor)}) : (campo.value = ${JSON.stringify(valor)})
  campo.dispatchEvent(new Event('input', { bubbles: true }))
  campo.dispatchEvent(new Event('change', { bubbles: true }))
  return { ok: true, filled: nombre(campo).slice(0, 80) }
})()`

// ---------------------------------------------------------------- las herramientas

interface Tab { id: number; url: string; title: string }
type Contenido = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

interface Herramienta {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run: (a: Record<string, unknown>) => Promise<Contenido[]>
}

const texto = (t: string): Contenido[] => [{ type: 'text', text: t }]
const numOpt = (v: unknown): number | undefined => (v === undefined || v === null ? undefined : Number(v))

const objeto = (props: Record<string, unknown>, req: string[] = []): Record<string, unknown> => ({
  type: 'object', properties: props, required: req
})
const pTab = { tabId: { type: 'number', description: 'Pestaña sobre la que actuar. Por defecto, la que el usuario tiene delante.' } }

const HERRAMIENTAS: Herramienta[] = [
  {
    name: 'open_page',
    description:
      'Abre una URL en Titanio CON LA SESIÓN DEL USUARIO y espera a que cargue. Sirve para sitios ' +
      'que requieren login y que por tanto no puedes leer de ninguna otra forma. Abre en segundo ' +
      'plano por defecto: no le quita al usuario lo que está mirando.',
    inputSchema: objeto({
      url: { type: 'string', description: 'URL completa' },
      foreground: { type: 'boolean', description: 'true para traerla al frente. Por defecto false.' }
    }, ['url']),
    run: async (a) => {
      const tabId = await cmd<number>({ action: 'newTab', url: String(a['url']), background: a['foreground'] !== true })
      await cmd({ action: 'waitLoad', tabId })
      const t = (await cmd<Tab[]>({ action: 'tabs' })).find((x) => x.id === tabId)
      return texto(JSON.stringify({ tabId, url: t?.url, title: t?.title }, null, 2))
    }
  },
  {
    name: 'read_page',
    description:
      'Devuelve el texto legible de una página ya abierta, sin menús, cabeceras ni pies. ' +
      'Es la forma barata de leer: usa screenshot solo si necesitas ver el diseño.',
    inputSchema: objeto({
      ...pTab,
      maxChars: { type: 'number', description: 'Techo de caracteres. Por defecto 20000.' }
    }),
    run: async (a) => {
      const max = Math.min(200_000, Number(a['maxChars'] || 20_000))
      const r = await evalEn<{ title: string; url: string; text: string; truncated: boolean }>(numOpt(a['tabId']), JS_LEER(max))
      return texto(`# ${r.title}\n${r.url}\n\n${r.text}${r.truncated ? '\n\n[…recortado]' : ''}`)
    }
  },
  {
    name: 'list_tabs',
    description: 'Las pestañas abiertas en Titanio, con su id, título y URL.',
    inputSchema: objeto({}),
    run: async () => texto(JSON.stringify(await cmd<Tab[]>({ action: 'tabs' }), null, 2))
  },
  {
    name: 'click',
    description: 'Pulsa el elemento cuyo texto visible coincida (enlace, botón, pestaña…).',
    inputSchema: objeto({ text: { type: 'string', description: 'Texto visible del elemento' }, ...pTab }, ['text']),
    run: async (a) => {
      const r = await evalEn<{ ok: boolean; error?: string; clicked?: string }>(numOpt(a['tabId']), JS_CLICK(String(a['text'])))
      if (!r.ok) throw new Error(r.error || 'no se pudo pulsar')
      await cmd({ action: 'waitLoad', tabId: numOpt(a['tabId']), timeout: 8000 })
      return texto(`Pulsado: ${r.clicked}`)
    }
  },
  {
    name: 'fill',
    description:
      'Escribe en un campo, identificado por su etiqueta, placeholder o aria-label. ' +
      'Rechaza los campos de contraseña: los secretos son del usuario, no de la IA.',
    inputSchema: objeto({
      label: { type: 'string', description: 'Etiqueta visible del campo' },
      value: { type: 'string' },
      ...pTab
    }, ['label', 'value']),
    run: async (a) => {
      const r = await evalEn<{ ok: boolean; error?: string; filled?: string }>(
        numOpt(a['tabId']), JS_FILL(String(a['label']), String(a['value']))
      )
      if (!r.ok) throw new Error(r.error || 'no se pudo rellenar')
      return texto(`Rellenado: ${r.filled}`)
    }
  },
  {
    name: 'screenshot',
    description: 'Captura la página. Úsalo cuando importe el diseño o cuando read_page no baste.',
    inputSchema: objeto({ ...pTab }),
    run: async (a) => {
      const dataUrl = await cmd<string>({ action: 'screenshot', tabId: numOpt(a['tabId']) })
      return [{ type: 'image', data: dataUrl.replace(/^data:image\/\w+;base64,/, ''), mimeType: 'image/png' }]
    }
  }
]

// ---------------------------------------------------------------- JSON-RPC por stdio

interface Rpc { jsonrpc: '2.0'; id?: number | string | null; method?: string; params?: Record<string, unknown> }

/** Una línea de JSON por mensaje. `id` ausente = notificación, y a esas NO se contesta. */
function responder(id: number | string | null | undefined, resultado: unknown): void {
  if (id === undefined || id === null) return
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result: resultado }) + '\n')
}
function fallar(id: number | string | null | undefined, code: number, message: string): void {
  if (id === undefined || id === null) return
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

async function manejar(m: Rpc): Promise<void> {
  switch (m.method) {
    case 'initialize': {
      // Se devuelve la versión que pide el cliente si la sabemos hablar; si no, la nuestra.
      const pide = String(m.params?.['protocolVersion'] || '')
      responder(m.id, {
        protocolVersion: PROTOCOLOS.includes(pide) ? pide : PROTOCOLOS[0],
        capabilities: { tools: {} },
        serverInfo: { name: NOMBRE, version: VERSION }
      })
      return
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return // notificaciones: sin respuesta
    case 'ping':
      responder(m.id, {})
      return
    case 'tools/list':
      responder(m.id, {
        tools: HERRAMIENTAS.map((h) => ({ name: h.name, description: h.description, inputSchema: h.inputSchema }))
      })
      return
    case 'tools/call': {
      const nombre = String(m.params?.['name'] || '')
      const h = HERRAMIENTAS.find((x) => x.name === nombre)
      if (!h) { fallar(m.id, -32602, `herramienta desconocida: ${nombre}`); return }
      try {
        responder(m.id, { content: await h.run((m.params?.['arguments'] as Record<string, unknown>) || {}) })
      } catch (e) {
        /**
         * Un fallo de la herramienta va como resultado con `isError`, NO como error de
         * JSON-RPC: así el modelo lo lee y puede corregir. Un error de protocolo, en cambio,
         * lo maneja el cliente y el modelo nunca se entera de por qué falló.
         */
        responder(m.id, { content: texto(e instanceof Error ? e.message : String(e)), isError: true })
      }
      return
    }
    default:
      fallar(m.id, -32601, `método no soportado: ${m.method}`)
  }
}

const rl = createInterface({ input: process.stdin })
rl.on('line', (linea) => {
  const l = linea.trim()
  if (!l) return
  let m: Rpc
  try {
    m = JSON.parse(l)
  } catch {
    // Sin `id` no hay a quién contestar; que se vea en stderr, que no lo lee el protocolo.
    console.error('[titanio-mcp] línea que no es JSON, ignorada')
    return
  }
  void manejar(m).catch((e) => fallar(m.id, -32603, e instanceof Error ? e.message : String(e)))
})
rl.on('close', () => process.exit(0))
