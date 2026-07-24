import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app, Notification, type BrowserWindow } from 'electron'
import type { Routine, RoutineCondition } from '../shared/types'
import { getActiveProvider } from './ai/store'
import { askModel, parseJsonLoose } from './agent/oneshot'
import { withHeadlessPage, runHeadlessSnippet } from './agent/headless'

/**
 * Rutinas = disparador + acción. En la fase 1 la acción es "vigilar": cargamos la página
 * en una vista oculta, corremos un EXTRACTOR (JS generado una sola vez por el modelo) y
 * comparamos el valor. Así cada corrida cuesta $0 de LLM; solo se llama al modelo al
 * crear la rutina o si el extractor se rompe.
 */

let file = ''
let items: Routine[] = []
let win: BrowserWindow | null = null
let onChange: () => void = () => {}
let timer: NodeJS.Timeout | null = null

function persist(): void { try { writeFileSync(file, JSON.stringify(items, null, 2)) } catch { /* noop */ } }

export function initRoutines(w: BrowserWindow, notify: () => void): void {
  win = w
  onChange = notify
  file = join(app.getPath('userData'), 'routines.json')
  if (existsSync(file)) { try { items = JSON.parse(readFileSync(file, 'utf-8')) } catch { items = [] } }
  if (timer) clearInterval(timer)
  timer = setInterval(tick, 30_000) // resolución de 30s; cada rutina tiene su propio periodo
}

export function listRoutines(): Routine[] { return items }

export function setRoutineEnabled(id: string, on: boolean): void {
  const r = items.find((x) => x.id === id)
  if (!r) return
  r.enabled = on
  persist(); onChange()
}

export function removeRoutine(id: string): void {
  items = items.filter((x) => x.id !== id)
  persist(); onChange()
}

// ---- Ejecución sobre una página headless (mismo REPL y `page` que usa el agente) ----

function requireWin(): BrowserWindow {
  if (!win || win.isDestroyed()) throw new Error('Ventana no disponible.')
  return win
}

/** Contexto de la página para que el modelo escriba el extractor: snapshot + texto. */
async function pageContextFor(url: string): Promise<string> {
  return withHeadlessPage(requireWin(), url, async ({ page }) => {
    const snap = await page.snapshotText({ maxText: 2500, maxNodes: 60 })
    return snap.slice(0, 6000)
  })
}

const EXTRACTOR_SYSTEM = `Escribes extractores para vigilar páginas web dentro del REPL de Monper.
Tu código corre con \`page\` disponible (API estilo Playwright) y DEBE terminar con \`return <valor>\`.

API útil de \`page\`:
- await page.waitForSelector(sel) / page.waitForText(txt)  ← para contenido que carga tarde
- await page.textContent(sel)  ·  await page.$$text(sel)  ·  await page.innerText()
- await page.evaluate(fn)  ← JS arbitrario en la página
- await page.fetch(url)  ← llama la API interna del sitio (hereda cookies); si el dato viene
  de un endpoint JSON, PREFIERE esto: es mucho más estable que raspar el DOM.
- await page.snapshotText()  ← árbol de accesibilidad con refs

Devuelve SOLO un JSON con esta forma:
{"label":"Precio del vuelo","code":"await page.waitForSelector('[data-test=price]');\\nreturn await page.textContent('[data-test=price]');","op":"lt","value":8000}
- "code": el cuerpo del snippet (puede ser multilínea, usa await). Devuelve el dato a vigilar
  (string o número), o null si no lo encuentra. Usa selectores estables (data-*, aria-*, id).
- "op": uno de "changed" (avisar si cambia), "lt", "gt" (numérico), "contains", "notContains".
- "value": el umbral para lt/gt/contains/notContains. Omítelo con "changed".
- "label": nombre corto y humano de lo que se vigila.`

