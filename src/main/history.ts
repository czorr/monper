import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'

export interface HistoryEntry {
  url: string
  title: string
  favicon?: string | null
  visits: number
  lastVisit: number // ms epoch
}

let file = ''
let items: HistoryEntry[] = []
let saveTimer: NodeJS.Timeout | null = null

// URLs que no tiene sentido guardar (páginas internas, blancos, devtools).
function skip(url: string): boolean {
  return !url || url === 'about:blank' || /^(devtools|chrome|data|file):/i.test(url) ||
    url.includes('/newtab.html') || url.includes('/settings.html') || url.includes('/vault.html')
}

function persistSoon(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try { writeFileSync(file, JSON.stringify(items)) } catch { /* noop */ }
  }, 1500)
}

export function initHistory(): void {
  file = join(app.getPath('userData'), 'history.json')
  if (existsSync(file)) {
    try { items = JSON.parse(readFileSync(file, 'utf-8')) } catch { items = [] }
  }
}

/** Registra (o actualiza) una visita. Se llama en did-navigate. */
export function recordVisit(url: string, title?: string, favicon?: string | null): void {
  if (skip(url)) return
  const existing = items.find((h) => h.url === url)
  if (existing) {
    existing.visits += 1
    existing.lastVisit = Date.now()
    if (title) existing.title = title
    if (favicon) existing.favicon = favicon
  } else {
    items.push({ url, title: title || url, favicon, visits: 1, lastVisit: Date.now() })
  }
  persistSoon()
}

/** Actualiza el título/favicon de la última visita de una URL (llegan tras navegar). */
export function updateMeta(url: string, title?: string, favicon?: string | null): void {
  const h = items.find((x) => x.url === url)
  if (!h) return
  if (title) h.title = title
  if (favicon) h.favicon = favicon
  persistSoon()
}

/** Puntaje "frecency": frecuencia de visitas atenuada por qué tan reciente fue. */
function frecency(h: HistoryEntry): number {
  const days = (Date.now() - h.lastVisit) / 86_400_000
  const recency = days < 1 ? 100 : days < 7 ? 70 : days < 30 ? 40 : days < 90 ? 20 : 10
  return h.visits * recency
}

/** Busca en el historial por url/título; devuelve los más relevantes. */
export function search(query: string, limit = 6): HistoryEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return items
    .filter((h) => h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q))
    .sort((a, b) => frecency(b) - frecency(a))
    .slice(0, limit)
}
