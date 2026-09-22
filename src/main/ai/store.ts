import { join } from 'path'
import { t as tr } from '../../shared/i18n'
import type { ChatFallo } from '../../shared/types'
import { readFileSync, existsSync, watchFile } from 'fs'
import { createHash, randomUUID } from 'crypto'
import { writeJson, writeText } from '../jsonfile'
import { app, safeStorage } from 'electron'
import type { AIProvider, ChatContext, Effort, ModelOption, ProviderInfo, ProviderKind, ProviderInput, ProviderSettings } from '../../shared/types'
import { parseConfig, editConfig, type ProviderDocument, type Connection } from './config'
import { MODELS } from '../../shared/types'
import { catalogoDe } from './catalogo'
import * as vault from '../vault/store'
import { rutaDePerfil, preferencesFor, perfilActivoId, PERFIL_POR_DEFECTO } from '../perfiles'

// Chat settings (config, NO secretos) — separado del vault.
interface ChatConfig { activeId: string | null; model: string | null; effort: Effort }
let cfgFile = ''
let cfg: ChatConfig = { activeId: null, model: null, effort: 'medium' }
let providerFile = ''
let document: ProviderDocument = { provider: {} }
let configText = ''
let configError: string | undefined

function reloadConfig(): void {
  try {
    const text = readFileSync(providerFile, 'utf8')
    const next = parseConfig(text)
    if (text !== configText) catalogos.clear()
    document = next
    configText = text
    configError = undefined
  } catch (error) {
    configError = error instanceof Error ? error.message : 'No se pudo leer titanio.jsonc.'
  }
}

function revision(): string { return createHash('sha256').update(configText).digest('hex') }

function assertEditable(expected?: string): void {
  reloadConfig()
  if (configError) throw new Error(configError)
  if (expected !== undefined && revision() !== expected) throw new Error('La configuración cambió en otro lugar. Cierra el editor y vuelve a abrir la conexión para cargar los cambios.')
}

function saveConfig(text: string): void {
  const next = parseConfig(text)
  const result = writeText(providerFile, text, 'titanio.jsonc')
  if (!result.ok) throw new Error('No se pudo guardar titanio.jsonc. Comprueba los permisos y el espacio disponible.')
  document = next
  configText = text
  catalogos.clear()
}

function keyFor(id: string): string | null {
  const ref = document.provider[id]?.options.apiKey
  if (ref?.startsWith('{env:')) return process.env[ref.slice(5, -1)] || null
  if (ref?.startsWith('{vault:')) return vault.getSecret(ref.slice(7, -1))
  return null
}

function hasKey(id: string): boolean {
  const ref = document.provider[id]?.options.apiKey
  if (ref?.startsWith('{env:')) return !!process.env[ref.slice(5, -1)]
  return !!ref?.startsWith('{vault:') && vault.hasSecret(ref.slice(7, -1))
}

export function providerConfigPath(): string { return providerFile }
export function providerSettings(): ProviderSettings {
  reloadConfig()
  return { providers: providers(), path: providerFile, revision: revision(), error: configError }
}

export async function discoverProvider(id: string): Promise<ModelOption[]> {
  reloadConfig()
  if (configError) throw new Error(configError)
  const p = providers().find((item) => item.id === id)
  const key = keyFor(id)
  if (!p || !key) throw new Error('Guarda una clave o configura la variable de entorno antes de buscar modelos.')
  const before = configText
  const models = await catalogoDe(p, key, true)
  if (before === configText) catalogos.set(id, models)
  return models
}

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

export function initAI(onChange?: () => void): void {
  cfg = { activeId: null, model: null, effort: 'medium' }
  cfgFile = rutaDePerfil('chat.json')
  if (existsSync(cfgFile)) {
    try { cfg = { activeId: null, model: null, effort: 'medium', ...JSON.parse(readFileSync(cfgFile, 'utf-8')) } } catch { /* default */ }
  } else {
    if (perfilActivoId() === PERFIL_POR_DEFECTO) migrateLegacy()
  }
  providerFile = join(app.getPath('userData'), 'titanio.jsonc')
  if (!existsSync(providerFile)) {
    const provider: Record<string, Connection> = Object.create(null)
    for (const item of vault.itemsByType('ai-key')) {
      provider[item.id] = {
        name: item.label, kind: (item.data.kind as ProviderKind) || 'anthropic',
        options: { baseURL: item.data.baseUrl || undefined, apiKey: `{vault:${item.id}}` }
      }
    }
    const result = writeText(providerFile, '// Conexiones de IA. Edita aquí o desde Ajustes.\n// Claves: {env:NOMBRE} o referencias al vault cifrado.\n' + JSON.stringify({ provider }, null, 2) + '\n', 'titanio.jsonc')
    if (!result.ok) console.error('[ai] no se pudo crear titanio.jsonc')
  }
  reloadConfig()
  applyDefaultProfileModel()
  watchFile(providerFile, { interval: 750, persistent: false }, () => { reloadConfig(); onChange?.() })
}

