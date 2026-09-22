import { app } from 'electron'
import type { Profile } from '../shared/types'
import { initPerfiles, perfilActivo, perfilActivoId, renombrarPerfil, setAvatarPerfil, preferencesFor } from './perfiles'

/**
 * El perfil que se ve en la UI (nombre, iniciales, avatar).
 *
 * Antes este módulo era el dueño de `profile.json`. Ahora es una **vista del perfil activo**: el
 * dato vive en `perfiles.json`, junto a la lista, para que no haya dos sitios donde cambiar un
 * nombre y se desincronicen. `initPerfiles` absorbe el `profile.json` viejo la primera vez, así
 * que nadie pierde el nombre ni el avatar que ya tenía puesto.
 */

export function initProfile(): void {
  initPerfiles(app.getPath('userData'))
}

function initialsOf(n: string): string {
  const parts = n.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0][0] ?? ''
  const second = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + second).toUpperCase()
}

export function getProfile(): Profile {
  const p = perfilActivo()
  const prefs = preferencesFor()
  return { name: p.nombre, initials: initialsOf(p.nombre), avatar: p.avatar, color: prefs.color, icon: prefs.icon }
}

export function setProfile(newName: string): Profile {
  renombrarPerfil(perfilActivoId(), newName)
  return getProfile()
}

export function setAvatar(dataUrl: string | null): Profile {
  setAvatarPerfil(perfilActivoId(), dataUrl)
  return getProfile()
}
