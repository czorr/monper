import type { QuickAction } from './types'
import { t, type Message } from './i18n'

export const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { id: 'summarize', name: 'Summarize', icon: 'list', template: 'Resume de forma clara y concisa el siguiente texto:\n\n{{selection}}' },
  { id: 'translate', name: 'Translate', icon: 'language', template: 'Traduce el siguiente texto. Si está en español tradúcelo al inglés; si está en otro idioma, al español:\n\n{{selection}}' }
]

// Solo el contenido de fábrica se traduce. Las acciones editadas pertenecen al usuario.
export function localizeQuickAction(action: QuickAction): QuickAction {
  const original = DEFAULT_QUICK_ACTIONS.find((item) => item.id === action.id)
  if (!original || action.name !== original.name || action.template !== original.template) return action
  return { ...action, name: t(original.name as Message), template: t(original.template as Message) }
}