/** Genera el extractor + la condición a partir de lo que pidió el usuario. */
async function buildWatch(url: string, request: string): Promise<{ label: string; extractor: string; condition: RoutineCondition }> {
  const active = getActiveProvider()
  if (!active) throw new Error('Conecta un proveedor de IA en Settings para crear rutinas.')
  const context = await pageContextFor(url)
  const raw = await askModel(
    active.provider, active.key, active.model, EXTRACTOR_SYSTEM,
    `URL: ${url}\n\nLo que quiero vigilar: ${request}\n\nLa página ahora mismo:\n${context}`
  )
  const j = parseJsonLoose<{ label?: string; code?: string; op?: string; value?: unknown }>(raw)
  if (!j?.code) throw new Error('El modelo no devolvió un extractor válido.')
  const ops = ['changed', 'lt', 'gt', 'contains', 'notContains']
  const op = (ops.includes(String(j.op)) ? j.op : 'changed') as RoutineCondition['op']
  return {
    label: j.label || request.slice(0, 60),
    extractor: j.code,
    condition: { op, value: j.value == null ? undefined : String(j.value) }
  }
}

/** ¿El valor nuevo dispara la notificación? La comparación vive en el main, no el modelo. */
function triggers(cond: RoutineCondition, value: unknown, prev: unknown): boolean {
  if (value == null) return false
  const s = String(value)
  const num = (v: unknown): number => Number(String(v).replace(/[^\d.-]/g, ''))
  switch (cond.op) {
    case 'changed': return prev != null && s !== String(prev)
    case 'lt': return num(value) < num(cond.value)
    case 'gt': return num(value) > num(cond.value)
    case 'contains': return s.toLowerCase().includes(String(cond.value).toLowerCase())
    case 'notContains': return !s.toLowerCase().includes(String(cond.value).toLowerCase())
    default: return false
  }
}

export async function createWatchRoutine(input: { url: string; request: string; minutes: number }): Promise<Routine> {
  const { label, extractor, condition } = await buildWatch(input.url, input.request)
  const r: Routine = {
    id: 'r' + Math.random().toString(36).slice(2, 9),
    name: label,
    enabled: true,
    url: input.url,
    request: input.request,
    intervalMinutes: Math.max(5, Math.round(input.minutes)),
    extractor,
    condition,
    lastRun: 0, lastValue: null, lastError: null, failures: 0
  }
  items.push(r)
  persist(); onChange()
  void runRoutine(r.id) // primera corrida inmediata: fija el valor base
  return r
}

/** Corre una rutina ahora (manual o por schedule). */
export async function runRoutine(id: string): Promise<void> {
  const r = items.find((x) => x.id === id)
  if (!r) return
  r.lastRun = Date.now()
  try {
    const value = await runHeadlessSnippet(requireWin(), r.url, r.extractor)
    if (value == null) {
      r.failures++
      r.lastError = 'No se encontró el dato en la página.'
      // Auto-reparación: tras 2 fallos seguidos, pedimos al modelo un extractor nuevo.
      if (r.failures >= 2) { await healRoutine(r) }
    } else {
      const fired = triggers(r.condition, value, r.lastValue)
      r.failures = 0
      r.lastError = null
      const prev = r.lastValue
      r.lastValue = String(value)
      if (fired) notifyRoutine(r, String(value), prev)
    }
  } catch (e) {
    r.failures++
    r.lastError = e instanceof Error ? e.message : String(e)
  }
  persist(); onChange()
}

/** Pide al modelo un extractor nuevo cuando el sitio cambió su HTML. */
async function healRoutine(r: Routine): Promise<void> {
  try {
    const fixed = await buildWatch(r.url, r.request)
    r.extractor = fixed.extractor
    r.condition = fixed.condition
    r.failures = 0
    r.lastError = 'Extractor regenerado (el sitio cambió).'
  } catch (e) {
    r.lastError = e instanceof Error ? e.message : String(e)
  }
}

function notifyRoutine(r: Routine, value: string, prev: unknown): void {
  const body = prev == null ? value : `${value}  (antes: ${prev})`
  try {
    const n = new Notification({ title: r.name, body, silent: false })
    n.on('click', () => { win?.show(); win?.focus() })
    n.show()
  } catch { /* plataforma sin notificaciones */ }
}

/** Revisa qué rutinas toca correr. */
function tick(): void {
  const now = Date.now()
  for (const r of items) {
    if (!r.enabled) continue
    if (now - (r.lastRun || 0) >= r.intervalMinutes * 60_000) void runRoutine(r.id)
  }
}
