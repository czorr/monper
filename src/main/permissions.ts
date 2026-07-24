import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app, dialog, type Session, type WebContents, type BrowserWindow } from 'electron'
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

// Etiqueta humana de lo que se pide, para el diálogo.
function labelFor(keys: PermKey[]): string {
  const has = (k: PermKey): boolean => keys.includes(k)
  if (has('camera') && has('microphone')) return 'tu cámara y micrófono'
  if (has('camera')) return 'tu cámara'
  if (has('microphone')) return 'tu micrófono'
  if (has('geolocation')) return 'tu ubicación'
  if (has('notifications')) return 'mostrar notificaciones'
  if (has('clipboard')) return 'leer tu portapapeles'
  return 'un permiso'
}
function prettyOrigin(origin: string): string {
  try { return new URL(origin).hostname.replace(/^www\./, '') } catch { return origin || 'Este sitio' }
}

interface PermOptions {
  onMedia?: (wc: WebContents, active: boolean) => void
  getWindow?: () => BrowserWindow | null
}

/** Engancha los handlers de permisos a la sesión del partition.
 *  Ya NO auto-concede: para cámara/mic/geo/etc. pregunta al usuario (por origen) y recuerda. */
export function attachPermissionHandlers(ses: Session, opts: PermOptions = {}): void {
  const { onMedia, getWindow } = opts
  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    const origin = originOf((details as { requestingUrl?: string })?.requestingUrl || wc?.getURL() || '')
    const keys = toKeys(permission, details as { mediaTypes?: string[] })
    if (!keys.length) { callback(true); return } // otros permisos (fullscreen, etc.): permitir
    for (const k of keys) markRequested(origin, k)

    // Decisión ya tomada para este origen.
    if (keys.some((k) => stateOf(origin, k) === 'denied')) { callback(false); return }
    if (keys.every((k) => stateOf(origin, k) === 'granted')) {
      callback(true)
      if (onMedia && wc && keys.some((k) => k === 'camera' || k === 'microphone')) onMedia(wc, true)
      return
    }

    // Sin decisión: preguntar con un diálogo nativo.
    const parent = getWindow?.() || undefined
    const messageOpts = {
      type: 'none' as const,
      message: `${prettyOrigin(origin)} quiere usar ${labelFor(keys)}`,
      detail: 'Puedes cambiar esto luego desde el candado de la barra de direcciones.',
      buttons: ['Bloquear', 'Permitir'],
      defaultId: 1,
      cancelId: 0,
      noLink: true
    }
    const { response } = parent
      ? await dialog.showMessageBox(parent, messageOpts)
      : await dialog.showMessageBox(messageOpts)
    const granted = response === 1
    for (const k of keys) setState(origin, k, granted ? 'granted' : 'denied')
    callback(granted)
    if (granted && onMedia && wc && keys.some((k) => k === 'camera' || k === 'microphone')) onMedia(wc, true)
  })
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    const origin = requestingOrigin || originOf((details as { requestingUrl?: string })?.requestingUrl || '')
    const keys = toKeys(permission, details as { mediaTypes?: string[] })
    if (!keys.length) return true
    return !keys.some((k) => stateOf(origin, k) === 'denied')
  })
}
