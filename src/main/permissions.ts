import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app, type Session, type WebContents } from 'electron'
import type { PermKey, PermState } from '../shared/types'

// Decisiones por origen. Persistido en permissions.json.
type Store = Record<string, Partial<Record<PermKey, PermState>>>
let file = ''
let store: Store = {}
// Permisos que cada origen ha SOLICITADO (para mostrar solo los relevantes en el popup).
const requested: Record<string, Set<PermKey>> = {}

function persist(): void { try { writeFileSync(file, JSON.stringify(store)) } catch { /* noop */ } }

export function initPermissions(): void {
  file = join(app.getPath('userData'), 'permissions.json')
  if (existsSync(file)) { try { store = JSON.parse(readFileSync(file, 'utf-8')) } catch { store = {} } }
}

function originOf(url: string): string { try { return new URL(url).origin } catch { return '' } }

export function stateOf(origin: string, key: PermKey): PermState { return store[origin]?.[key] ?? 'ask' }
export function setState(origin: string, key: PermKey, state: PermState): void {
  store[origin] = { ...(store[origin] || {}), [key]: state }
  persist()
}
export function requestedKeys(origin: string): PermKey[] { return [...(requested[origin] || [])] }
function markRequested(origin: string, key: PermKey): void { (requested[origin] ||= new Set()).add(key) }

// Mapea un permiso de Electron a nuestras keys de UI.
function toKeys(permission: string, details?: { mediaTypes?: string[] }): PermKey[] {
  switch (permission) {
    case 'media': {
      const t = details?.mediaTypes || []
      const keys: PermKey[] = []
      if (t.includes('video')) keys.push('camera')
      if (t.includes('audio')) keys.push('microphone')
      return keys.length ? keys : ['camera', 'microphone']
    }
    case 'geolocation': return ['geolocation']
    case 'notifications': return ['notifications']
    case 'clipboard-read':
    case 'clipboard-sanitized-write': return ['clipboard']
    default: return []
  }
}

/** Engancha los handlers de permisos a la sesión del partition.
 *  onMedia(wc, active) se llama cuando un tab obtiene/pierde acceso a cámara/micrófono. */
export function attachPermissionHandlers(ses: Session, onMedia?: (wc: WebContents, active: boolean) => void): void {
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = originOf((details as { requestingUrl?: string })?.requestingUrl || wc?.getURL() || '')
    const keys = toKeys(permission, details as { mediaTypes?: string[] })
    if (!keys.length) { callback(true); return } // otros permisos: permitir por defecto
    for (const k of keys) markRequested(origin, k)
    if (keys.some((k) => stateOf(origin, k) === 'denied')) { callback(false); return }
    // Primera vez: concede y registra (el usuario puede revocar en el popup del sitio).
    for (const k of keys) if (stateOf(origin, k) === 'ask') setState(origin, k, 'granted')
    callback(true)
    // Marca el tab como grabando si concedió cámara/micrófono.
    if (onMedia && wc && keys.some((k) => k === 'camera' || k === 'microphone')) onMedia(wc, true)
  })
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    const origin = requestingOrigin || originOf((details as { requestingUrl?: string })?.requestingUrl || '')
    const keys = toKeys(permission, details as { mediaTypes?: string[] })
    if (!keys.length) return true
    return !keys.some((k) => stateOf(origin, k) === 'denied')
  })
}