export function applyDefaultProfileModel(): void {
  const selected = preferencesFor().agent.defaultModel
  if (!selected) return
  cfg.activeId = selected.providerId
  cfg.model = selected.id
  persist()
}

function providers(): ProviderInfo[] {
  const ids = Object.keys(document.provider)
  const active = cfg.activeId && ids.includes(cfg.activeId) ? cfg.activeId : ids[0]
  return Object.entries(document.provider).map(([id, p]) => ({
    id, label: p.name, kind: p.kind, baseUrl: p.options.baseURL,
    hasKey: hasKey(id), active: id === active,
    keySource: p.options.apiKey?.startsWith('{env:') ? 'env' : p.options.apiKey ? 'vault' : 'none',
    envVar: p.options.apiKey?.startsWith('{env:') ? p.options.apiKey.slice(5, -1) : undefined,
    models: Object.entries(p.models ?? {}).map(([key, m]) => ({ id: m.id || key, name: m.name || key }))
  }))
}

function activeInfo(): ProviderInfo | undefined {
  return providers().find((p) => p.active)
}

function catalogoDeProveedor(p: ProviderInfo): ModelOption[] {
  return p.models?.length ? p.models : catalogos.get(p.id) ?? (p.baseUrl ? [] : MODELS[p.kind])
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
    catalogoDeProveedor(p).map((m) => ({ ...m, providerId: p.id, providerKind: p.kind, provider: { id: p.id, label: p.label, kind: p.kind, baseUrl: p.baseUrl } }))
  )
}

function resolveModel(): string {
  const p = activeInfo()
  if (!p) return ''
  const catalog = catalogoDeProveedor(p)
  if (cfg.model && catalog.some((m) => m.id === cfg.model)) return cfg.model
  return catalog[0]?.id ?? ''
}

export function listProviders(): ProviderInfo[] { reloadConfig(); return providers() }

export function addProvider(input: { label: string; kind: ProviderKind; baseUrl?: string }, apiKey: string): void {
  saveProvider({ ...input, label: input.label.trim() || (input.kind === 'anthropic' ? 'Claude' : 'OpenAI') }, apiKey)
}

export function saveProvider(input: ProviderInput, apiKey: string, expected?: string): ProviderSettings {
  assertEditable(expected)
  const id = input.id || randomUUID()
  const old = document.provider[id]
  if (input.id && !old) throw new Error('Esta conexión ya no existe.')
  if (input.envVar && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.envVar)) throw new Error('El nombre de la variable de entorno no es válido.')
  if (input.models && new Set(input.models.map((m) => m.id)).size !== input.models.length) throw new Error('Los IDs de modelo no pueden repetirse.')
  const models: NonNullable<Connection['models']> = Object.create(null)
  for (const m of input.models ?? []) {
    if (!m.id.trim()) throw new Error('Cada modelo necesita un ID.')
    const existing = Object.entries(old?.models ?? {}).find(([key, value]) => (value.id || key) === m.id)
    models[existing?.[0] || m.id] = { ...existing?.[1], name: m.name.trim() || m.id }
  }
  const next: Connection = {
    ...old, name: input.label.trim(), kind: input.kind,
    options: { ...old?.options, baseURL: input.baseUrl?.trim() || undefined,
      apiKey: input.envVar ? `{env:${input.envVar}}` : old?.options.apiKey },
    models: input.models === undefined ? old?.models : models
  }
  // Valida antes de guardar la clave; ningún error de formulario debe dejar secretos huérfanos.
  parseConfig(JSON.stringify({ provider: { [id]: next } }))
  let created: string | undefined
  if (apiKey.trim()) {
    const item = vault.add('ai-key', next.name, { kind: next.kind, baseUrl: next.options.baseURL || '' }, apiKey.trim())
    created = item.id
    next.options.apiKey = `{vault:${item.id}}`
  }
  try {
    let text = configText
    if (!old) text = editConfig(text, ['provider', id], next)
    else {
      // Solo se cambian los campos editados, conservando comentarios y opciones avanzadas.
      for (const field of ['name', 'kind', 'models'] as const) {
        if (JSON.stringify(old[field]) !== JSON.stringify(next[field])) text = editConfig(text, ['provider', id, field], next[field])
      }
      for (const field of ['baseURL', 'apiKey'] as const) {
        if (old.options[field] !== next.options[field]) text = editConfig(text, ['provider', id, 'options', field], next.options[field])
      }
    }
    saveConfig(text)
  } catch (error) {
    if (created) vault.remove(created)
    throw error
  }
  if (!cfg.activeId) { cfg.activeId = id; cfg.model = null; persist() }
  return providerSettings()
}

