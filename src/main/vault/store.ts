import { join } from 'path'
import { readJson, writeJson } from '../jsonfile'
import { app, safeStorage } from 'electron'
import type { VaultItemMeta, VaultItemType } from '../../shared/vault'

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
export function findCredential(origin: string): VaultItemMeta | undefined {
  return items.find((i) => i.type === 'web-credential' && i.data.origin === origin)
}

// ---- escritura ----
export function add(type: VaultItemType, label: string, data: Record<string, string>, secret: string): VaultItemMeta {
  const now = Date.now()
  const item: VaultItemMeta = { id: Math.random().toString(36).slice(2), type, label, createdAt: now, updatedAt: now, data }
  const previous = items
  items = [...items, item]
  const r = storeSecret(item.id, secret)
  if (!r.ok) {
    // Se deshace: un item sin secreto es una trampa, mejor que no aparezca.
    items = previous
    throw new VaultError(`No se pudo guardar "${label}" en el Vault: ${r.error}.`)
  }
  persistMeta()
  return item
}

export function update(id: string, patch: { label?: string; data?: Record<string, string>; secret?: string }): VaultItemMeta | null {
  const i = items.find((x) => x.id === id)
  if (!i) return null
  if (patch.label !== undefined) i.label = patch.label
  if (patch.data) i.data = { ...i.data, ...patch.data }
  i.updatedAt = Date.now()
  if (patch.secret !== undefined) {
    const r = storeSecret(id, patch.secret)
    if (!r.ok) throw new VaultError(`No se pudo actualizar el secreto de "${i.label}": ${r.error}.`)
  }
  persistMeta()
  return i
}

export function remove(id: string): void {
  items = items.filter((i) => i.id !== id)
  delete secrets[id]
  persistMeta()
  persistSecrets()
}
