import { t as tr } from '../shared/i18n'
import { readJson, writeJson } from './jsonfile'
import { dialog, type Session, type WebContents, type BrowserWindow } from 'electron'
import { rutaDePerfil } from './perfiles'
import type { PermKey, PermState } from '../shared/types'

// Decisiones por origen. Persistido en permissions.json.
type Store = Record<string, Partial<Record<PermKey, PermState>>>
let file = ''
let store: Store = {}
// Permisos que cada origen ha SOLICITADO (para mostrar solo los relevantes en el popup).
const requested: Record<string, Set<PermKey>> = {}

function persist(): void { writeJson(file, store, 'los permisos de los sitios', false) }

export function initPermissions(): void {
  file = rutaDePerfil('permissions.json')
  store = readJson(file, {} as typeof store, 'los permisos de los sitios')
}

function originOf(url: string): string { try { return new URL(url).origin } catch { return '' } }

export function stateOf(origin: string, key: PermKey): PermState { return store[origin]?.[key] ?? 'ask' }
export function setState(origin: string, key: PermKey, state: PermState): void {
  store[origin] = { ...(store[origin] || {}), [key]: state }
  persist()
}
export function requestedKeys(origin: string): PermKey[] { return [...(requested[origin] || [])] }

/**
 * Todos los orígenes con alguna decisión tomada, para la página de Settings.
 *
 * Hasta ahora un permiso solo se podía ver desde el candado del sitio en cuestión: para
 * revocar la cámara de una página había que volver a entrar en ella. Un permiso concedido y
 * olvidado que no se puede encontrar es el problema, no la pantalla que faltaba.
 *
 * Se omiten los `ask`: no son una decisión, son la ausencia de una.
 */
export function allSites(): { origin: string; perms: { key: PermKey; state: PermState }[] }[] {
  return Object.entries(store)
    .map(([origin, keys]) => ({
      origin,
      perms: (Object.entries(keys) as [PermKey, PermState][])
        .filter(([, state]) => state === 'granted' || state === 'denied')
        .map(([key, state]) => ({ key, state }))
        .sort((a, b) => a.key.localeCompare(b.key))
    }))
    .filter((s) => s.perms.length > 0)
    .sort((a, b) => a.origin.localeCompare(b.origin))
}

/** Olvida las decisiones de un origen: vuelve a preguntar la próxima vez. */
export function clearOrigin(origin: string): void {
  delete store[origin]
  persist()
}

export function clearAllOrigins(): void {
  store = {}
  persist()
}
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
  if (has('camera') && has('microphone')) return tr("tu cámara y micrófono")
  if (has('camera')) return tr("tu cámara")
  if (has('microphone')) return tr("tu micrófono")
  if (has('geolocation')) return tr("tu ubicación")
  if (has('notifications')) return tr("mostrar notificaciones")
  if (has('clipboard')) return tr("leer tu portapapeles")
  return tr("un permiso")
}
function prettyOrigin(origin: string): string {
  try { return new URL(origin).hostname.replace(/^www\./, '') } catch { return origin || tr("Este sitio") }
}

interface PermOptions {
  onMedia?: (wc: WebContents, active: boolean) => void
  getWindow?: () => BrowserWindow | null
  /**
   * Pregunta al usuario y resuelve con la decisión.
   *
   * - `true`/`false`: el usuario decidió, y se recuerda.
   * - `'dismissed'`: cerró el popover sin decidir. Se deniega ESTA vez y no se guarda nada —
   *   un descuido no es una decisión, y persistirlo condenaría al sitio para siempre sin que
   *   nadie lo haya elegido.
   * - `'unavailable'`: no había dónde preguntar (petición de una pestaña en segundo plano).
   *   Se cae al diálogo nativo: es feo, pero perder una petición en silencio es peor.
   */
  ask?: (origin: string, keys: PermKey[], label: string, wc: WebContents | null) => Promise<boolean | 'dismissed' | 'unavailable'>
}

/** Engancha los handlers de permisos a la sesión del partition.
 *  Ya NO auto-concede: para cámara/mic/geo/etc. pregunta al usuario (por origen) y recuerda. */
export function attachPermissionHandlers(ses: Session, opts: PermOptions = {}): void {
  const { onMedia, getWindow, ask } = opts
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

    // Sin decisión: preguntar. Lo normal es el popover anclado al pill del dominio, que es
    // donde el usuario mira y donde luego podrá cambiarlo. El diálogo modal de abajo es el
    // último recurso.
    if (ask) {
      const r = await ask(origin, keys, labelFor(keys), wc ?? null)
      if (r === 'dismissed') { callback(false); return }
      if (r !== 'unavailable') {
        for (const k of keys) setState(origin, k, r ? 'granted' : 'denied')
        callback(r)
        if (r && onMedia && wc && keys.some((k) => k === 'camera' || k === 'microphone')) onMedia(wc, true)
        return
      }
    }

    const parent = getWindow?.() || undefined
    const messageOpts = {
      type: 'none' as const,
      message: tr("{0} quiere usar {1}", prettyOrigin(origin), labelFor(keys)),
      detail: tr("Puedes cambiar esto luego desde el candado de la barra de direcciones."),
      buttons: [tr("Bloquear"), tr("Permitir")],
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
