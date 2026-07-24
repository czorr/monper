import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'
import type { Profile } from '../shared/types'

let file = ''
let name = 'Tú'
let avatar: string | null = null

function persist(): void { try { writeFileSync(file, JSON.stringify({ name, avatar })) } catch { /* noop */ } }

export function initProfile(): void {
  file = join(app.getPath('userData'), 'profile.json')
  if (existsSync(file)) {
    try {
      const d = JSON.parse(readFileSync(file, 'utf-8'))
      name = (d.name as string) || name
      avatar = (d.avatar as string) || null
    } catch { /* noop */ }
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
