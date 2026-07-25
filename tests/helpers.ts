import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Estado del navegador tal y como lo recibe el renderer por `state:update`. */
export interface BrowserStateLike {
  tabs: { id: number; title: string; url: string; muted?: boolean }[]
  activeId: number | null
  [k: string]: unknown
}

export interface Harness {
  app: ElectronApplication
  /** La ventana de chrome (sidebar + topbar). Las páginas son WebContentsView y no son ventanas. */
  win: Page
  /** Perfil de este arranque. Pásalo a `launch` otra vez para probar persistencia. */
  userData: string
  /** Cierra la app. `keepProfile` conserva el perfil para relanzar. */
  close: (keepProfile?: boolean) => Promise<void>
}

/**
 * Arranca Monper con un perfil desechable.
 *
 * `--user-data-dir` no es un detalle: sin él los tests escriben en el perfil real del
 * usuario (~/Library/Application Support/Monper) y le borrarían bookmarks y vault.
 */
export async function launch(
  env: Record<string, string> = {},
  reuseProfile?: string,
  /**
   * `skipStateListener` evita el reload que instala el listener: solo para medir el arranque.
   * `exe` lanza un binario ya empaquetado en vez de `electron .` (para medir el arranque real
   * que ve el usuario, que no es el de desarrollo).
   */
  opts: { skipStateListener?: boolean; exe?: string } = {}
): Promise<Harness> {
  const userData = reuseProfile ?? mkdtempSync(join(tmpdir(), 'monper-test-'))
  const app = await electron.launch({
    // Con un binario empaquetado la app ya está dentro: pasarle '.' la haría abrir el cwd.
    ...(opts.exe ? { executablePath: opts.exe } : {}),
    args: opts.exe ? [`--user-data-dir=${userData}`] : ['.', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      // Sin vibrancy los tests no dependen del compositor de macOS.
      MONPER_NO_VIBRANCY: '1',
      ...env
    }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  if (!opts.skipStateListener) await installStateListener(win)
  return {
    app,
    win,
    userData,
    close: async (keepProfile = false) => {
      await app.close().catch(() => {})
      if (!keepProfile) rmSync(userData, { recursive: true, force: true })
    }
  }
}

/** Llama a `window.monper.<method>(...args)` en el chrome y devuelve el resultado. */
export async function api<T = unknown>(win: Page, method: string, ...args: unknown[]): Promise<T> {
  return (await win.evaluate(
    async ({ method, args }) => {
      const m = (window as never as Record<string, Record<string, unknown>>)['monper']
      const fn = m?.[method]
      if (typeof fn !== 'function') throw new Error(`window.monper.${method} no existe`)
      return await (fn as (...a: unknown[]) => unknown)(...args)
    },
    { method, args }
  )) as T
}

/**
 * Se suscribe a `state:update` y guarda el último estado en `window.__testState`.
 *
 * `state:update` es solo push: el main lo manda en `did-finish-load` y luego en cada
 * cambio. Si nos suscribimos tarde nos perdemos el primero, así que además se fuerza un
 * reload para provocar uno nuevo — con `addInitScript` el listener ya está puesto antes
 * de que la página cargue.
 */
async function installStateListener(win: Page): Promise<void> {
  const install = (): void => {
    const w = window as never as Record<string, unknown>
    w['__testState'] = null
    const m = w['monper'] as Record<string, unknown> | undefined
    const onState = m?.['onState'] as ((cb: (s: unknown) => void) => void) | undefined
    onState?.((s) => { w['__testState'] = s })
  }
  await win.addInitScript(install)
  await win.reload()
  await win.waitForLoadState('domcontentloaded')
  // Cinturón y tirantes: si el init script corrió antes que el contextBridge, reintenta.
  const ok = await win.evaluate(() => (window as never as Record<string, unknown>)['__testState'] !== undefined)
  if (!ok) await win.evaluate(install)
}

/** Espera hasta que el último estado recibido cumpla `predicate`, y lo devuelve. */
export async function waitForState(
  win: Page,
  predicate: (s: BrowserStateLike) => boolean,
  timeout = 10_000
): Promise<BrowserStateLike> {
  // El predicado se evalúa AQUÍ, en Node, no en la página: el CSP del chrome
  // (`script-src 'self'`) prohíbe `unsafe-eval`, así que no se puede compilar una función
  // dentro del renderer. Solo leemos el último estado y decidimos fuera.
  const deadline = Date.now() + timeout
  let last: BrowserStateLike | null = null
  while (Date.now() < deadline) {
    last = await win.evaluate(
      () => (window as never as Record<string, unknown>)['__testState'] as BrowserStateLike | null
    )
    if (last && predicate(last)) return last
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitForState agotó ${timeout}ms. Último estado: ${JSON.stringify(last)}`)
}

/**
 * Servidor HTTP local para los tests: ningún test debe depender de la red.
 *
 * Tiene que ser http de verdad y no un `data:` URL — `normalizeUrl` manda cualquier cosa
 * que no sea http(s) ni un dominio a una búsqueda de Google, y eso es deliberado (que la
 * omnibox no pueda cargar `data:`). El puerto es 0 para que lo elija el sistema y dos
 * ejecuciones nunca choquen.
 */
export async function serve(pages: Record<string, string>): Promise<{ url: string; close: () => Promise<void> }> {
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    const html = pages[path]
    if (html === undefined) { res.writeHead(404).end('not found'); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r()))
  }
}

/** Página mínima con título, para comprobar que el estado refleja lo cargado. */
export function html(title: string, body = ''): string {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><body>${body}</body>`
}