export function removeProvider(id: string, expected?: string): void {
  assertEditable(expected)
  saveConfig(editConfig(configText, ['provider', id], undefined))
  if (cfg.activeId === id) {
    const next = providers()[0]
    cfg.activeId = next?.id ?? null
    cfg.model = next ? (MODELS[next.kind][0]?.id ?? null) : null
    persist()
  }
}

export function setActive(id: string): void {
  reloadConfig()
  const item = providers().find((p) => p.id === id)
  if (!item) return
  cfg.activeId = id
  const catalogo = catalogoDeProveedor(item)
  if (!catalogo.some((m) => m.id === cfg.model)) cfg.model = catalogo[0]?.id ?? null
  persist()
}

/**
 * Elige un modelo, venga del proveedor que venga. Si es de otro, se cambia el activo también:
 * el usuario eligió un modelo, no una cuenta.
 */
export function setModel(modelId: string, providerId?: string): void {
  const dueno = providers().find((p) => (!providerId || p.id === providerId) && catalogoDeProveedor(p).some((m) => m.id === modelId))
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
  const before = configText
  await Promise.all(providers().map(async (p) => {
    const key = keyFor(p.id)
    if (!key) return
    const lista = await catalogoDe({ id: p.id, label: p.label, kind: p.kind, baseUrl: p.baseUrl }, key)
    if (before === configText) catalogos.set(p.id, lista)
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
    provider: p ? { id: p.id, label: p.label, kind: p.kind, baseUrl: p.baseUrl } : null,
    models: todosLosModelos(),
    model: resolveModel(),
    effort: cfg.effort
  }
}

/** Proveedor activo + clave + modelo + effort — sólo para uso en main */
type ActiveProvider = { provider: AIProvider; key: string; model: string; effort: Effort }

export function prepareActiveProvider(): { ok: true; active: ActiveProvider } | { ok: false; error: ChatFallo } {
  reloadConfig()
  const accion: NonNullable<ChatFallo['accion']> = { label: tr('Revisar conexión'), kind: 'settings' }
  if (configError) return { ok: false, error: {
    tipo: 'proveedor', titulo: tr('Revisa titanio.jsonc'),
    detalle: configError, accion
  } }
  const p = activeInfo()
  if (!p) return { ok: false, error: {
    tipo: 'sin-proveedor', titulo: tr('No hay proveedores configurados'),
    detalle: tr('Añade una conexión en Ajustes o en titanio.jsonc para enviar mensajes.'), accion
  } }
  const key = keyFor(p.id)
  if (!key) return { ok: false, error: {
    tipo: 'auth', titulo: tr('Faltan credenciales para {0}', p.label),
    detalle: p.envVar
      ? tr('La variable {0} no está disponible en el proceso de Titanio. Configúrala antes de iniciar la app o guarda una API key desde Ajustes.', p.envVar)
      : p.keySource === 'vault'
        ? tr('No se pudo leer la clave de {0} en el Vault. Revisa o reemplaza su API key desde Ajustes.', p.label)
        : tr('La conexión {0} no tiene una API key configurada. Añádela desde Ajustes o referencia una variable de entorno en titanio.jsonc.', p.label),
    accion
  } }
  const model = resolveModel()
  if (!model) return { ok: false, error: {
    tipo: 'modelo', titulo: tr('No hay modelos disponibles para {0}', p.label),
    detalle: tr('Añade un modelo o consulta el catálogo desde los ajustes de esta conexión.'), accion
  } }
  return { ok: true, active: { provider: { id: p.id, label: p.label, kind: p.kind, baseUrl: p.baseUrl }, key, model, effort: cfg.effort } }
}

export function getActiveProvider(): ActiveProvider | null {
  const result = prepareActiveProvider()
  return result.ok ? result.active : null
}
