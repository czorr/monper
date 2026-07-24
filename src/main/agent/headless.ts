import { WebContentsView, type BrowserWindow, type WebContents } from 'electron'
import { pageFromWebContents } from '../../../packages/monperwright/src/electron'
import type { Page } from '../../../packages/monperwright/src'
import { execInRepl } from './repl'

/**
 * Página "headless": una vista invisible con la sesión del usuario (cookies incluidas)
 * sobre la que corre el mismo `page` de monperwright y el mismo REPL que usa el agente.
 * La usan las rutinas para vigilar sitios en segundo plano.
 */
export async function withHeadlessPage<T>(
  win: BrowserWindow,
  url: string,
  fn: (ctx: { page: Page; wc: WebContents }) => Promise<T>,
  opts: { timeoutMs?: number } = {}
): Promise<T> {
  const view = new WebContentsView({
    webPreferences: { partition: 'persist:monper', contextIsolation: true, sandbox: true }
  })
  const wc = view.webContents
  // Invisible pero con tamaño estable: el DOM y el JS corren igual, solo no se pinta.
  win.contentView.addChildView(view)
  view.setVisible(false)
  view.setBounds({ x: 0, y: 0, width: 1440, height: 900 })
  const page = pageFromWebContents(wc)
  const timeout = opts.timeoutMs ?? 30_000
  const deadline = <R>(p: Promise<R>, what: string): Promise<R> =>
    Promise.race([p, new Promise<R>((_r, rej) => setTimeout(() => rej(new Error(`timeout ${what}`)), timeout))])
  try {
    await deadline(page.goto(url), 'al cargar la página')
    await page.waitForLoad(5_000)
    return await deadline(fn({ page, wc }), 'al leer la página')
  } finally {
    try { win.contentView.removeChildView(view) } catch { /* noop */ }
    try { wc.close() } catch { /* noop */ }
  }
}

/**
 * Ejecuta un snippet del REPL (con `page` y todos los globals de las skills) sobre una
 * página headless y devuelve su valor crudo. Es el motor de los extractores de rutinas.
 */
export function runHeadlessSnippet(win: BrowserWindow, url: string, code: string): Promise<unknown> {
  return withHeadlessPage(win, url, ({ page, wc }) => execInRepl(page, wc, code))
}
