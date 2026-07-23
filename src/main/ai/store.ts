import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app, safeStorage } from 'electron'
import type { AIProvider, ChatContext, Effort, ProviderInfo, ProviderKind } from '../../shared/types'
import { MODELS } from '../../shared/types'

interface Persisted {
  providers: AIProvider[]
  activeId: string | null
  model: string | null // modelo elegido en el composer
  effort: Effort
  keys: Record<string, string> // id -> base64(encrypted key)
}

let file = ''
let data: Persisted = { providers: [], activeId: null, model: null, effort: 'medium', keys: {} }

function persist(): void {
  try { writeFileSync(file, JSON.stringify(data, null, 2)) } catch { /* noop */ }
}

export function initAI(): void {
  file = join(app.getPath('userData'), 'ai.json')
  if (existsSync(file)) {
    try { data = { model: null, effort: 'medium', ...JSON.parse(readFileSync(file, 'utf-8')) } } catch { /* keep default */ }
  }
}

function decryptKey(id: string): string | null {
  const enc = data.keys[id]
  if (!enc) return null
  try { return safeStorage.decryptString(Buffer.from(enc, 'base64')) } catch { return null }
}

function activeProvider(): AIProvider | null {
  return data.providers.find((p) => p.id === data.activeId) ?? null
}

/** Modelo válido para el proveedor activo (default = primero del catálogo) */
function resolveModel(): string {
  const p = activeProvider()
  if (!p) return ''
  const catalog = MODELS[p.kind]
  if (data.model && catalog.some((m) => m.id === data.model)) return data.model
  return catalog[0]?.id ?? ''
}

export function listProviders(): ProviderInfo[] {
  return data.providers.map((p) => ({ ...p, hasKey: !!data.keys[p.id], active: p.id === data.activeId }))
}

export function addProvider(input: { label: string; kind: ProviderKind; baseUrl?: string }, apiKey: string): AIProvider {
  const p: AIProvider = {
    id: Math.random().toString(36).slice(2),
    label: input.label.trim() || (input.kind === 'anthropic' ? 'Claude' : 'OpenAI'),
    kind: input.kind,
    baseUrl: input.baseUrl?.trim() || undefined
  }
  data.providers = [...data.providers, p]
  if (apiKey && safeStorage.isEncryptionAvailable()) {
    data.keys[p.id] = safeStorage.encryptString(apiKey).toString('base64')
  }
  if (!data.activeId) { data.activeId = p.id; data.model = MODELS[p.kind][0]?.id ?? null }
  persist()
  return p
}

export function removeProvider(id: string): void {
  data.providers = data.providers.filter((p) => p.id !== id)
  delete data.keys[id]
  if (data.activeId === id) {
    data.activeId = data.providers[0]?.id ?? null
    data.model = data.activeId ? (MODELS[activeProvider()!.kind][0]?.id ?? null) : null
  }
  persist()
}

export function setActive(id: string): void {
  const p = data.providers.find((x) => x.id === id)
  if (!p) return
  data.activeId = id
  if (!MODELS[p.kind].some((m) => m.id === data.model)) data.model = MODELS[p.kind][0]?.id ?? null
  persist()
}

export function setModel(modelId: string): void {
  const p = activeProvider()
  if (p && MODELS[p.kind].some((m) => m.id === modelId)) { data.model = modelId; persist() }
}

export function setEffort(effort: Effort): void {
  if (effort === 'low' || effort === 'medium' || effort === 'high') { data.effort = effort; persist() }
}

export function getChatContext(): ChatContext {
  const p = activeProvider()
  return {
    provider: p ? { id: p.id, label: p.label, kind: p.kind } : null,
    models: p ? MODELS[p.kind] : [],
    model: resolveModel(),
    effort: data.effort
  }
}

/** Proveedor activo + clave + modelo + effort — sólo para uso en main */
export function getActiveProvider(): { provider: AIProvider; key: string; model: string; effort: Effort } | null {
  const provider = activeProvider()
  if (!provider) return null
  const key = decryptKey(provider.id)
  if (!key) return null
  return { provider, key, model: resolveModel(), effort: data.effort }
}
