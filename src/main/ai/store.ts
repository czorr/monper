import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app, safeStorage } from 'electron'
import type { AIProvider, ChatContext, Effort, ProviderInfo, ProviderKind } from '../../shared/types'
import { MODELS } from '../../shared/types'
import * as vault from '../vault/store'

// Chat settings (config, NO secretos) — separado del vault.
interface ChatConfig { activeId: string | null; model: string | null; effort: Effort }
let cfgFile = ''
let cfg: ChatConfig = { activeId: null, model: null, effort: 'medium' }

function persist(): void { try { writeFileSync(cfgFile, JSON.stringify(cfg, null, 2)) } catch { /* noop */ } }

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
      const item = vault.add('ai-key', p.label, data, key)
      map[p.id] = item.id
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

function resolveModel(): string {
  const p = activeInfo()
  if (!p) return ''
  const catalog = MODELS[p.kind]
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
  if (!MODELS[kind].some((m) => m.id === cfg.model)) cfg.model = MODELS[kind][0]?.id ?? null
  persist()
}

export function setModel(modelId: string): void {
  const p = activeInfo()
  if (p && MODELS[p.kind].some((m) => m.id === modelId)) { cfg.model = modelId; persist() }
}

export function setEffort(effort: Effort): void {
  if (effort === 'low' || effort === 'medium' || effort === 'high') { cfg.effort = effort; persist() }
}

export function getChatContext(): ChatContext {
  const p = activeInfo()
  return {
    provider: p ? { id: p.id, label: p.label, kind: p.kind } : null,
    models: p ? MODELS[p.kind] : [],
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
