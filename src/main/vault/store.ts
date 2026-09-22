import { join } from 'path'
import { readJson, writeJson } from '../jsonfile'
import { app, safeStorage } from 'electron'
import type { VaultItemMeta, VaultItemType } from '../../shared/vault'
import { normalizeCredentialOrigin, sameCredentialSite } from '../../shared/vault'

let metaFile = ''
let secFile = ''
let items: VaultItemMeta[] = []
let secrets: Record<string, string> = {} // id -> base64(encrypted)

function persistMeta(): boolean { return writeJson(metaFile, items, 'el vault').ok }
function persistSecrets(): boolean { return writeJson(secFile, secrets, 'los secretos del vault').ok }

/**
 * Guarda el secreto de un item, o explica por qué no se pudo.
 *
 * Esto NO puede fallar en silencio. Antes `encrypt()` devolvía null (safeStorage no
 * disponible, o error al cifrar) y el item se guardaba **sin secreto**: el usuario metía su
 * API key, la veía en la lista y luego todos los chats fallaban con un error de auth sin
 * relación aparente. Lo mismo con una contraseña del vault que no rellenaba nada.
 */
function storeSecret(id: string, secret: string): { ok: boolean; error?: string } {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'el llavero del sistema no está disponible, así que no se puede cifrar' }
  }
  const enc = encrypt(secret)
  if (!enc) return { ok: false, error: 'el cifrado falló' }
  const before = secrets[id]
  secrets[id] = enc
  if (persistSecrets()) return { ok: true }
  // No dejar el secreto solo en memoria: al reiniciar no estaría y parecería que se perdió solo.
  if (before === undefined) delete secrets[id]
  else secrets[id] = before
  return { ok: false, error: 'no se pudo escribir en el disco' }
}

/** Error de vault que el llamante debe mostrar al usuario, no tragarse. */
export class VaultError extends Error {}

export function initVault(): void {
  metaFile = join(app.getPath('userData'), 'vault.json')
  secFile = join(app.getPath('userData'), 'vault.secrets.json')
  // Un vault ilegible es grave: readJson lo deja dicho en el log en vez de arrancar
  // "vacío" como si el usuario nunca hubiera guardado nada.
  items = readJson<VaultItemMeta[]>(metaFile, [], 'el vault')
  secrets = readJson<Record<string, string>>(secFile, {}, 'los secretos del vault')
  let migrated = false
  items = items.map((item) => {
    if (item.type !== 'web-credential') return item
    const origin = normalizeCredentialOrigin(item.data.origin || item.data.url || '')
    if (!origin) return item // Se conserva para que el usuario pueda corregirlo en el editor.
    const data: Record<string, string> = { ...item.data, origin, username: (item.data.username || '').trim() }
    delete data.url
    if (JSON.stringify(data) !== JSON.stringify(item.data)) migrated = true
    return { ...item, data }
  })
  if (migrated) persistMeta()
}

export function isAvailable(): boolean { return safeStorage.isEncryptionAvailable() }

function encrypt(s: string): string | null {
  if (!s || !safeStorage.isEncryptionAvailable()) return null
  try { return safeStorage.encryptString(s).toString('base64') } catch { return null }
}
function decrypt(id: string): string | null {
  const enc = secrets[id]
  if (!enc) return null
  try { return safeStorage.decryptString(Buffer.from(enc, 'base64')) } catch { return null }
}

// ---- lectura ----
export function list(): VaultItemMeta[] { return items }
export function itemsByType(type: VaultItemType): VaultItemMeta[] { return items.filter((i) => i.type === type) }
export function get(id: string): VaultItemMeta | undefined { return items.find((i) => i.id === id) }
export function hasSecret(id: string): boolean { return !!secrets[id] }
export function getSecret(id: string): string | null { return decrypt(id) }
export function credentialsForSite(origin: string): VaultItemMeta[] {
  return items.filter((i) => i.type === 'web-credential' && sameCredentialSite(i.data.origin || '', origin))
}

export function findCredential(origin: string, username?: string): VaultItemMeta | undefined {
  const matches = credentialsForSite(origin).filter((i) => username === undefined || i.data.username === username.trim())
  // Sin cuenta explícita, nunca elegir arbitrariamente entre varias.
  return matches.length === 1 ? matches[0] : undefined
}

function validatedData(type: VaultItemType, data: Record<string, string>, id?: string): Record<string, string> {
  if (type !== 'web-credential') return { ...data }
  const origin = normalizeCredentialOrigin(data.origin || data.url || '')
  if (!origin) throw new VaultError('Escribe un sitio HTTP o HTTPS válido.')
  const username = (data.username || '').trim()
  if (credentialsForSite(origin).some((i) => i.id !== id && i.data.username === username)) {
    throw new VaultError('Ya existe una credencial para este sitio y usuario. Edita esa cuenta.')
  }
  const normalized: Record<string, string> = { ...data, origin, username }
  delete normalized.url
  return normalized
}

// ---- escritura ----
export function importCredential(url: string, username: string, password: string): boolean {
  const origin = normalizeCredentialOrigin(url)
  if (!origin) throw new VaultError('Una credencial importada no contiene un sitio HTTP o HTTPS válido.')
  if (credentialsForSite(origin).some((i) => i.data.username === username.trim())) return false
  add('web-credential', new URL(origin).hostname.replace(/^www\./, ''), { origin, username }, password)
  return true
}

export function add(type: VaultItemType, label: string, data: Record<string, string>, secret: string): VaultItemMeta {
  const now = Date.now()
  if (!label.trim()) throw new VaultError('El nombre no puede estar vacío.')
  const item: VaultItemMeta = { id: Math.random().toString(36).slice(2), type, label: label.trim(), createdAt: now, updatedAt: now, data: validatedData(type, data) }
  const previous = items
  items = [...items, item]
  const r = storeSecret(item.id, secret)
  if (!r.ok) {
    // Se deshace: un item sin secreto es una trampa, mejor que no aparezca.
    items = previous
    throw new VaultError(`No se pudo guardar "${label}" en el Vault: ${r.error}.`)
  }
  if (!persistMeta()) {
    items = previous
    delete secrets[item.id]
    persistSecrets()
    throw new VaultError('No se pudieron guardar los datos del elemento.')
  }
  return item
}

export function update(id: string, patch: { label?: string; data?: Record<string, string>; secret?: string }): VaultItemMeta | null {
  const i = items.find((x) => x.id === id)
  if (!i) throw new VaultError('El elemento ya no existe.')
  const label = (patch.label ?? i.label).trim()
  if (!label) throw new VaultError('El nombre no puede estar vacío.')
  const next = { ...i, label, data: validatedData(i.type, { ...i.data, ...patch.data }, id), updatedAt: Date.now() }
  const previousSecret = secrets[id]
  if (patch.secret !== undefined) {
    const r = storeSecret(id, patch.secret)
    if (!r.ok) throw new VaultError(`No se pudo actualizar el secreto de "${i.label}": ${r.error}.`)
  }
  const previous = items
  items = items.map((item) => item.id === id ? next : item)
  if (!persistMeta()) {
    items = previous
    if (patch.secret !== undefined) {
      if (previousSecret === undefined) delete secrets[id]
      else secrets[id] = previousSecret
      persistSecrets()
    }
    throw new VaultError('No se pudieron guardar los cambios del elemento.')
  }
  return next
}

export function remove(id: string): void {
  items = items.filter((i) => i.id !== id)
  delete secrets[id]
  persistMeta()
  persistSecrets()
}
