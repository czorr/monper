import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app, safeStorage } from 'electron'
import type { VaultItemMeta, VaultItemType } from '../../shared/vault'

let metaFile = ''
let secFile = ''
let items: VaultItemMeta[] = []
let secrets: Record<string, string> = {} // id -> base64(encrypted)

function persistMeta(): void { try { writeFileSync(metaFile, JSON.stringify(items, null, 2)) } catch { /* noop */ } }
function persistSecrets(): void { try { writeFileSync(secFile, JSON.stringify(secrets, null, 2)) } catch { /* noop */ } }

export function initVault(): void {
  metaFile = join(app.getPath('userData'), 'vault.json')
  secFile = join(app.getPath('userData'), 'vault.secrets.json')
  if (existsSync(metaFile)) { try { items = JSON.parse(readFileSync(metaFile, 'utf-8')) } catch { items = [] } }
  if (existsSync(secFile)) { try { secrets = JSON.parse(readFileSync(secFile, 'utf-8')) } catch { secrets = {} } }
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
  items = [...items, item]
  persistMeta()
  const enc = encrypt(secret)
  if (enc) { secrets[item.id] = enc; persistSecrets() }
  return item
}

export function update(id: string, patch: { label?: string; data?: Record<string, string>; secret?: string }): VaultItemMeta | null {
  const i = items.find((x) => x.id === id)
  if (!i) return null
  if (patch.label !== undefined) i.label = patch.label
  if (patch.data) i.data = { ...i.data, ...patch.data }
  i.updatedAt = Date.now()
  persistMeta()
  if (patch.secret !== undefined) { const enc = encrypt(patch.secret); if (enc) { secrets[id] = enc; persistSecrets() } }
  return i
}

export function remove(id: string): void {
  items = items.filter((i) => i.id !== id)
  delete secrets[id]
  persistMeta()
  persistSecrets()
}
