import { join } from 'path'
import { existsSync } from 'fs'
import { readJson, writeJson } from './jsonfile'
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
    writeJson(file, items, 'el historial', false)
  }, 1500)
}

export function initHistory(): void {
  file = join(app.getPath('userData'), 'history.json')
  if (existsSync(file)) {
    items = readJson<HistoryEntry[]>(file, [], 'el historial')
  }
}

/**
 * Registra (o actualiza) una visita. Se llama en did-navigate.
 *
 * `visitedAt` es para el IMPORTADOR: al traer el historial de otro navegador, sin él todas
 * las páginas quedaban con la fecha de hoy y el historial entero aparecía visitado esta
 * mañana. Se conserva la fecha más reciente de las dos, para que reimportar no rejuvenezca
 * una página que ya visitaste aquí.
 */
export function recordVisit(url: string, title?: string, favicon?: string | null, visitedAt?: number): void {
  if (skip(url)) return
  const cuando = visitedAt && visitedAt > 0 ? visitedAt : Date.now()
  const existing = items.find((h) => h.url === url)
  if (existing) {
    existing.visits += 1
    existing.lastVisit = Math.max(existing.lastVisit, cuando)
    if (title) existing.title = title
    if (favicon) existing.favicon = favicon
  } else {
    items.push({ url, title: title || url, favicon, visits: 1, lastVisit: cuando })
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

/** Los últimos sitios visitados, para el submenú de History. */
export function recent(limit = 10): HistoryEntry[] {
  return [...items].sort((a, b) => b.lastVisit - a.lastVisit).slice(0, limit)
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


// ---------------------------------------------------------------- página de historial

export interface HistoryPage {
  entries: HistoryEntry[]
  /** Cuántas cumplen el filtro en total, para saber si queda más por cargar. */
  total: number
}

/**
 * Una página del historial, de más reciente a más antigua.
 *
 * Se pagina porque un historial real son decenas de miles de entradas: mandarlas todas por
 * IPC congela el renderer y no cabe en pantalla de todas formas.
 */
export function browse(query: string, offset = 0, limit = 100): HistoryPage {
  const q = query.trim().toLowerCase()
  const filtrados = q
    ? items.filter((h) => h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q))
    : items
  const ordenados = [...filtrados].sort((a, b) => b.lastVisit - a.lastVisit)
  return { entries: ordenados.slice(offset, offset + limit), total: ordenados.length }
}

/** Borra una entrada. Devuelve true si existía. */
export function removeEntry(url: string): boolean {
  const antes = items.length
  items = items.filter((h) => h.url !== url)
  if (items.length === antes) return false
  writeJson(file, items, 'el historial', false)
  return true
}

/**
 * Borra el historial desde una fecha. Sin `desde`, lo borra entero.
 *
 * Se escribe YA y no con `persistSoon`: borrar historial es una acción de privacidad, y
 * dejarla 1,5s en memoria es dejar una ventana en la que un cierre inesperado lo devuelve.
 */
export function clearHistory(desde?: number): number {
  const antes = items.length
  items = desde ? items.filter((h) => h.lastVisit < desde) : []
  writeJson(file, items, 'el historial', false)
  return antes - items.length
}
