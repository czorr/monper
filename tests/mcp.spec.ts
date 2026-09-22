import { test, expect } from '@playwright/test'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { launch, api, waitForState, serve, type Harness } from './helpers'

/**
 * El puente MCP: cualquier cliente (Claude Code, Cursor, un script) opera sitios CON la sesión
 * del usuario. Esto recorre la cadena entera —cliente ⇢ stdio ⇢ HTTP local ⇢ Titanio ⇢ página—
 * porque cada tramo por separado puede estar bien y el conjunto no funcionar.
 *
 * La sesión se prueba con una cookie: el servidor de prueba solo entrega el contenido si la
 * petición la trae, así que si el texto llega, llegó autenticado. Es justo lo que ningún
 * agente en la nube puede hacer.
 */

let h: Harness
let site: { url: string; close: () => Promise<void> }
let mcp: ChildProcessWithoutNullStreams

const PRIVADO = 'FACTURA-SECRETA-4211'

/** Un cliente MCP mínimo: una línea de JSON por mensaje. */
function cliente(p: ChildProcessWithoutNullStreams) {
  let n = 0
  const pendientes = new Map<number, (v: Record<string, unknown>) => void>()
  let buffer = ''
  p.stdout.on('data', (b: Buffer) => {
    buffer += String(b)
    for (const linea of buffer.split('\n').slice(0, -1)) {
      if (!linea.trim()) continue
      const m = JSON.parse(linea) as { id?: number; result?: Record<string, unknown>; error?: { message: string } }
      const r = m.id !== undefined ? pendientes.get(m.id) : undefined
      if (r) { pendientes.delete(m.id!); r(m.error ? { __error: m.error.message } : (m.result ?? {})) }
    }
    buffer = buffer.slice(buffer.lastIndexOf('\n') + 1)
  })
  return (method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const id = ++n
      pendientes.set(id, resolve)
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      setTimeout(() => { if (pendientes.delete(id)) reject(new Error(`sin respuesta a ${method}`)) }, 20_000)
    })
}
let llamar: ReturnType<typeof cliente>

/** El texto plano que devolvió una tool. */
const salida = (r: Record<string, unknown>): string =>
  ((r['content'] as { type: string; text?: string }[] | undefined) ?? [])
    .map((c) => c.text ?? `[${c.type}]`).join('\n')

test.beforeAll(async () => {
  // Sitio "con login": sin la cookie de sesión no entrega nada.
  site = await serve({
    '/privado': (req) =>
      String(req.headers['cookie'] || '').includes('sesion=ok')
        ? { body: `<!doctype html><meta charset="utf-8"><title>Mis facturas</title><main><h1>Mis facturas</h1><p>${PRIVADO}</p></main>` }
        : { status: 403, body: '<!doctype html><title>Fuera</title><main>Necesitas iniciar sesión</main>' },
    '/entrar': { body: '<!doctype html><title>Entrando</title><main>ok</main>', headers: { 'set-cookie': 'sesion=ok; Path=/' } }
  })
  h = await launch()

  // El diálogo de permiso es nativo y bloquearía el test: se responde "Permitir".
  // No es hacer trampa — lo que se está probando es lo que pasa DESPUÉS de que el usuario diga sí.
  await h.app.evaluate(({ dialog }) => {
    ;(dialog as unknown as { showMessageBox: unknown }).showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  })

  // La sesión se abre en el navegador, como la abriría el usuario.
  await api(h.win, 'go', site.url + '/entrar')
  await new Promise((r) => setTimeout(r, 600))

  await h.app.evaluate(({ ipcMain }) => ipcMain.emit('profilesubmenu:action', null, 'dev:remote'))
  // El token lo genera Titanio y vive en su carpeta de datos; se lee desde el test, no desde
  // el main (dentro de `app.evaluate` no hay `require`).
  const datos = await h.app.evaluate(({ app }) => app.getPath('userData'))
  const token = JSON.parse(readFileSync(join(datos, 'remote.json'), 'utf8')).token as string

  mcp = spawn(process.execPath, [join(__dirname, '..', 'packages', 'titanio-mcp', 'dist', 'index.js')], {
    env: { ...process.env, MONPER_TOKEN: token, MONPER_CLIENT_NAME: 'test' },
    stdio: 'pipe'
  })
  mcp.stderr.on('data', (b) => console.log('[mcp stderr]', String(b).trim()))
  llamar = cliente(mcp)
})

