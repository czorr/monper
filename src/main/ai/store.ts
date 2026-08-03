import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { writeJson } from '../jsonfile'
import { app, safeStorage } from 'electron'
import type { AIProvider, ChatContext, Effort, ModelOption, ProviderInfo, ProviderKind } from '../../shared/types'
import { MODELS } from '../../shared/types'
import { catalogoDe } from './catalogo'
import * as vault from '../vault/store'

// Chat settings (config, NO secretos) — separado del vault.
interface ChatConfig { activeId: string | null; model: string | null; effort: Effort }
let cfgFile = ''
let cfg: ChatConfig = { activeId: null, model: null, effort: 'medium' }

function persist(): void { writeJson(cfgFile, cfg, 'los proveedores de IA') }

/** Migra el ai.json antiguo (providers + keys cifradas) al vault, una sola vez. */
function migrateLegacy(): void {
  const legacyFile = join(app.getPath('userData'), 'ai.json')
  if (!existsSync(legacyFile)) return
  try {
    const old = JSON.parse(readFileSync(legacyFile, 'utf-8')) as {
      providers?: { id: string; label: string; kind: ProviderKind; baseUrl?: string }[]
      activeId?: string | null
      model?: string | null
      effort?: Effort
      keys?: Record<string, string>
    }
    const map: Record<string, string> = {}
    for (const p of old.providers ?? []) {
      let key = ''
      const enc = old.keys?.[p.id]
      if (enc) { try { key = safeStorage.decryptString(Buffer.from(enc, 'base64')) } catch { /* skip */ } }
      const data: Record<string, string> = { kind: p.kind }
      if (p.baseUrl) data.baseUrl = p.baseUrl
      // La migración no puede reventar por un proveedor: si su key no se pudo descifrar del
      // formato viejo, o el vault la rechaza, se salta ESE y se siguen migrando los demás.
      if (!key) { console.warn(`[ai] se salta "${p.label}" al migrar: su API key no se pudo leer del formato antiguo`); continue }
      try {
        const item = vault.add('ai-key', p.label, data, key)
        map[p.id] = item.id
      } catch (e) {
        console.error(`[ai] no se pudo migrar "${p.label}":`, e instanceof Error ? e.message : e)
      }
    }
    cfg = {
      activeId: old.activeId ? (map[old.activeId] ?? null) : (vault.itemsByType('ai-key')[0]?.id ?? null),
      model: old.model ?? null,
      effort: old.effort ?? 'medium'
    }
    persist()
  } catch { /* si falla, arrancamos limpio */ }
}

export function initAI(): void {
  cfgFile = join(app.getPath('userData'), 'chat.json')
  if (existsSync(cfgFile)) {
    try { cfg = { activeId: null, model: null, effort: 'medium', ...JSON.parse(readFileSync(cfgFile, 'utf-8')) } } catch { /* default */ }
  } else {
    migrateLegacy() // primer arranque tras el vault
  }
}

function providers(): ProviderInfo[] {
  return vault.itemsByType('ai-key').map((it) => ({
    id: it.id,
    label: it.label,
    kind: (it.data.kind as ProviderKind) ?? 'anthropic',
    baseUrl: it.data.baseUrl,
    hasKey: vault.hasSecret(it.id),
    active: it.id === cfg.activeId
  }))
}

function activeInfo(): ProviderInfo | undefined {
  return providers().find((p) => p.active)
}

function catalogoDeProveedor(p: ProviderInfo): ModelOption[] {
  return catalogos.get(p.id) ?? MODELS[p.kind]
}

/**
 * TODOS los modelos de TODOS los proveedores conectados.
 *
 * El usuario no tiene por qué elegir primero un proveedor: quiere un modelo. Con dos cuentas
 * conectadas, el selector los enseña juntos y elegir uno cambia el proveedor activo solo — que
 * es un detalle de facturación nuestro, no una decisión suya.
 */
export function todosLosModelos(): ModelOption[] {
  return providers().flatMap((p) =>
    catalogoDeProveedor(p).map((m) => ({ ...m, providerId: p.id, providerKind: p.kind }))
  )
}

