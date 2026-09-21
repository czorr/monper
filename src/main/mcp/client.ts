import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { readJson, writeJson } from '../jsonfile'

/**
 * Titanio como CLIENTE MCP: el agente usa herramientas de servidores externos.
 *
 * Es la mitad que faltaba. El puente (`remote.ts` + `titanio-mcp`) da al mundo lo único que
 * Titanio tiene y nadie más puede tener: tus sesiones. Esto trae lo contrario — lo que a un
 * navegador le falta y no debería fabricar: ejecutar código, tocar el disco, hablar con una
 * base de datos.
 *
 * Nació de un problema concreto y medible: varias skills (docx, pptx, xlsx, tax, pdf) le
 * dicen al agente que ejecute `python scripts/…` o que use una tool `bash`. Titanio no tiene
 * ninguna de las dos — `run_js` es JavaScript DENTRO de la página, no una shell— y esos
 * scripts ni siquiera están en el repo: vienen del entorno de Claude Code. El agente leía
 * instrucciones imposibles.
 *
 * La salida no es empaquetar Python (eso convierte el navegador en otra cosa), es pedirle el
 * cómputo a quien ya lo ofrece.
 *
 * Decisiones:
 * - **Solo stdio.** Es lo que usan todos los servidores MCP de escritorio y no abre puertos.
 * - **Arranque perezoso.** Un servidor se lanza la primera vez que hace falta, no al abrir
 *   Titanio: arrancar cinco procesos de Node en el arranque es justo lo que se quitó del
 *   pre-warm de popovers (344MB, ver docs/rendimiento.md).
 * - **Todo con techo de tiempo.** Un servidor que no contesta es la app colgada.
 * - **Nada se traga.** Si un servidor no arranca, se dice en el log y en Settings; el agente
 *   recibe el error como resultado, para que pueda corregir en vez de quedarse mudo.
 */

export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  /** false lo deja configurado pero sin usar. */
  enabled?: boolean
}
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>
}

/** Una herramienta de un servidor externo, ya normalizada. */
export interface McpTool {
  /** Nombre único para el agente: `mcp__<servidor>__<tool>`. */
  id: string
  server: string
  tool: string
  description: string
  inputSchema: Record<string, unknown>
}

/** Lo que Settings necesita saber de cada servidor. */
export interface McpServerState {
  name: string
  enabled: boolean
  running: boolean
  tools: number
  error: string | null
}

const ARRANQUE_MS = 20_000
const LLAMADA_MS = 120_000 // un sandbox de código puede tardar; el techo es contra cuelgues

interface Viva {
  proc: ChildProcessWithoutNullStreams
  pendientes: Map<number, { ok: (v: unknown) => void; err: (e: Error) => void; t: NodeJS.Timeout }>
  siguienteId: number
  buffer: string
  tools: McpTool[]
  error: string | null
}

let file = ''
let cfg: McpConfig = { mcpServers: {} }
const vivos = new Map<string, Viva>()
/**
 * Por qué falló el último arranque de cada servidor.
 *
 * Va aparte de `vivos` porque un servidor que no arranca NO está vivo, y si el motivo se
 * guardara solo ahí se perdería justo en el caso que hay que contar: Settings mostraría
 * "parado, sin error" y el usuario no sabría si es que aún no se ha usado o que revienta.
 */
const fallos = new Map<string, string>()
/** Un arranque en curso, para que cinco tools a la vez no lancen cinco procesos. */
const arrancando = new Map<string, Promise<Viva | null>>()

export function configPath(): string { return file }

export function initMcpClient(): void {
  file = join(app.getPath('userData'), 'mcp-servers.json')
  cfg = readJson<McpConfig>(file, { mcpServers: {} }, 'los servidores MCP')
  if (!cfg.mcpServers) cfg.mcpServers = {}
  // Se crea el fichero la primera vez para que el usuario tenga algo que abrir y editar.
  if (!Object.keys(cfg.mcpServers).length) writeJson(file, cfg, 'los servidores MCP')
}

