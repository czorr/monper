import { net } from 'electron'
import { rutaDePerfil } from './perfiles'
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
  file = rutaDePerfil('favicons.json')
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

/**
 * Resuelve el favicon de un sitio que todavía no se ha visitado, preguntándole AL PROPIO
 * SITIO — nunca a un servicio de terceros.
 *
 * Hace falta para los marcadores heredados: los que se crearon antes de que existiera esta
 * caché no traen icono y salían con el globo hasta que volvieras a entrar. Se intenta una
 * sola vez por host y por sesión; si el sitio no responde, se queda el globo y ya.
 */
const intentados = new Set<string>()

/**
 * Tamaño máximo de un icono que nos guardamos incrustado. Por encima se guarda la URL y ya:
 * un favicon no debería pesar esto, y `favicons.json` se lee entero en cada arranque.
 */
const MAX_ICONO = 96 * 1024

/**
 * Descarga el icono y lo convierte en `data:`.
 *
 * Guardar la URL remota no era cachear nada: cada vez que se pinta la lista se vuelve a pedir a
 * la red, y si el sitio tarda, está caído o responde 403 al segundo intento, el icono no sale —
 * que es justo lo que pasaba con las credenciales de sitios nunca visitados. Bajarlo UNA vez y
 * quedárnoslo lo hace definitivo, y de paso no vuelve a salir tráfico a ese dominio.
 */
async function comoDataUrl(url: string): Promise<string | null> {
  const r = await fetchConTimeout(url)
  if (!r?.ok) return null
  const tipo = r.headers.get('content-type') ?? 'image/x-icon'
  if (!tipo.startsWith('image/')) return null
  const buf = Buffer.from(await r.arrayBuffer())
  if (!buf.length || buf.length > MAX_ICONO) return null
  return `data:${tipo.split(';')[0]};base64,${buf.toString('base64')}`
}

/** `net.fetch` con techo de tiempo: una promesa de red sin timeout es la app colgada. */
async function fetchConTimeout(url: string, ms = 4000): Promise<Response | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await net.fetch(url, { signal: ctrl.signal, redirect: 'follow' })
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/**
 * El mejor `<link rel="...icon...">` del HTML, resuelto a absoluto.
 *
 * No vale con el primero que contenga "icon": `rel="fluid-icon"` y `rel="mask-icon"` también
 * lo contienen, y son otra cosa. Medido contra los sitios reales, coger el primero daba el
 * icono de aplicación de GitHub (logo sobre cuadrado oscuro, no su favicon) y la máscara
 * monocroma de Safari en Chess.com. Se puntúa por tipo y se prefiere el de más resolución.
 */
function iconFromHtml(html: string, base: string): string | null {
  const candidatos: { href: string; puntos: number }[] = []
  for (const tag of html.match(/<link\s[^>]*>/gi) ?? []) {
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase().trim()
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1]
    if (!rel || !href) continue
    const tokens = rel.split(/\s+/)
    // Máscaras e iconos de app: monocromos o recortados. No son el favicon.
    if (tokens.includes('mask-icon') || tokens.includes('fluid-icon')) continue

    let puntos = 0
    if (tokens.includes('icon')) puntos = 3
    else if (tokens.includes('apple-touch-icon') || tokens.includes('apple-touch-icon-precomposed')) puntos = 2
    else if (tokens.includes('shortcut')) puntos = 1
    else continue

    // A igualdad de tipo, el de más lado: el sidebar lo pinta a 17px pero en pantallas
    // retina se ve la diferencia.
    const lado = Number(/sizes=["'](\d+)/i.exec(tag)?.[1] ?? 0)
    puntos = puntos * 1000 + Math.min(lado, 512)

    try {
      candidatos.push({ href: new URL(href, base).href, puntos })
    } catch {
      /* href inservible: se prueba el siguiente */
    }
  }
  candidatos.sort((a, b) => b.puntos - a.puntos)
  return candidatos[0]?.href ?? null
}

/**
 * Busca el icono y lo deja en la caché. Devuelve true si lo encontró (para que quien llame
 * refresque la UI).
 */
export async function resolveFavicon(url: string): Promise<boolean> {
  const h = hostOf(url)
  if (!h || byHost[h] || intentados.has(h)) return false
  intentados.add(h)

  let origin = ''
  try {
    origin = new URL(url).origin
  } catch {
    return false
  }

  // 1) El sitio declara su icono en el HTML: es el bueno (y suele ser el de más resolución).
  const página = await fetchConTimeout(origin)
  if (página?.ok) {
    const icono = iconFromHtml((await página.text()).slice(0, 60_000), origin)
    if (icono) {
      const data = await comoDataUrl(icono)
      // Si pesa demasiado para incrustarlo, la URL sigue siendo mejor que nada.
      if (data || icono) { rememberFavicon(url, data ?? icono); return true }
    }
  }
  // 2) La convención de toda la vida.
  const ico = `${origin}/favicon.ico`
  const data = await comoDataUrl(ico)
  if (data) { rememberFavicon(url, data); return true }
  return false
}
