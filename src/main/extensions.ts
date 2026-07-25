import { join, basename } from 'path'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs'
import { app, type Session } from 'electron'
import type { ExtensionInfo } from '../shared/types'
import { installCrx, extensionIdFrom } from './crx'

// Extensiones instaladas: guardamos la RUTA (Electron exige recargarlas en cada arranque)
// y si están activas. "Desactivar" = descargarla de la sesión (Electron no tiene disable).
interface Entry { path: string; enabled: boolean }

let file = ''
let items: Entry[] = []
let ses: Session | null = null

function persist(): void { try { writeFileSync(file, JSON.stringify(items, null, 2)) } catch { /* noop */ } }

function readManifest(path: string): Record<string, unknown> | null {
  try { return JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf-8')) } catch { return null }
}

/**
 * Resuelve los placeholders de i18n del manifest (`__MSG_name__`) contra _locales.
 * Sin esto las extensiones traducidas se listan literalmente como "__MSG_name__".
 */
function i18n(path: string, manifest: Record<string, unknown> | null, raw: unknown): string {
  const s = typeof raw === 'string' ? raw : ''
  const m = s.match(/^__MSG_(\w+)__$/)
  if (!m) return s
  const locales = [String(manifest?.default_locale ?? 'en'), 'en', 'en_US', 'es']
  for (const loc of locales) {
    try {
      const msgs = JSON.parse(readFileSync(join(path, '_locales', loc, 'messages.json'), 'utf-8'))
      // Las claves de messages.json no distinguen mayúsculas.
      const key = Object.keys(msgs).find((k) => k.toLowerCase() === m[1].toLowerCase())
      const val = key ? msgs[key]?.message : null
      if (typeof val === 'string' && val) return val
    } catch { /* prueba el siguiente locale */ }
  }
  return s
}

/** Icono del manifest como data URL (la ventana tiene CSP: no puede leer file://). */
function iconOf(path: string, manifest: Record<string, unknown> | null): string | null {
  const icons = (manifest?.icons ?? {}) as Record<string, string>
  const sizes = Object.keys(icons).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => b - a)
  const rel = (sizes.length ? icons[String(sizes[0])] : null)
    ?? ((manifest?.action as { default_icon?: string } | undefined)?.default_icon)
  if (!rel || typeof rel !== 'string') return null
  try {
    const buf = readFileSync(join(path, rel))
    const ext = rel.split('.').pop()?.toLowerCase()
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch { return null }
}

export async function initExtensions(session: Session): Promise<void> {
  ses = session
  file = join(app.getPath('userData'), 'extensions.json')
  if (existsSync(file)) { try { items = JSON.parse(readFileSync(file, 'utf-8')) } catch { items = [] } }
  // Electron NO persiste extensiones entre arranques: hay que recargarlas siempre.
  for (const e of items) {
    if (e.enabled && existsSync(e.path)) {
      try { await ses.extensions.loadExtension(e.path, { allowFileAccess: true }) } catch { /* la marcamos rota al listar */ }
    }
  }
}

/** Extensión cargada en la sesión que corresponde a esa ruta (si está activa). */
function loadedFor(path: string): Electron.Extension | undefined {
  return ses?.extensions.getAllExtensions().find((x) => x.path === path)
}

export function listExtensions(): ExtensionInfo[] {
  console.log('[ext] listExtensions →', items.length, 'entradas:', items.map((e) => basename(e.path)).join(', ') || '(ninguna)')
  return items.map((e) => {
    const m = readManifest(e.path)
    const live = loadedFor(e.path)
    return {
      path: e.path,
      id: live?.id ?? '',
      name: i18n(e.path, m, live?.name ?? m?.name) || basename(e.path),
      version: live?.version ?? (m?.version as string) ?? '',
      description: i18n(e.path, m, m?.description),
      icon: iconOf(e.path, m),
      enabled: !!live,
      missing: !existsSync(e.path)
    }
  })
}

/** Instala (y activa) una extensión desempaquetada desde una carpeta. */
export async function addExtension(path: string): Promise<{ ok: boolean; error?: string }> {
  if (!ses) return { ok: false, error: 'Sesión no lista.' }
  if (!readManifest(path)) return { ok: false, error: 'Esa carpeta no tiene un manifest.json válido.' }
  if (items.some((e) => e.path === path)) return { ok: false, error: 'Esa extensión ya está instalada.' }
  try {
    const ext = await ses.extensions.loadExtension(path, { allowFileAccess: true })
    items.push({ path, enabled: true })
    persist()
    console.log('[ext] cargada en la sesión:', ext.id, ext.name, '· total instaladas:', items.length)
    return { ok: true }
  } catch (e) {
    console.error('[ext] loadExtension FALLÓ para', path, '→', e)
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function setExtensionEnabled(path: string, on: boolean): Promise<void> {
  const entry = items.find((e) => e.path === path)
  if (!entry || !ses) return
  const live = loadedFor(path)
  if (on && !live) {
    try { await ses.extensions.loadExtension(path, { allowFileAccess: true }) } catch { /* noop */ }
  } else if (!on && live) {
    try { ses.extensions.removeExtension(live.id) } catch { /* noop */ }
  }
  entry.enabled = on
  persist()
}

export function removeExtension(path: string): void {
  const live = loadedFor(path)
  if (live && ses) { try { ses.extensions.removeExtension(live.id) } catch { /* noop */ } }
  items = items.filter((e) => e.path !== path)
  persist()
  // Si la instalamos nosotros desde la Store, borramos también sus archivos.
  if (path.startsWith(storeDir())) { try { rmSync(path, { recursive: true, force: true }) } catch { /* noop */ } }
}

function storeDir(): string { return join(app.getPath('userData'), 'extensions') }

/**
 * URLs de la propia extensión: su popup (el que Chrome muestra al clicar su icono)
 * y su página de opciones. Solo existen si la extensión está cargada, porque el
 * esquema chrome-extension:// usa su id.
 */
export function extensionUi(path: string): { id: string; popup: string | null; options: string | null } | null {
  const live = loadedFor(path)
  if (!live) return null
  const m = readManifest(path)
  const action = (m?.action ?? m?.browser_action) as { default_popup?: string } | undefined
  const optionsPage =
    (m?.options_ui as { page?: string } | undefined)?.page ?? (m?.options_page as string | undefined)
  const base = `chrome-extension://${live.id}/`
  return {
    id: live.id,
    popup: action?.default_popup ? base + action.default_popup : null,
    options: optionsPage ? base + optionsPage : null
  }
}

/** Instala desde la Chrome Web Store a partir de una URL o un id. */
export async function installFromStore(urlOrId: string): Promise<{ ok: boolean; error?: string; name?: string }> {
  const id = extensionIdFrom(urlOrId)
  if (!id) return { ok: false, error: 'No reconocí la extensión en esa página.' }
  const dest = join(storeDir(), id)
  try {
    await installCrx(id, dest, process.versions.chrome)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  // Si ya estaba instalada, reemplazamos su entrada (actualización).
  items = items.filter((e) => e.path !== dest)
  const r = await addExtension(dest)
  const m = readManifest(dest)
  return r.ok ? { ok: true, name: i18n(dest, m, m?.name) || id } : r
}
