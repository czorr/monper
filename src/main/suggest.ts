import { net } from 'electron'
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

function faviconOf(url: string): string {
  try {
    const h = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64`
  } catch { return '' }
}

// Sugerencias de búsqueda de Google (desde el main: sin CSP). Formato firefox: [q, [s1, s2, ...]].
function googleSuggest(query: string, signal?: AbortSignal): Promise<string[]> {
  return new Promise((resolve) => {
    const url = 'https://suggestqueries.google.com/complete/search?client=firefox&q=' + encodeURIComponent(query)
    const req = net.request(url)
    let body = ''
    const done = (list: string[]): void => resolve(list)
    signal?.addEventListener('abort', () => { try { req.abort() } catch { /* noop */ } ; done([]) })
    req.on('response', (res) => {
      res.on('data', (c) => { body += c.toString() })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body) as [string, string[]]
          done(Array.isArray(parsed?.[1]) ? parsed[1] : [])
        } catch { done([]) }
      })
    })
    req.on('error', () => done([]))
    req.end()
  })
}

/** Combina historial + bookmarks + búsquedas de Google en una lista ordenada. */
export async function suggest(query: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const q = query.trim()
  if (!q) return []
  const out: Suggestion[] = []
  const seen = new Set<string>()
  const push = (s: Suggestion): void => { if (!seen.has(s.url)) { seen.add(s.url); out.push(s) } }

  // 1) Si parece URL, ofrécela como destino directo (primero).
  if (looksLikeUrl(q)) {
    const url = toUrl(q)
    push({ kind: 'url', title: q, url, detail: 'Ir al sitio', favicon: faviconOf(url) })
  }

  // 2) Historial (frecency).
  for (const h of history.search(q, 5)) {
    let detail = h.url
    try { detail = new URL(h.url).hostname.replace(/^www\./, '') } catch { /* noop */ }
    push({ kind: 'history', title: h.title || h.url, url: h.url, detail, favicon: h.favicon ?? faviconOf(h.url) })
  }

  // 3) Bookmarks que hagan match.
  const ql = q.toLowerCase()
  for (const b of listBookmarks()) {
    if (b.title.toLowerCase().includes(ql) || b.url.toLowerCase().includes(ql)) {
      push({ kind: 'bookmark', title: b.title, url: b.url, detail: 'Marcador', favicon: b.favicon ?? faviconOf(b.url) })
    }
  }

  // 4) Sugerencias de búsqueda de Google.
  const gs = await googleSuggest(q, signal)
  for (const s of gs.slice(0, 6)) {
    push({ kind: 'search', title: s, url: searchUrl(s), detail: 'Buscar en Google' })
  }

  // 5) Fallback: si no parecía URL y no hubo nada arriba, ofrece buscar el texto tal cual.
  if (!looksLikeUrl(q) && !out.some((s) => s.kind === 'search' && s.title.toLowerCase() === ql)) {
    push({ kind: 'search', title: q, url: searchUrl(q), detail: 'Buscar en Google' })
  }

  return out.slice(0, 9)
}
