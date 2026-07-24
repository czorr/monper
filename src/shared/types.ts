import type { VaultItemMeta, VaultItemType } from './vault'

export interface TabInfo {
  id: number
  url: string
  title: string
  favicon: string | null
  loading: boolean
  /** true mientras el sitio tiene acceso activo a cámara/micrófono */
  recording: boolean
  /** true si el usuario silenció la pestaña */
  muted: boolean
  /** true mientras la pestaña reproduce audio */
  audible: boolean
  /** true si la pestaña es del agente (creada/controlada por Monper) */
  agent: boolean
  /** id del bookmark al que está ligada esta pestaña (se muestra en su slot de bookmarks) */
  bookmarkId: string | null
}

export interface ActiveInfo {
  url: string
  title: string
  canBack: boolean
  canForward: boolean
  loading: boolean
  pageColor: string | null
  bookmarked: boolean
  muted: boolean
  audible: boolean
}

export interface Bookmark {
  id: string
  title: string
  url: string
  favicon?: string | null
}

/** Perfil del usuario (editable en Settings → Account) */
export interface Profile {
  name: string
  initials: string
  /** Foto de avatar como data URL, o null */
  avatar: string | null
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

/** Imagen adjuntada por el usuario a un mensaje (data URL). */
export interface ChatAttachment {
  type: 'image'
  dataUrl: string
  name?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Adjuntos (solo en mensajes del usuario); el modelo los recibe como contenido multimodal. */
  attachments?: ChatAttachment[]
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

/** Una sugerencia del autocompletado del omnibox / new tab */
export interface Suggestion {
  kind: 'history' | 'bookmark' | 'search' | 'url'
  /** Texto principal a mostrar */
  title: string
  /** URL a la que navegar al elegir (para search: la búsqueda de Google) */
  url: string
  /** Subtexto (dominio, "Buscar en Google", etc.) */
  detail?: string
  favicon?: string | null
}

export interface BrowserState {
  activeId: number | null
  tabs: TabInfo[]
  active: ActiveInfo | null
  /** El agente está operando la pestaña activa ahora mismo (muestra la leyenda de control). */
  controlling: boolean
}

// ---- Skills del agente ----
export interface SkillMeta {
  id: string
  name: string
  description: string
  keywords: string[]
  enabled: boolean
  builtin: boolean
  author: string
  updated: string
}
export interface SkillDetail extends SkillMeta {
  /** Cuerpo Markdown del SKILL.md (instrucciones para el agente) */
  body: string
}

// ---- Permisos del sitio (cámara, micrófono, etc.) ----
export type PermKey = 'camera' | 'microphone' | 'geolocation' | 'notifications' | 'clipboard'
export type PermState = 'granted' | 'denied' | 'ask'
export interface SitePermission { key: PermKey; state: PermState }
export interface SiteInfoData {
  url: string
  origin: string
  domain: string
  secure: boolean
  internal: boolean
  permissions: SitePermission[]
}
/** API expuesta a la ventana nativa del menú de perfil */
export interface ProfileMenuWinApi {
  onProfile: (cb: (p: Profile) => void) => void
  reportHeight: (h: number) => void
  action: (name: string) => void
  close: () => void
}

/** API expuesta a la ventana nativa de info del sitio */
export interface SiteInfoWinApi {
  onData: (cb: (data: SiteInfoData) => void) => void
  reportHeight: (h: number) => void
  toggle: (key: PermKey, state: PermState) => void
  clearData: () => void
  close: () => void
}

/** Rectángulo (coords de la ventana) para posicionar la ventana nativa del omnibox */
export interface OmniRect { x: number; y: number; width: number; height: number }
/** Datos que el chrome envía a la ventana nativa del omnibox */
export interface OmniData { items: Suggestion[]; active: number; query: string }

/** API expuesta a la ventana nativa del omnibox (dropdown de sugerencias) */
export interface OmniWinApi {
  onData: (cb: (data: OmniData) => void) => void
  reportHeight: (h: number) => void
  choose: (index: number) => void
  hover: (index: number) => void
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
  reorderTabs: (ids: number[]) => void
  go: (url: string) => void
  back: () => void
  forward: () => void
  reload: () => void
  setCollapsed: (v: boolean) => void
  setChat: (open: boolean) => void
  /** Oculta/muestra la vista nativa al editar la URL (para ver el dropdown del omnibox) */
  setOmnibox: (open: boolean) => void
  // ---- Ventana nativa del dropdown del omnibox (flota sobre la página) ----
  omniShow: (rect: OmniRect, data: OmniData) => void
  omniUpdate: (data: OmniData) => void
  omniHide: () => void
  onOmniChosen: (cb: (index: number) => void) => () => void
  onOmniHovered: (cb: (index: number) => void) => () => void
  /** Abre el popup nativo de info/permisos del sitio, anclado al pill del dominio */
  openSiteInfo: (anchor: MenuAnchor) => void
  /** Abre el menú de perfil (ventana nativa), anclado al account pill */
  openProfileMenu: (anchor: MenuAnchor) => void
  // ---- Peek del sidebar (hover del botón expandir con sidebar colapsado) ----
  peekShow: (anchor: MenuAnchor) => void
  peekMaybeHide: () => void
  // ---- Perfil ----
  getProfile: () => Promise<Profile>
  onProfile: (cb: (p: Profile) => void) => () => void
  onState: (cb: (state: BrowserState) => void) => () => void
  toggleBookmark: () => void
  // ---- Bookmarks (sidebar del chrome) ----
  getBookmarks: () => Promise<Bookmark[]>
  onBookmarks: (cb: (bookmarks: Bookmark[]) => void) => () => void
  removeBookmark: (id: string) => void
  /** Abre (o reactiva) el bookmark como pestaña ligada a su slot */
  openBookmark: (id: string) => void
  /** Abre el menú contextual nativo de una pestaña */
  tabContextMenu: (id: number) => void
  /** Abre el menú contextual nativo de un bookmark */
  bookmarkContextMenu: (id: string) => void
  /** Silencia/reactiva el audio de una pestaña (o la activa si no se da id) */
  toggleMute: (id?: number) => void
  openDevtools: () => void
  openDownloads: () => void
  /** Resumen de descargas (para el icono del topbar) */
  onDownloadsSummary: (cb: (s: DownloadsSummary) => void) => () => void
  getDownloadsSummary: () => Promise<DownloadsSummary>
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
  takeOver: () => void
  onChatToken: (cb: (text: string) => void) => () => void
  onChatStep: (cb: (step: ChatStep) => void) => () => void
  /** Adjunta una imagen (data URL) al último paso emitido (p. ej. screenshot) */
  onChatStepImage: (cb: (dataUrl: string) => void) => () => void
  onChatDone: (cb: () => void) => () => void
  onChatError: (cb: (message: string) => void) => () => void
  /** El main pide abrir el chat y enviar un prompt (p. ej. desde una acción rápida). */
  onChatPrefill: (cb: (prompt: string) => void) => () => void
  // ---- Vault (ventana nativa flotante) ----
  openVault: (anchor: MenuAnchor) => void
  // ---- Menú nativo → acciones de estado del renderer ----
  onMenuAction: (cb: (action: string) => void) => () => void
  // ---- Autocompletado del omnibox ----
  suggest: (query: string) => Promise<Suggestion[]>
  // ---- Buscar en página ----
  findInPage: (query: string, opts: { forward: boolean; findNext: boolean }) => void
  stopFindInPage: () => void
  onFindResult: (cb: (r: FindResult) => void) => () => void
}

/** Una descarga rastreada por el gestor. */
export interface DownloadEntry {
  id: string
  filename: string
  url: string
  savePath: string
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted'
  received: number
  total: number
  paused: boolean
}

export interface DownloadsSummary {
  /** descargas en curso */
  active: number
  /** total en la lista */
  total: number
}

/** Resultado de buscar-en-página (found-in-page). */
export interface FindResult {
  matches: number
  active: number
}

/** Acción rápida sobre texto seleccionado: una plantilla de prompt para el agente. */
export interface QuickAction {
  id: string
  name: string
  /** nombre de un icono de tabler soportado (ver QUICK_ICONS) */
  icon: string
  /** plantilla; {{selection}} se reemplaza por el texto seleccionado */
  template: string
}

/** Iconos de tabler soportados para las acciones rápidas (deben existir en el mapa inyectado). */
export const QUICK_ICONS = [
  'list', 'language', 'sparkles', 'wand', 'message', 'pencil',
  'bulb', 'world', 'quote', 'code', 'mail', 'search'
] as const

/**
 * API extra de la ventana del "peek" del sidebar. Además de esto, la ventana expone
 * `window.monper` completo (mismo preload que el chrome) para poder reusar <Sidebar/>.
 */
export interface PeekWinApi {
  /** Se dispara cada vez que el peek se muestra (para la animación de entrada). */
  onShown: (cb: () => void) => () => void
  hide: () => void
}

/** Credencial ofrecida en el quick sign-in (metadata, NUNCA el secreto). */
export interface SigninCredential {
  id: string
  label: string
  username: string
  origin: string
}

/** API expuesta a la ventana nativa de "Sign in with…" */
export interface SigninWinApi {
  onCredentials: (cb: (list: SigninCredential[]) => void) => () => void
  reportHeight: (h: number) => void
  /** Pide al main que rellene con ese ítem del vault (el secreto no pasa por el renderer). */
  fill: (id: string) => void
  dismiss: () => void
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
  // ---- Descargas (página interna de downloads) ----
  listDownloads: () => Promise<DownloadEntry[]>
  onDownloads: (cb: (list: DownloadEntry[]) => void) => () => void
  cancelDownload: (id: string) => void
  openDownload: (id: string) => void
  showDownload: (id: string) => void
  clearDownloads: () => void
  // ---- Acciones rápidas (Settings) ----
  listQuickActions: () => Promise<QuickAction[]>
  saveQuickAction: (a: QuickAction) => Promise<QuickAction[]>
  removeQuickAction: (id: string) => Promise<QuickAction[]>
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
  // ---- Autocompletado del omnibox / new tab ----
  suggest: (query: string) => Promise<Suggestion[]>
  // ---- Acciones del new tab ----
  openSettings: () => void
  openChat: () => void
  // ---- Skills del agente (gestión desde Settings) ----
  skillsList: () => Promise<SkillMeta[]>
  skillsGet: (id: string) => Promise<SkillDetail | null>
  skillsToggle: (id: string, enabled: boolean) => Promise<SkillMeta[]>
  openSkillsFolder: () => void
  // ---- Perfil (gestión desde Settings → Account) ----
  getProfile: () => Promise<Profile>
  setProfile: (name: string) => Promise<Profile>
  setAvatar: (dataUrl: string | null) => Promise<Profile>
}

declare global {
  interface Window {
    monper: MonperApi
    monperTab: MonperTabApi
    vaultwin: VaultWinApi
    omniwin: OmniWinApi
    siteinfo: SiteInfoWinApi
    profilemenu: ProfileMenuWinApi
    peekbar: PeekWinApi
    signin: SigninWinApi
  }
}