function resolveModel(): string {
  const p = activeInfo()
  if (!p) return ''
  const catalog = catalogoDeProveedor(p)
  if (cfg.model && catalog.some((m) => m.id === cfg.model)) return cfg.model
  return catalog[0]?.id ?? ''
}

export function listProviders(): ProviderInfo[] { return providers() }

export function addProvider(input: { label: string; kind: ProviderKind; baseUrl?: string }, apiKey: string): void {
  const data: Record<string, string> = { kind: input.kind }
  if (input.baseUrl) data.baseUrl = input.baseUrl
  const label = input.label.trim() || (input.kind === 'anthropic' ? 'Claude' : 'OpenAI')
  const item = vault.add('ai-key', label, data, apiKey)
  if (!cfg.activeId) { cfg.activeId = item.id; cfg.model = MODELS[input.kind][0]?.id ?? null; persist() }
}

export function removeProvider(id: string): void {
  vault.remove(id)
  if (cfg.activeId === id) {
    const next = providers()[0]
    cfg.activeId = next?.id ?? null
    cfg.model = next ? (MODELS[next.kind][0]?.id ?? null) : null
    persist()
  }
}

export function setActive(id: string): void {
  const item = vault.get(id)
  if (!item || item.type !== 'ai-key') return
  cfg.activeId = id
  const kind = (item.data.kind as ProviderKind) ?? 'anthropic'
  const catalogo = catalogos.get(item.id) ?? MODELS[kind]
  if (!catalogo.some((m) => m.id === cfg.model)) cfg.model = catalogo[0]?.id ?? null
  persist()
}

/**
 * Elige un modelo, venga del proveedor que venga. Si es de otro, se cambia el activo también:
 * el usuario eligió un modelo, no una cuenta.
 */
export function setModel(modelId: string): void {
  const dueno = providers().find((p) => catalogoDeProveedor(p).some((m) => m.id === modelId))
  if (!dueno) return
  cfg.activeId = dueno.id
  cfg.model = modelId
  persist()
}

export function setEffort(effort: Effort): void {
  if (effort === 'low' || effort === 'medium' || effort === 'high') { cfg.effort = effort; persist() }
}

/**
 * Catálogo por proveedor, tal y como lo contestó él. Se cachea en memoria: preguntar en cada
 * `getChatContext` (que se llama al abrir el composer) metería una petición de red en el
 * camino de pintar la UI.
 */
const catalogos = new Map<string, ModelOption[]>()

/** Refresca el catálogo de TODOS los proveedores conectados, no solo el del activo. */
export async function refrescarModelos(): Promise<ModelOption[]> {
  await Promise.all(providers().map(async (p) => {
    const key = vault.getSecret(p.id)
    if (!key) return
    const lista = await catalogoDe({ id: p.id, label: p.label, kind: p.kind, baseUrl: p.baseUrl }, key)
    catalogos.set(p.id, lista)
  }))
  const todos = todosLosModelos()
  // El modelo elegido puede haber desaparecido del catálogo (lo retiró el proveedor): se cae al
  // primero en vez de dejar seleccionado uno que devolvería 404 en cada mensaje.
  if (cfg.model && !todos.some((m) => m.id === cfg.model)) {
    cfg.model = todos[0]?.id ?? null
    if (todos[0]?.providerId) cfg.activeId = todos[0].providerId
    persist()
  }
  return todos
}

export function getChatContext(): ChatContext {
  const p = activeInfo()
  return {
    provider: p ? { id: p.id, label: p.label, kind: p.kind } : null,
    models: todosLosModelos(),
    model: resolveModel(),
    effort: cfg.effort
  }
}

/** Proveedor activo + clave + modelo + effort — sólo para uso en main */
export function getActiveProvider(): { provider: AIProvider; key: string; model: string; effort: Effort } | null {
  const p = activeInfo()
  if (!p) return null
  const key = vault.getSecret(p.id)
  if (!key) return null
  return { provider: { id: p.id, label: p.label, kind: p.kind, baseUrl: p.baseUrl }, key, model: resolveModel(), effort: cfg.effort }
}
