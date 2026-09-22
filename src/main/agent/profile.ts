import type { ProfilePreferences } from '../../shared/profiles'

export function profileInstructions(prefs: ProfilePreferences['agent']): string {
  const browser = prefs.browserTools ? '' : '\n\nEl usuario ha desactivado el control del navegador para este perfil. No tienes herramientas de navegación ni ejecución de JavaScript.'
  const custom = prefs.instructions.trim() ? `\n\nINSTRUCCIONES DEL PERFIL:\n${prefs.instructions}` : ''
  return browser + custom
}

export function profileTools<T>(tools: Record<string, T>, prefs: ProfilePreferences['agent']): Record<string, T> {
  return Object.fromEntries(Object.entries(tools).filter(([name]) => {
    if (name.startsWith('mcp__')) return prefs.mcp
    if (name === 'use_skill') return prefs.skills
    if (name.startsWith('memory_') || ['get_settings', 'set_profile_name', 'set_skill', 'open_settings'].includes(name)) return true
    return prefs.browserTools
  }))
}