export function reloadMcpConfig(): void {
  cfg = readJson<McpConfig>(file, { mcpServers: {} }, 'los servidores MCP')
  if (!cfg.mcpServers) cfg.mcpServers = {}
  // Los que ya no están configurados (o se desactivaron) se paran.
  for (const [nombre] of vivos) {
    const c = cfg.mcpServers[nombre]
    if (!c || c.enabled === false) parar(nombre)
  }
}

function parar(nombre: string): void {
  const v = vivos.get(nombre)
  if (!v) return
  for (const p of v.pendientes.values()) { clearTimeout(p.t); p.err(new Error('el servidor MCP se detuvo')) }
  v.pendientes.clear()
  try { v.proc.kill() } catch { /* ya estaba muerto */ }
  vivos.delete(nombre)
}

export function stopAllMcp(): void {
  for (const [n] of vivos) parar(n)
}

/** Una petición JSON-RPC al servidor. Siempre con techo de tiempo. */
function pedir(v: Viva, nombre: string, method: string, params: unknown, ms: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = v.siguienteId++
    const t = setTimeout(() => {
      v.pendientes.delete(id)
      reject(new Error(`el servidor MCP "${nombre}" no contestó a ${method} en ${Math.round(ms / 1000)}s`))
    }, ms)
    v.pendientes.set(id, { ok: resolve, err: reject, t })
    try {
      v.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    } catch (e) {
      clearTimeout(t)
      v.pendientes.delete(id)
      reject(new Error(`no se pudo escribir al servidor MCP "${nombre}": ${e instanceof Error ? e.message : e}`))
    }
  })
}

