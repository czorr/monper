import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { writeJson } from './jsonfile'
import { app } from 'electron'
import type { Profile } from '../shared/types'

let file = ''
let name = 'Tú'
let avatar: string | null = null

function persist(): void { writeJson(file, { name, avatar }, 'el perfil', false) }

export function initProfile(): void {
  file = join(app.getPath('userData'), 'profile.json')
  if (existsSync(file)) {
    try {
      const d = JSON.parse(readFileSync(file, 'utf-8'))
      name = (d.name as string) || name
      avatar = (d.avatar as string) || null
    } catch (e) {
      // El perfil existía pero está corrupto: se arranca con el de por defecto, y se dice.
      console.error('[perfil] profile.json ilegible, se usa el perfil por defecto:', e instanceof Error ? e.message : e)
    }
  }
}

function initialsOf(n: string): string {
  const parts = n.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0][0] ?? ''
  const second = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + second).toUpperCase()
}

export function getProfile(): Profile {
  return { name, initials: initialsOf(name), avatar }
}

export function setProfile(newName: string): Profile {
  const n = String(newName || '').trim()
  if (n) { name = n.slice(0, 60); persist() }
  return getProfile()
}

export function setAvatar(dataUrl: string | null): Profile {
  // Solo aceptamos data URLs de imagen (o null para quitar).
  avatar = typeof dataUrl === 'string' && dataUrl.startsWith('data:image/') ? dataUrl : null
  persist()
  return getProfile()
}
