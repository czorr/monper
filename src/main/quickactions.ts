import { t as tr } from '../shared/i18n'
import { join } from 'path'
import { existsSync } from 'fs'
import { readJson, writeJson } from './jsonfile'
import { app } from 'electron'
import type { QuickAction } from '../shared/types'
import { DEFAULT_QUICK_ACTIONS, localizeQuickAction } from '../shared/quickactions'

// Acciones por defecto (el usuario puede editarlas/borrarlas o crear las suyas).
const DEFAULTS = DEFAULT_QUICK_ACTIONS

let file = ''
let items: QuickAction[] = []

function persist(): void { writeJson(file, items, 'las acciones rápidas') }

export function initQuickActions(): void {
  file = join(app.getPath('userData'), 'quickactions.json')
  if (existsSync(file)) {
    items = readJson<QuickAction[]>(file, [...DEFAULTS], 'las acciones rápidas')
  } else {
    items = [...DEFAULTS]
    persist()
  }
}

export function listQuickActions(): QuickAction[] { return items }

/** Crea o actualiza una acción (por id). Devuelve la lista resultante. */
export function saveQuickAction(a: QuickAction): QuickAction[] {
  const id = a.id || 'qa_' + Math.random().toString(36).slice(2, 9)
  const entry: QuickAction = { id, name: a.name.trim() || tr("Sin nombre"), icon: a.icon || 'sparkles', template: a.template }
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
  const item = items.find((x) => x.id === id)
  return item && localizeQuickAction(item)
}

/** Rellena la plantilla con el texto seleccionado ({{selection}}). */
export function fillTemplate(template: string, selection: string): string {
  return template.replace(/\{\{\s*selection\s*\}\}/g, selection)
}
