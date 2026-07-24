import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'
import type { QuickAction } from '../shared/types'

// Acciones por defecto (el usuario puede editarlas/borrarlas o crear las suyas).
const DEFAULTS: QuickAction[] = [
  {
    id: 'summarize',
    name: 'Summarize',
    icon: 'list',
    template: 'Resume de forma clara y concisa el siguiente texto:\n\n{{selection}}'
  },
  {
    id: 'translate',
    name: 'Translate',
    icon: 'language',
    template:
      'Traduce el siguiente texto. Si está en español tradúcelo al inglés; si está en otro idioma, al español:\n\n{{selection}}'
  }
]

let file = ''
let items: QuickAction[] = []

function persist(): void { try { writeFileSync(file, JSON.stringify(items, null, 2)) } catch { /* noop */ } }

export function initQuickActions(): void {
  file = join(app.getPath('userData'), 'quickactions.json')
  if (existsSync(file)) {
    try { items = JSON.parse(readFileSync(file, 'utf-8')) } catch { items = [...DEFAULTS] }
  } else {
    items = [...DEFAULTS]
    persist()
  }
}

export function listQuickActions(): QuickAction[] { return items }

/** Crea o actualiza una acción (por id). Devuelve la lista resultante. */
export function saveQuickAction(a: QuickAction): QuickAction[] {
  const id = a.id || 'qa_' + Math.random().toString(36).slice(2, 9)
  const entry: QuickAction = { id, name: a.name.trim() || 'Sin nombre', icon: a.icon || 'sparkles', template: a.template }
  const i = items.findIndex((x) => x.id === id)
  if (i >= 0) items[i] = entry
  else items.push(entry)
  persist()
  return items
}

export function removeQuickAction(id: string): QuickAction[] {
  items = items.filter((x) => x.id !== id)
  persist()
  return items
}

export function getQuickAction(id: string): QuickAction | undefined {
  return items.find((x) => x.id === id)
}

/** Rellena la plantilla con el texto seleccionado ({{selection}}). */
export function fillTemplate(template: string, selection: string): string {
  return template.replace(/\{\{\s*selection\s*\}\}/g, selection)
}