function notificar(v: Viva, method: string): void {
  try { v.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n') } catch { /* el proceso ya no está */ }
}

async function arrancar(nombre: string, c: McpServerConfig): Promise<Viva | null> {
  let proc: ChildProcessWithoutNullStreams
  try {
    proc = spawn(c.command, c.args ?? [], {
      stdio: 'pipe',
      env: { ...process.env, ...(c.env ?? {}) }
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    fallos.set(nombre, `no se pudo lanzar ${c.command}: ${msg}`)
    console.error(`[mcp] no se pudo lanzar "${nombre}" (${c.command}):`, msg)
    return null
  }

  const v: Viva = { proc, pendientes: new Map(), siguienteId: 1, buffer: '', tools: [], error: null }

  proc.stdout.on('data', (b: Buffer) => {
    v.buffer += String(b)
    // Un mensaje por línea; la última puede venir partida, así que se guarda para la próxima.
    const lineas = v.buffer.split('\n')
    v.buffer = lineas.pop() ?? ''
    for (const l of lineas) {
      const s = l.trim()
      if (!s) continue
      let m: { id?: number; result?: unknown; error?: { message?: string } }
      try { m = JSON.parse(s) } catch { console.error(`[mcp] "${nombre}" mandó algo que no es JSON`); continue }
      if (m.id === undefined) continue // notificación del servidor: no la esperamos
      const p = v.pendientes.get(m.id)
      if (!p) continue
      v.pendientes.delete(m.id)
      clearTimeout(p.t)
      if (m.error) p.err(new Error(m.error.message || 'error del servidor MCP'))
      else p.ok(m.result)
    }
  })
  // stderr es donde los servidores MCP escriben sus logs: no es un fallo, pero se ve.
  proc.stderr.on('data', (b: Buffer) => {
    const t = String(b).trim()
    if (t) console.log(`[mcp:${nombre}] ${t.slice(0, 400)}`)
  })
  proc.on('exit', (code) => {
    const v2 = vivos.get(nombre)
    if (v2 === v) {
      console.error(`[mcp] "${nombre}" terminó con código ${code}`)
      parar(nombre)
    }
  })
  proc.on('error', (e) => {
    v.error = e.message
    fallos.set(nombre, e.message)
    console.error(`[mcp] error en "${nombre}":`, e.message)
  })

  try {
    await pedir(v, nombre, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'Titanio', version: app.getVersion() }
    }, ARRANQUE_MS)
    notificar(v, 'notifications/initialized')
    const lista = (await pedir(v, nombre, 'tools/list', {}, ARRANQUE_MS)) as {
      tools?: { name: string; description?: string; inputSchema?: Record<string, unknown> }[]
    }
    v.tools = (lista.tools ?? []).map((t) => ({
      id: `mcp__${nombre}__${t.name}`,
      server: nombre,
      tool: t.name,
      description: t.description || `Herramienta ${t.name} del servidor ${nombre}`,
      inputSchema: t.inputSchema ?? { type: 'object', properties: {} }
    }))
    vivos.set(nombre, v)
    console.log(`[mcp] "${nombre}" listo con ${v.tools.length} herramientas`)
    return v
  } catch (e) {
    v.error = e instanceof Error ? e.message : String(e)
    fallos.set(nombre, v.error)
    console.error(`[mcp] "${nombre}" no completó el arranque:`, v.error)
    try { proc.kill() } catch { /* ya estaba muerto */ }
    return null
  }
}

/** Arranca el servidor si hace falta. Concurrente-seguro: un solo proceso por nombre. */
async function asegurar(nombre: string): Promise<Viva | null> {
  const yaVivo = vivos.get(nombre)
  if (yaVivo) return yaVivo
  const enCurso = arrancando.get(nombre)
  if (enCurso) return enCurso
  const c = cfg.mcpServers[nombre]
  if (!c || c.enabled === false) return null
  fallos.delete(nombre)
  const p = arrancar(nombre, c).finally(() => arrancando.delete(nombre))
  arrancando.set(nombre, p)
  return p
}

/**
 * Todas las herramientas disponibles. Arranca los servidores configurados que falten.
 *
 * Se llama al construir el agente, no al abrir Titanio: si nunca hablas con el agente, no se
 * lanza ni un proceso.
 */
export async function mcpTools(): Promise<McpTool[]> {
  const nombres = Object.entries(cfg.mcpServers).filter(([, c]) => c.enabled !== false).map(([n]) => n)
  const vs = await Promise.all(nombres.map((n) => asegurar(n)))
  return vs.flatMap((v) => v?.tools ?? [])
}

/** Ejecuta una herramienta externa. El error vuelve como texto: el agente puede corregir. */
export async function callMcpTool(server: string, tool: string, args: Record<string, unknown>): Promise<string> {
  const v = await asegurar(server)
  if (!v) return `ERROR: el servidor MCP "${server}" no está disponible.`
  try {
    const r = (await pedir(v, server, 'tools/call', { name: tool, arguments: args }, LLAMADA_MS)) as {
      content?: { type: string; text?: string }[]
      isError?: boolean
    }
    const texto = (r.content ?? [])
      .map((c) => (c.type === 'text' ? (c.text ?? '') : `[${c.type}]`))
      .join('\n')
      .trim()
    if (r.isError) return `ERROR de ${tool}: ${texto || 'sin detalle'}`
    return texto || '(sin salida)'
  } catch (e) {
    return `ERROR llamando a ${server}/${tool}: ${e instanceof Error ? e.message : e}`
  }
}

/** Para Settings: qué hay configurado y en qué estado. No arranca nada. */
export function mcpServerStates(): McpServerState[] {
  return Object.entries(cfg.mcpServers).map(([name, c]) => {
    const v = vivos.get(name)
    return {
      name,
      enabled: c.enabled !== false,
      running: !!v,
      tools: v?.tools.length ?? 0,
      error: v?.error ?? fallos.get(name) ?? null
    }
  })
}

/**
 * Qué capacidades aportan los servidores conectados, para que una skill pueda declarar que
 * las necesita. Hoy solo interesa una: ejecutar código.
 */
export function mcpCapabilities(): Set<string> {
  const caps = new Set<string>()
  for (const v of vivos.values()) {
    for (const t of v.tools) {
      const n = `${t.tool} ${t.description}`.toLowerCase()
      if (/\b(bash|shell|execute_command|run_command|python|repl|code_?exec|execute_code)\b/.test(n)) caps.add('code')
      if (/\b(read_file|write_file|list_directory|filesystem)\b/.test(n)) caps.add('files')
    }
  }
  return caps
}
