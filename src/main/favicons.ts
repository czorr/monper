import { join } from 'path'
import { app } from 'electron'
import { readJson, writeJson } from './jsonfile'

/**
 * Caché de favicons por host, alimentada con el icono REAL que reporta cada página.
 *
 * Antes los marcadores sin icono propio caían al servicio de Google
 * (`google.com/s2/favicons?domain=…`). Dos problemas:
 *
 * 1. **Ese servicio normaliza los iconos**: los devuelve compuestos sobre un fondo opaco, así
 *    que GitHub salía con un recuadro que en la web no tiene.
 * 2. **Le mandaba a Google el dominio de cada marcador** del usuario, en un navegador cuyo
 *    argumento es justamente que no filtra lo que haces.
 *
 * Aquí se guarda lo que Chromium ya nos da en `page-favicon-updated`. Mientras un sitio no se
 * haya visitado no hay icono, y la UI cae a su globo local — nunca a un tercero.
 */

let file = ''
let byHost: Record<string, string> = {}
let guardarPendiente: NodeJS.Timeout | null = null

/** Host normalizado (sin `www.`), o '' si la URL no es parseable. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function initFavicons(): void {
  file = join(app.getPath('userData'), 'favicons.json')
  byHost = readJson<Record<string, string>>(file, {}, 'los favicons')
}

/** Se llama en cada `page-favicon-updated`: muy seguido, así que la escritura va agrupada. */
export function rememberFavicon(url: string, favicon: string | null): void {
  const h = hostOf(url)
  if (!h || !favicon || byHost[h] === favicon) return
  byHost[h] = favicon
  if (guardarPendiente) clearTimeout(guardarPendiente)
  guardarPendiente = setTimeout(() => {
    guardarPendiente = null
    writeJson(file, byHost, 'los favicons', false)
  }, 2000)
}

/** El favicon conocido de esa URL, o null si el sitio no se ha visitado todavía. */
export function faviconFor(url: string): string | null {
  return byHost[hostOf(url)] ?? null
}
