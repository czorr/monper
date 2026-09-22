import { net } from 'electron'
import { faviconFor } from './favicons'
import { urlVisible } from '../shared/url'
import type { Suggestion } from '../shared/types'
import * as history from './history'
import { listBookmarks } from './bookmarks'

// ¿El texto parece una URL/dominio (para ofrecer "ir a" en vez de solo buscar)?
function looksLikeUrl(q: string): boolean {
  const s = q.trim()
  if (/\s/.test(s)) return false
  if (/^https?:\/\//i.test(s)) return true
  if (/^localhost(:\d+)?/i.test(s)) return true
  // dominio.tld o dominio.tld/ruta
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s)
}

function toUrl(q: string): string {
  const s = q.trim()
  return /^https?:\/\//i.test(s) ? s : 'https://' + s
}

function searchUrl(q: string): string {
  return 'https://www.google.com/search?q=' + encodeURIComponent(q.trim())
}

/**
 * El favicon que ya vimos al visitar ese sitio. Antes se pedía a `google.com/s2/favicons`,
 * que además de componer los iconos sobre fondo opaco le iba contando a Google cada dominio
 * que el usuario escribía en la barra. Sin icono conocido, la UI pone su globo.
 */
function faviconOf(url: string): string {
  return faviconFor(url) ?? ''
}

/**
 * Una sugerencia de Google ya interpretada.
 *
 * `client=chrome` devuelve tres clases de cosa en la misma lista, y distinguirlas es lo que
 * separa "ocho búsquedas grises" de lo que enseña Chrome: navegaciones con el título real del
 * sitio, y entidades (personas, empresas, películas) con su descripción y su foto.
 */
interface GoogleSug {
  type: 'QUERY' | 'NAVIGATION' | 'ENTITY'
  /** Lo que se busca, o la URL si es NAVIGATION */
  text: string
  /** Título del sitio (NAVIGATION) o de la entidad (ENTITY) */
  title?: string
  /** Anotación: "Mexican footballer", "Company" */
  annotation?: string
  /** Foto de la entidad, servida por Google */
  image?: string
}

interface SuggestMeta {
  'google:suggesttype'?: string[]
  'google:suggestdetail'?: { a?: string; t?: string; i?: string }[]
}

/**
 * Sugerencias de búsqueda de Google (desde el main: sin CSP).
 *
 * Formato chrome: `[q, [textos], [descripciones], [], {metadatos}]`. Se usaba `client=firefox`,
 * que sólo devuelve `[q, [textos]]`: por eso todo salía como búsqueda genérica, sin títulos ni
 * iconos. Los metadatos son *opcionales* en la respuesta y cambian sin aviso, así que todo lo
 * que se lee de ahí va con `?.` y con un valor por defecto.
 */
/** GET con techo de tiempo. Devuelve '' ante cualquier fallo: quien llame decide qué hacer. */
function getText(url: string, signal?: AbortSignal, timeoutMs = 2500): Promise<string> {
  return new Promise((resolve) => {
    const req = net.request(url)
    // Los trozos se acumulan como Buffer y se decodifican AL FINAL: un chunk puede cortar un
    // carácter multibyte por la mitad, y con `chunk.toString()` los acentos salían rotos.
    const trozos: Buffer[] = []
    let settled = false
    // Sin timeout, una petición colgada dejaba la promesa sin resolver PARA SIEMPRE:
    // suggest() nunca retornaba y el omnibox se quedaba sin sugerencias en silencio.
    const done = (s: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(s)
    }
    const timer = setTimeout(() => { try { req.abort() } catch { /* ya terminó */ } ; done('') }, timeoutMs)
    signal?.addEventListener('abort', () => { try { req.abort() } catch { /* ya terminó */ } ; done('') })
    req.on('response', (res) => {
      res.on('data', (c) => { trozos.push(Buffer.from(c)) })
      res.on('end', () => done(Buffer.concat(trozos).toString('utf8')))
      res.on('error', () => done(''))
    })
    req.on('error', () => done(''))
    req.on('abort', () => done(''))
    try { req.end() } catch { done('') }
  })
}

function googleSuggest(query: string, signal?: AbortSignal): Promise<GoogleSug[]> {
  const url = 'https://www.google.com/complete/search?client=chrome&q=' + encodeURIComponent(query)
  return getText(url, signal).then((body) => {
    try {
      const parsed = JSON.parse(body) as [string, string[], string[], unknown, SuggestMeta]
      const textos = Array.isArray(parsed?.[1]) ? parsed[1] : []
      const descs = Array.isArray(parsed?.[2]) ? parsed[2] : []
      const tipos = (parsed?.[4] ?? {})['google:suggesttype'] ?? []
      return textos.map((text, i) => ({
        type: tipos[i] === 'NAVIGATION' ? ('NAVIGATION' as const) : ('QUERY' as const),
        text,
        title: tipos[i] === 'NAVIGATION' ? descs[i] || undefined : undefined
      }))
    } catch { return [] }
  })
}

/** Quita el `<b>` con el que gws-wiz marca el completado. */
function sinTags(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}