test.afterAll(async () => {
  mcp?.kill()
  await h?.close()
  await site?.close()
})

test('el servidor MCP se presenta y anuncia sus herramientas', async () => {
  const init = await llamar('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
  expect(init['protocolVersion'], 'debe hablar la versión que pide el cliente').toBe('2025-06-18')
  expect((init['serverInfo'] as { name: string }).name).toBe('titanio-mcp')

  const lista = await llamar('tools/list')
  const nombres = (lista['tools'] as { name: string }[]).map((t) => t.name)
  expect(nombres).toEqual(expect.arrayContaining(['open_page', 'read_page', 'list_tabs', 'click', 'fill', 'screenshot']))
})

test('lee una página que SOLO se puede leer con la sesión del usuario', async () => {
  // El corazón del asunto: sin la cookie, ese texto no existe para nadie fuera de esta máquina.
  const abierta = await llamar('tools/call', { name: 'open_page', arguments: { url: site.url + '/privado' } })
  const tabId = JSON.parse(salida(abierta))['tabId'] as number
  expect(typeof tabId).toBe('number')

  const leida = await llamar('tools/call', { name: 'read_page', arguments: { tabId } })
  const txt = salida(leida)
  expect(txt, 'llegó sin la sesión: el sitio devolvió su página de "fuera"').toContain(PRIVADO)
  expect(txt).toContain('Mis facturas')
})

test('abrir en segundo plano no le quita al usuario la pestaña que mira', async () => {
  // Si un agente externo te roba el foco cada vez que lee algo, no puedes usar el navegador
  // mientras trabaja — y entonces no sirve de nada que trabaje.
  const activaAntes = (await waitForState(h.win, (s) => s.activeId !== null)).activeId

  const fondo = await llamar('tools/call', { name: 'open_page', arguments: { url: site.url + '/privado' } })
  const idFondo = JSON.parse(salida(fondo))['tabId'] as number
  await waitForState(h.win, (s) => s.tabs.some((t) => t.id === idFondo))
  expect((await waitForState(h.win, () => true)).activeId, 'te ha robado el foco').toBe(activaAntes)
  expect(idFondo).not.toBe(activaAntes)

  // Y con `foreground: true` sí pasa al frente, que es lo que se pide explícitamente.
  const frente = await llamar('tools/call', { name: 'open_page', arguments: { url: site.url + '/privado', foreground: true } })
  const idFrente = JSON.parse(salida(frente))['tabId'] as number
  expect((await waitForState(h.win, (s) => s.activeId === idFrente)).activeId).toBe(idFrente)
})

test('un fallo de la herramienta vuelve como isError, no como error de protocolo', async () => {
  // Para que el modelo pueda leerlo y corregir. Un error de JSON-RPC lo maneja el cliente y
  // el modelo nunca se entera de por qué falló.
  const r = await llamar('tools/call', { name: 'click', arguments: { text: 'un botón que no existe en ninguna parte' } })
  expect(r['isError'], 'tiene que venir marcado como error de herramienta').toBe(true)
  expect(salida(r).length).toBeGreaterThan(0)
})

test('NUNCA escribe en un campo de contraseña', async () => {
  // La regla de oro del producto: los secretos son del usuario y del vault. Ni nuestra IA ni
  // la de nadie los escribe. Ver docs/vault-architecture.md.
  const login = await serve({
    '/': { body: '<!doctype html><meta charset="utf-8"><title>Login</title><main><label>Clave <input type="password" name="clave"></label></main>' }
  })
  try {
    const abierta = await llamar('tools/call', { name: 'open_page', arguments: { url: login.url + '/' } })
    const tabId = JSON.parse(salida(abierta))['tabId'] as number
    const r = await llamar('tools/call', { name: 'fill', arguments: { tabId, label: 'Clave', value: 'hunter2' } })
    expect(r['isError']).toBe(true)
    expect(salida(r).toLowerCase()).toContain('contraseñas')

    const valor = await h.app.evaluate(async ({ webContents }, id) => {
      const wc = webContents.getAllWebContents().find((w) => w.id === id || w.getURL().includes('/'))
      return wc ? wc.executeJavaScript('document.querySelector("input[type=password]")?.value ?? "SIN CAMPO"') : 'SIN VISTA'
    }, tabId)
    expect(valor, 'el campo tiene que seguir vacío').not.toContain('hunter2')
  } finally {
    await login.close()
  }
})
