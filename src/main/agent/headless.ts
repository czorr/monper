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
  opts: { timeoutMs?: number; partition?: string } = {}
): Promise<T> {
  const view = new WebContentsView({
    // La partición del perfil activo, no la de siempre: una rutina o un vigía del perfil
    // "Trabajo" tiene que ver la web logueada de Trabajo.
    webPreferences: { partition: opts.partition ?? 'persist:monper', contextIsolation: true, sandbox: true }
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
    // Teardown: puede estar ya quitada o destruida (timeout, ventana cerrada). Da igual.
    try { win.contentView.removeChildView(view) } catch { /* ya no estaba */ }
    try { wc.close() } catch { /* ya destruida */ }
  }
}

/**
 * Ejecuta un snippet del REPL (con `page` y todos los globals de las skills) sobre una
 * página headless y devuelve su valor crudo. Es el motor de los extractores de rutinas.
 */
export function runHeadlessSnippet(win: BrowserWindow, url: string, code: string, opts: { timeoutMs?: number; partition?: string } = {}): Promise<unknown> {
  return withHeadlessPage(win, url, ({ page, wc }) => execInRepl(page, wc, code), opts)
}