/**
 * Entidades (persona, empresa, película) con su descripción y su foto, indexadas por el texto
 * de la búsqueda.
 *
 * Hacen falta DOS peticiones porque cada cliente de Google devuelve una mitad: `chrome` marca
 * las NAVIGATION (con el título del sitio) pero nunca manda `suggestdetail`; `gws-wiz` sí trae
 * la entidad (`zh` título, `zi` descripción, `zs` foto) pero no distingue navegaciones. Se
 * piden en paralelo y, si esta falla, la lista sigue saliendo — sólo que sin fotos.
 */
function googleEntities(query: string, signal?: AbortSignal): Promise<Map<string, GoogleSug>> {
  const url = 'https://www.google.com/complete/search?client=gws-wiz&xssi=t&q=' + encodeURIComponent(query)
  return getText(url, signal).then((body) => {
    const out = new Map<string, GoogleSug>()
    try {
      // La respuesta viene con el prefijo anti-XSSI `)]}'`.
      const parsed = JSON.parse(body.replace(/^\)\]\}'/, '')) as [
        [string, unknown, unknown, { zh?: string; zi?: string; zs?: string }?][]
      ]
      for (const fila of parsed?.[0] ?? []) {
        const texto = sinTags(fila?.[0] ?? '')
        const e = fila?.[3]
        if (!texto || !e?.zs) continue
        out.set(texto.toLowerCase(), { type: 'ENTITY', text: texto, title: e.zh || texto, annotation: e.zi, image: e.zs })
      }
    } catch { /* sin entidades: la lista sale igual, sin fotos */ }
    return out
  })
}

/** Combina historial + bookmarks + búsquedas de Google en una lista ordenada. */
export async function suggest(query: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const q = query.trim()
  const out: Suggestion[] = []
  const seen = new Set<string>()
  const push = (s: Suggestion): void => {
    if (!seen.has(s.url)) { seen.add(s.url); out.push(s) }
    else if (s.kind === 'history') {
      // Un destino directo ya visitado también debe poder borrarse del historial.
      const i = out.findIndex((entry) => entry.url === s.url)
      if (i >= 0) out[i] = s
    }
  }

  // 1) Si parece URL, ofrécela como destino directo (primero).
  if (looksLikeUrl(q)) {
    const url = toUrl(q)
    push({ kind: 'url', title: q, url, detail: 'Ir al sitio', favicon: faviconOf(url) })
  }

  // 2) Historial (frecency).
  for (const h of q ? history.search(q, 5) : history.recent(9)) {
    let detail = h.url
    // Sin dominio parseable la sugerencia se muestra sin subtexto, y ya está.
    try { detail = new URL(h.url).hostname.replace(/^www\./, '') } catch { /* sin subtexto */ }
    const term = history.searchTerm(h.url)
    push({ kind: 'history', title: term || h.title || h.url, url: h.url,
      detail: term ? 'Búsqueda anterior' : detail, favicon: term ? undefined : faviconOf(h.url) || h.favicon })
  }

  if (!q) return out

  // 3) Bookmarks que hagan match.
  const ql = q.toLowerCase()
  for (const b of listBookmarks()) {
    if (b.title.toLowerCase().includes(ql) || b.url.toLowerCase().includes(ql)) {
      push({ kind: 'bookmark', title: b.title, url: b.url, detail: 'Marcador', favicon: faviconOf(b.url) || b.favicon })
    }
  }

  // 4) Sugerencias de Google, respetando lo que cada una es.
  const [gs, entidades] = await Promise.all([googleSuggest(q, signal), googleEntities(q, signal)])
  for (const base of gs.slice(0, 6)) {
    const s = base.type === 'QUERY' ? entidades.get(base.text.toLowerCase()) ?? base : base
    if (s.type === 'NAVIGATION') {
      // Google ya devuelve la URL; el título es el del sitio, y el icono el que tengamos en
      // caché (nunca el de un tercero: ver faviconOf).
      const url = toUrl(s.text)
      // La MISMA función que usa el completado inline del renderer: si aquí se quita el
      // `www.` y allí no, se ve un dominio que luego no se autocompleta. Ya pasó.
      const host = urlVisible(url) || s.text
      push({ kind: 'url', title: s.title || host, url, detail: host, favicon: faviconOf(url) })
      continue
    }
    if (s.type === 'ENTITY') {
      // La foto la sirve Google (encrypted-tbn/gstatic). Aquí sí se acepta un recurso de un
      // tercero, y conviene saber por qué: la consulta YA se le envió a Google al pedir estas
      // sugerencias, así que la imagen no le revela nada nuevo — al contrario que el endpoint
      // de favicons, que le contaba dominios que nunca habíamos consultado.
      push({ kind: 'search', title: s.title || s.text, url: searchUrl(s.text), detail: s.annotation, favicon: s.image, round: !!s.image })
      continue
    }
    push({ kind: 'search', title: s.text, url: searchUrl(s.text), detail: 'Buscar en Google' })
  }

  // 5) Fallback: si no parecía URL y no hubo nada arriba, ofrece buscar el texto tal cual.
  if (!looksLikeUrl(q) && !seen.has(searchUrl(q))) {
    push({ kind: 'search', title: q, url: searchUrl(q), detail: 'Buscar en Google' })
  }

  return out.slice(0, 9)
}
