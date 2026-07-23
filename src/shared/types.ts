import type { VaultItemMeta, VaultItemType } from './vault'

export interface TabInfo {
  id: number
  url: string
  title: string
  favicon: string | null
  loading: boolean
}

export interface ActiveInfo {
  url: string
  title: string
  canBack: boolean
  canForward: boolean
  loading: boolean
  pageColor: string | null
  bookmarked: boolean
}

export interface Bookmark {
  id: string
  title: string
  url: string
  favicon?: string | null
}

/** Proveedor de IA configurado por el usuario (solo API key + endpoint) */
export type ProviderKind = 'anthropic' | 'openai'
export interface AIProvider {
  id: string
  label: string
  /** 'anthropic' = Messages API; 'openai' = Chat Completions (OpenAI/Grok/OpenRouter/local) */
  kind: ProviderKind
  /** base URL opcional (para custom / OpenRouter / local). Vacío = default del kind. */
  baseUrl?: string
}
/** Info pública del proveedor (sin la key) para mostrar en UI */
export interface ProviderInfo extends AIProvider {
  hasKey: boolean
  active: boolean
}

export interface ModelOption {
  id: string
  name: string
}

/** Catálogo de modelos que cargamos nosotros (no lo escribe el usuario) */
export const MODELS: Record<ProviderKind, ModelOption[]> = {
  anthropic: [
    { id: 'claude-opus-4-8', name: 'Opus 4.8' },
    { id: 'claude-fable-5', name: 'Fable 5' },
    { id: 'claude-sonnet-5', name: 'Sonnet 5' },
    { id: 'claude-haiku-4-5', name: 'Haiku 4.5' }
  ],
  openai: [
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-5-mini', name: 'GPT-5 mini' }
  ]
}

export type Effort = 'low' | 'medium' | 'high'
export const EFFORTS: { id: Effort; name: string }[] = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' }
]

/** Contexto del chat que ve el composer: proveedor activo, modelos, modelo y effort */
export interface ChatContext {
  provider: { id: string; label: string; kind: ProviderKind } | null
  models: ModelOption[]
  model: string
  effort: Effort
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Tipo de acción de un paso, para elegir su icono en el chat */
export type StepKind =
  | 'navigate' | 'read' | 'click' | 'type' | 'scroll'
  | 'wait' | 'press' | 'hover' | 'select' | 'history'
  | 'tab' | 'screenshot' | 'generic'

/** Un paso del agente (acción con herramienta) mostrado en el chat */
export interface ChatStep {
  state: string // orb state: working | searching | listening | composing | solving | shaping
  label: string
  /** Acción que representa el paso (define el icono cuando está completado) */
  kind?: StepKind
  /** URL de favicon (para pasos de navegación) */
  favicon?: string
  /** Imagen resultante del paso, como data URL (para screenshots) */
  image?: string
}

export interface BrowserState {
  activeId: number | null
  tabs: TabInfo[]
  active: ActiveInfo | null
}

export interface MenuAnchor {
  x: number
  y: number
  width: number
  height: number
}

export type MenuActionName =
  | 'switch-profile' | 'new-profile' | 'bookmarks' | 'downloads'
  | 'extensions' | 'history' | 'developers' | 'settings'
  | 'new-tab' | 'incognito'

export interface MonperApi {
  platform: NodeJS.Platform
  newTab: () => void
  closeTab: (id: number) => void
  selectTab: (id: number) => void
  go: (url: string) => void
  back: () => void
  forward: () => void
  reload: () => void
  setCollapsed: (v: boolean) => void
  setChat: (open: boolean) => void
  onState: (cb: (state: BrowserState) => void) => () => void
  toggleBookmark: () => void
  openDevtools: () => void
  openDownloads: () => void
  openSettings: () => void
  /** DEV: cicla materiales de vibrancy en vivo (⌘⌥V) */
  cycleVibrancy: () => void
  /** Notifica cuando el usuario interactúa con la página (para cerrar overlays) */
  onPagePointerDown: (cb: () => void) => () => void
  // ---- Chat de IA ----
  getChatContext: () => Promise<ChatContext>
  /** Se dispara cuando cambian proveedores (para refrescar el composer) */
  onChatContext: (cb: (ctx: ChatContext) => void) => () => void
  setModel: (modelId: string) => void
  setEffort: (effort: Effort) => void
  chatSend: (messages: ChatMessage[]) => void
  chatCancel: () => void
  onChatToken: (cb: (text: string) => void) => () => void
  onChatStep: (cb: (step: ChatStep) => void) => () => void
  /** Adjunta una imagen (data URL) al último paso emitido (p. ej. screenshot) */
  onChatStepImage: (cb: (dataUrl: string) => void) => () => void
  onChatDone: (cb: () => void) => () => void
  onChatError: (cb: (message: string) => void) => () => void
  // ---- Vault (ventana nativa flotante) ----
  openVault: (anchor: MenuAnchor) => void
}

/** API expuesta a la ventana nativa del vault */
export interface VaultWinApi {
  onItems: (cb: (items: VaultItemMeta[]) => void) => void
  close: () => void
  manage: () => void
}

/** API expuesta a las páginas internas de contenido (new-tab page) */
export interface MonperTabApi {
  navigate: (url: string) => void
  getBookmarks: () => Promise<Bookmark[]>
  addBookmark: (b: Omit<Bookmark, 'id'>) => void
  removeBookmark: (id: string) => void
  onBookmarks: (cb: (bookmarks: Bookmark[]) => void) => () => void
  /** Borra datos de navegación (cookies, storage, cache) del perfil */
  clearBrowsingData: () => Promise<boolean>
  // ---- Gestión de proveedores de IA (para la página de Settings) ----
  listProviders: () => Promise<ProviderInfo[]>
  addProvider: (input: { label: string; kind: ProviderKind; baseUrl?: string }, apiKey: string) => Promise<ProviderInfo[]>
  removeProvider: (id: string) => Promise<ProviderInfo[]>
  setActiveProvider: (id: string) => Promise<ProviderInfo[]>
  // ---- Vault (gestión desde Settings) ----
  vaultList: () => Promise<VaultItemMeta[]>
  vaultAdd: (type: VaultItemType, label: string, data: Record<string, string>, secret: string) => Promise<VaultItemMeta[]>
  vaultRemove: (id: string) => Promise<VaultItemMeta[]>
}

declare global {
  interface Window {
    monper: MonperApi
    monperTab: MonperTabApi
    vaultwin: VaultWinApi
  }
}
