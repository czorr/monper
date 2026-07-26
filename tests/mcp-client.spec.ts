import { test, expect } from '@playwright/test'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { launch, api, type Harness } from './helpers'

/**
 * Monper como CLIENTE MCP: el agente gana herramientas que un navegador no tiene.
 *
 * Nació de que varias skills (docx, pptx, xlsx, pdf, tax) instruyen `python scripts/…` y una
 * tool `bash`, y Monper no tiene ninguna: `run_js` es JavaScript DENTRO de la página. La
 * respuesta no fue empaquetar Python, fue pedírselo a quien ya lo ofrece.
 *
 * El servidor de prueba ejecuta Python DE VERDAD, no un simulacro: lo que se está afirmando
 * es que el agente puede ejecutar código, y con un mock eso no queda demostrado.
 */

let h: Harness

/**
 * Un servidor MCP de verdad, escrito por el propio test para que no dependa de nada externo.
 * Ejecuta Python REAL, no un simulacro: lo que se afirma es que el agente puede ejecutar
 * código, y con un mock eso no quedaría demostrado.
 */
// Sin secuencias de escape en el cuerpo: este texto pasa por un template literal de TS, y
// un '\\n' aquí se convertiría en un salto de línea REAL que parte la cadena del fichero
// generado. De ahí `String.fromCharCode(10)`.
const SERVIDOR_JS = `
const { createInterface } = require('readline')
const { execFileSync } = require('child_process')
const NL = String.fromCharCode(10)
const send = (o) => process.stdout.write(JSON.stringify(o) + NL)
createInterface({ input: process.stdin }).on('line', (l) => {
  if (!l.trim()) return
  const m = JSON.parse(l)
  if (m.method === 'initialize') return send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sandbox', version: '1' } } })
  if (m.method === 'tools/list') return send({ jsonrpc: '2.0', id: m.id, result: { tools: [
    { name: 'run_python', description: 'Ejecuta codigo Python y devuelve su salida', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } }
  ] } })
  if (m.method === 'tools/call') {
    try {
      const out = execFileSync('python3', ['-c', m.params.arguments.code], { encoding: 'utf8' })
      return send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: out.trim() }] } })
    } catch (e) {
      return send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: String(e.message) }], isError: true } })
    }
  }
  if (m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, result: {} })
})
`

/** Llama al main como lo haría la página de settings (sender interno). */
async function enSettings<T>(js: string): Promise<T> {
  await api(h.win, 'openSettings')
  await h.win.waitForTimeout(500)
  return h.app.evaluate(async ({ webContents }, code) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('settings'))
    if (!wc) throw new Error('no hay página de settings')
    return wc.executeJavaScript(code)
  }, js) as Promise<T>
}

test.beforeAll(async () => {
  h = await launch()
  // El main escribe sus diagnósticos por stdout/stderr y Playwright no los reenvía: sin esto,
  // un fallo del servidor externo se investiga a ciegas.
  h.app.process().stdout?.on('data', (b: Buffer) => { const t = String(b).trim(); if (t.includes('[mcp')) console.log(t) })
  h.app.process().stderr?.on('data', (b: Buffer) => { const t = String(b).trim(); if (t.includes('[mcp')) console.log(t) })
  const datos = await h.app.evaluate(({ app }) => app.getPath('userData'))
  const servidor = join(datos, 'fake-mcp-server.js')
  writeFileSync(servidor, SERVIDOR_JS)
  writeFileSync(
    join(datos, 'mcp-servers.json'),
    JSON.stringify({ mcpServers: { sandbox: { command: process.execPath, args: [servidor] } } }, null, 2)
  )
  // El main lee la config al arrancar, o sea ANTES de que el test la escriba. Se le pide
  // releer por el camino real (`ipcMain.emit` no dispara un handler de `ipcMain.handle`).
  await enSettings('window.monperTab.reloadMcpServers()')
})
test.afterAll(async () => { await h?.close() })

test('arranca el servidor externo y descubre sus herramientas', async () => {
  // Handshake real por stdio contra un proceso real: initialize + tools/list.
  const servidores = await enSettings<{ name: string; running: boolean; tools: number; error: string | null }[]>(
    'window.monperTab.probeMcpServers()'
  )
  const sandbox = servidores.find((s) => s.name === 'sandbox')
  expect(sandbox, 'el servidor configurado tiene que aparecer').toBeTruthy()
  expect(sandbox!.error, 'no debe arrancar con error').toBeNull()
  expect(sandbox!.running, 'tiene que quedar en marcha').toBe(true)
  expect(sandbox!.tools, 'y haber anunciado run_python').toBeGreaterThan(0)
})

test('conectar un sandbox de código ACTIVA las skills que lo necesitaban', async () => {
  /**
   * La cadena entera y el motivo de todo esto: docx/pptx/xlsx/pdf/tax instruyen
   * `python scripts/…`, Monper no ejecuta Python, y pasárselas al agente era garantizar que
   * intentara lo imposible. Ahora declaran `requires: code` y solo entran cuando alguien
   * aporta esa capacidad. Aquí se ve el interruptor: antes de arrancar el servidor están
   * fuera; después, dentro.
   */
  const antes = await enSettings<{ id: string; requires: string | null; available: boolean }[]>(
    'window.monperTab.skillsList()'
  )
  const conRequisito = antes.filter((s) => s.requires === 'code').map((s) => s.id)
  expect(conRequisito, 'las de Office y PDF tienen que declarar el requisito').toEqual(
    expect.arrayContaining(['docx', 'pdf', 'pptx', 'xlsx'])
  )

  await enSettings('window.monperTab.probeMcpServers()')
  const despues = await enSettings<{ id: string; requires: string | null; available: boolean }[]>(
    'window.monperTab.skillsList()'
  )
  for (const id of conRequisito) {
    const s = despues.find((x) => x.id === id)!
    expect(s.available, `${id} debería activarse al haber un sandbox de código`).toBe(true)
  }
})
