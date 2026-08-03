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
  /**
   * Qué página nuestra es, o null si es un sitio web.
   *
   * Hace falta porque `url` viene VACÍA en nuestras páginas (a propósito: la omnibox no debe
   * mostrar `file:///…/settings.html`), así que el renderer no podía distinguir la new tab de
   * settings. Sin esto tendría que adivinarlo por el título.
   */
  internal: InternalPage | null
}

export interface ActiveInfo {
  url: string
  /** Ver TabInfo.internal. */
  internal: InternalPage | null
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
  /** Vacía en una carpeta: una carpeta agrupa, no se abre. */
  url: string
  favicon?: string | null
  /**
   * Una carpeta. El árbol es de UN nivel a propósito: el sidebar es estrecho y anidar
   * carpetas dentro de carpetas dejaría los títulos en dos caracteres. Si algún día hace
   * falta más profundidad, `parentId` ya la soporta; lo que hay que revisar es la UI.
   */
  folder?: boolean
  /** Carpeta que lo contiene. Ausente o null = en la raíz. */
  parentId?: string | null
  /** Solo carpetas: plegada en el sidebar. */
  collapsed?: boolean
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
/**
 * Diagnóstico de un fallo del proveedor de IA, ya clasificado y con qué hacer.
 *
 * Antes el chat volcaba el error crudo en la burbuja:
 * `HTTP 400 — {"type":"error","error":{"message":"Your credit balance is too low…"}}`.
 * Es la información correcta con la forma equivocada: el usuario no sabe si es culpa suya, si
 * se arregla solo, ni dónde tocar. `crudo` no se tira —va detrás de un desplegable—, porque sin
 * él un caso que no encaje en ninguna rama sería imposible de depurar.
 */
export interface ChatFallo {
  /** Clave estable para el renderer. No se muestra al usuario. */
  tipo: 'auth' | 'credito' | 'limite' | 'tope' | 'modelo' | 'red' | 'proveedor' | 'contexto' | 'sin-proveedor' | 'desconocido'
  titulo: string
  detalle: string
  accion?: { label: string; kind: 'settings' | 'url'; value?: string }
  /** Texto del proveedor tal cual. */
  crudo?: string
}

/** Un turno del agente, tal como se anota para contar consumo. */
export interface TurnoUso {
  at: number
  kind: ProviderKind
  model: string
  inputTokens: number
  outputTokens: number
  /** Input servido de caché: se cobra aparte y mucho más barato. */
  cachedInputTokens?: number
  reasoningTokens?: number
  steps: number
  /** false si el turno acabó en error del proveedor. */
  ok: boolean
}

export interface UsoPorDia {
  dia: string
  turnos: number
  pasos: number
  inputTokens: number
  outputTokens: number
  coste: number
}

export interface UsoPorModelo {
  model: string
  turnos: number
  inputTokens: number
  outputTokens: number
  coste: number
  /** false = no sabemos su tarifa, así que su coste NO cuenta (ver PRECIOS en usage.ts). */
  conPrecio: boolean
}

export interface ResumenUso {
  dias: number
  turnos: number
  pasos: number
  fallidos: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  coste: number
  /** true si algún modelo usado no tiene tarifa conocida: el coste mostrado es un mínimo. */
  hayModelosSinPrecio: boolean
  gastoHoy: number
  porDia: UsoPorDia[]
  porModelo: UsoPorModelo[]
}

/** Info pública del proveedor (sin la key) para mostrar en UI */
export interface ProviderInfo extends AIProvider {
  hasKey: boolean
  active: boolean
}

export interface ModelOption {
  id: string
  name: string
  /**
   * De qué proveedor conectado sale. Elegir un modelo cambia el proveedor activo solo: al
   * usuario le da igual con quién tienes cuenta, solo quiere ese modelo.
   */
  providerId?: string
  providerKind?: ProviderKind
}

/**
 * Catálogo de arranque. NO es la lista definitiva: al conectar se le pregunta al proveedor por
 * la suya (ver main/ai/catalogo.ts) y esta solo aporta nombres bonitos y el orden.
 *
 * Solo modelos VIGENTES y self-serve. Las generaciones viejas se quitan aunque la API las siga
 * aceptando: un selector con diez modelos de tres generaciones no ayuda a elegir, estorba.
 * Mythos 5 tampoco está: es de acceso restringido y ofrecerlo a todo el mundo sería enseñar un
 * modelo que casi nadie puede usar.
 *
 * El PRIMERO de cada lista es el que se elige solo al conectar ese proveedor.
 */
export const MODELS: Record<ProviderKind, ModelOption[]> = {
  anthropic: [
    { id: 'claude-opus-5', name: 'Opus 5' },
    { id: 'claude-fable-5', name: 'Fable 5' },
    { id: 'claude-sonnet-5', name: 'Sonnet 5' },
    { id: 'claude-haiku-4-5', name: 'Haiku 4.5' }
  ],
  // GPT-5.6, julio de 2026: tres niveles. `gpt-5.6` a secas es un alias de sol.
  openai: [
    { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
    { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' },
    { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }
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
  /** TODOS los modelos de TODOS los proveedores conectados, no solo los del activo. */
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

// ---- Historial de conversaciones ----
/** Ficha de una conversación guardada (sin los mensajes). */
export interface ChatSessionMeta {
  id: string
  title: string
  updatedAt: number
  count: number
  /** Archivada: no sale en el desplegable del panel y el techo de 200 no se la lleva. */
  archived?: boolean
}

/** Resultado de buscar en el historial: la metadata más el fragmento que coincidió. */
export interface ChatSessionBusqueda extends ChatSessionMeta {
  snippet?: string
}

/**
 * Un mensaje tal y como se guarda en disco. NO es el `Msg` del panel: aquí las imágenes se
 * sustituyen por una marca (`attachments` es un número, `hadImage` un booleano), porque los
 * data URLs de adjuntos y screenshots convertirían el fichero en megas y se lee entero en
 * cada arranque.
 */
export interface StoredChatMsg {
  role: 'user' | 'assistant'
  text?: string
  /** Cuántas imágenes llevaba (no las imágenes). */
  attachments?: number
  parts?: StoredPart[]
  at?: number
}

export type StoredPart =
  | { type: 'text'; text: string; error?: boolean }
  | { type: 'step'; step: Omit<ChatStep, 'image'>; hadImage?: boolean }

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
export interface AdblockInfo {
  enabled: boolean
  /** Dominios donde el usuario desactivó el bloqueo. */
  allow: string[]
  /** false mientras las listas de filtros aún no están cargadas. */
  ready: boolean
}

export interface Suggestion {
  kind: 'history' | 'bookmark' | 'search' | 'url'
  /** Texto principal a mostrar */
  title: string
  /** URL a la que navegar al elegir (para search: la búsqueda de Google) */
  url: string
  /** Subtexto (dominio, "Buscar en Google", etc.) */
  detail?: string
  favicon?: string | null
  /** El icono es la foto de una entidad (persona, equipo, película): se pinta en círculo. */
  round?: boolean
}

export interface BrowserState {
  activeId: number | null
  tabs: TabInfo[]
  active: ActiveInfo | null
  /** El agente está operando la pestaña activa ahora mismo (muestra la leyenda de control). */
  controlling: boolean
  /** Ventana de incógnito: el chrome se pinta distinto para que no haya duda de dónde estás. */
  incognito: boolean
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
  /**
   * Identidad visual de la skill. Las dos salen del frontmatter del SKILL.md y son
   * excluyentes: una skill de SERVICIO se reconoce por su marca, una de CAPACIDAD por un
   * glifo. `host` gana si vienen las dos.
   */
  /** Dominio del servicio (`notion.so`). El favicon se pide AL PROPIO SITIO, nunca a un tercero. */
  host: string | null
  /** Nombre de un glifo de tabler, de la lista curada del renderer (`file-type-pdf`). */
  icon: string | null
  /** El favicon ya resuelto, si estaba en caché. Se rellena en el main. */
  favicon: string | null
  /**
   * Capacidad que la skill NECESITA y que el navegador no tiene por sí mismo (`code`).
   * La aporta un servidor MCP externo. Sin ella la skill no se le pasa al agente: sus
   * instrucciones dicen cosas como `python scripts/…` y seguirlas sería imposible.
   */
  requires: string | null
  /** false si `requires` no está cubierto ahora mismo. Lo calcula el main. */
  available: boolean
}
export interface SkillDetail extends SkillMeta {
  /** Cuerpo Markdown del SKILL.md (instrucciones para el agente) */
  body: string
}

/** Una entrada del historial tal y como la ve la página. */
/** Un nodo del árbol de memoria, tal y como lo pinta Settings. */
export interface NodoMemoriaInfo {
  path: string
  nombre: string
  tipo: 'fichero' | 'carpeta'
  bytes: number
  at: number
  hijos?: NodoMemoriaInfo[]
}

/** Un widget del new tab, listo para pintar. Ver src/main/widgets.ts. */
export interface WidgetInfo {
  id: string
  peticion?: string
  url: string
  title: string
  favicon: string | null
  datos:
    | { tipo: 'metrica'; valor: string; etiqueta?: string; delta?: { texto: string; signo: 'sube' | 'baja' | 'neutro' }; serie?: number[]; forma?: 'linea' | 'barras' }
    | { tipo: 'progreso'; porcentaje: number; valor?: string; etiqueta?: string }
    | { tipo: 'lista'; items: { texto: string; meta?: string; url?: string }[] }
    | null
  updatedAt: number
  changed: boolean
  fallos: number
  creando?: boolean
  error?: string
}

export interface HistoryEntryInfo {
  url: string
  title: string
  favicon?: string | null
  visits: number
  lastVisit: number
}

/** Un servidor MCP configurado por el usuario, tal y como lo ve Settings. */
export interface McpServerInfo {
  name: string
  enabled: boolean
  running: boolean
  tools: number
  error: string | null
}

// ---- Permisos del sitio (cámara, micrófono, etc.) ----
export type PermKey = 'camera' | 'microphone' | 'geolocation' | 'notifications' | 'clipboard'
export type PermState = 'granted' | 'denied' | 'ask'
export interface SitePermission { key: PermKey; state: PermState }
/** Un origen con las decisiones de permisos que el usuario ya tomó sobre él. */
export interface PermSite { origin: string; perms: SitePermission[]; favicon: string | null }
export interface SiteInfoData {
  url: string
  origin: string
  domain: string
  secure: boolean
  internal: boolean
  permissions: SitePermission[]
  /** ¿Se está bloqueando en ESTE sitio? (false si el usuario lo excluyó o si está apagado) */
  adblockOn: boolean
  /** Cuántas peticiones se han bloqueado en esta página desde que cargó. */
  adblockBlocked: number
}
// ---- Submenús del menú de perfil ----
export type SubmenuSection = 'bookmarks' | 'downloads' | 'extensions' | 'history' | 'developers'

/**
 * Una fila del submenú, ya masticada por el main: el renderer no sabe de dónde salen los
 * datos, solo los pinta. `action` es lo que se manda de vuelta al clicar.
 */
export interface SubmenuRow {
  id: string
  label: string
  /** Segunda línea (estado de la descarga, dominio…). */
  sub?: string
  /** Icono por nombre; el renderer los mapea a tabler. */
  icon?: 'download' | 'file' | 'puzzle' | 'bookmark' | 'history' | 'code' | 'gauge' | 'list'
  /** Favicon o icono de la extensión, si lo hay. */
  image?: string | null
  /** Atajo o texto a la derecha. */
  meta?: string
  action: string
  /** Fila de cabecera del submenú (separada del resto). */
  primary?: boolean
  /** La fila es un interruptor; `on` es su estado. Al pulsarla el menú NO se cierra. */
  toggle?: boolean
  on?: boolean
}

export interface SubmenuData {
  section: SubmenuSection
  /** Título de la lista de abajo ("Installed extensions"), si la hay. */
  listLabel?: string
  rows: SubmenuRow[]
}

/** API expuesta a la ventana nativa de un submenú */
export interface SubmenuWinApi {
  onData: (cb: (d: SubmenuData) => void) => void
  reportHeight: (h: number) => void
  action: (action: string) => void
}

/** API expuesta a la ventana nativa del menú de perfil */
/** Lo que ve el menú de perfil: el perfil activo, ya renderizable, y la lista para elegir. */
export interface DatosMenuPerfil {
  perfil: Profile
  perfiles: { id: string; nombre: string; avatar: string | null; activo: boolean }[]
}

export interface ProfileMenuWinApi {
  onProfile: (cb: (d: DatosMenuPerfil) => void) => void
  /** Cambia el perfil activo. Reinicia la app: ver perfiles.ts. */
  cambiarPerfil: (id: string) => void
  /** Crea un perfil y se cambia a él. */
  crearPerfil: (nombre: string) => void
  /** Lo quita de la lista tras confirmar. Sus datos siguen en disco. */
  borrarPerfil: (id: string) => void
  reportHeight: (h: number) => void
  action: (name: string) => void
  /** Abre (o cambia) el submenú de una sección, anclado a la fila. */
  submenu: (section: SubmenuSection, rect: { top: number; height: number }) => void
  /** El puntero salió de las filas con submenú: cerrarlo si no se entró en él. */
  submenuMaybeClose: () => void
  close: () => void
}

/** API expuesta a la ventana nativa de info del sitio */
/** Lo que el popover de permiso necesita saber para preguntar. */
export interface PermAskData {
  domain: string
  /** Qué se pide, ya redactado: "usar tu cámara", "saber tu ubicación". */
  label: string
  keys: PermKey[]
}

export interface PermAskWinApi {
  onData: (cb: (data: PermAskData) => void) => void
  reportHeight: (h: number) => void
  /** Responde y recuerda la decisión para este origen. */
  answer: (granted: boolean) => void
}

/** Lo que la pestaña manda a la ventana del PiP para arrancar la conexión. */
export interface PipOferta {
  /** Oferta SDP serializada. El vídeo NO pasa por el main: va directo por WebRTC. */
  sdp: string
  origen: string
  titulo: string
  pausado: boolean
}

export interface PipWinApi {
  onOferta: (cb: (d: PipOferta) => void) => void
  /** Respuesta SDP de vuelta a la pestaña. */
  responder: (sdp: string) => void
  comando: (cmd: 'play' | 'pause' | 'cerrar') => void
  /** Cierra el PiP y trae al frente la pestaña de la que salió. */
  volver: () => void
}

export interface SiteInfoWinApi {
  onData: (cb: (data: SiteInfoData) => void) => void
  reportHeight: (h: number) => void
  toggle: (key: PermKey, state: PermState) => void
  /** Activa/desactiva el bloqueo de anuncios en el sitio que se está viendo. */
  setAdblock: (on: boolean) => void
  clearData: () => void
  close: () => void
}

/**
 * Popover de descargas del topbar.
 *
 * Antes ese botón abría directamente la página de todas las descargas: para ver si el archivo
 * que acabas de bajar terminó, te cambiaba de página. Un popover contesta esa pregunta sin
 * moverte de sitio, y el enlace al listado completo sigue estando abajo.
 */
export interface DownloadsPopApi {
  onData: (cb: (list: DownloadEntry[]) => void) => void
  reportHeight: (h: number) => void
  /** Abre el archivo con la app del sistema. */
  open: (id: string) => void
  /** Lo enseña en el Finder. */
  reveal: (id: string) => void
  cancel: (id: string) => void
  clear: () => void
  /** Va a la página con el historial completo de descargas. */
  seeAll: () => void
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
  /** Saca la pestaña a una ventana nueva, conservando su historial (arrastrarla fuera). */
  tearOffTab: (id: number) => void
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
  /**
   * El main pide permiso para un sitio: el chrome responde con `permAnchor` diciendo dónde
   * está el pill del dominio, porque esa posición solo la sabe el DOM del chrome.
   */
  onPermAsk: (cb: () => void) => () => void
  permAnchor: (anchor: MenuAnchor) => void
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
  /** Nuevo orden de los marcadores, por id (arrastre en el sidebar). */
  reorderBookmarks: (ids: string[]) => void
  newBookmarkFolder: (title: string) => Promise<Bookmark>
  /** Solo el título: cambiar la URL sigue siendo cosa de las páginas internas. */
  renameBookmark: (id: string, title: string) => void
  /** Mueve un marcador a una carpeta, o a la raíz con `null`. */
  moveBookmark: (id: string, parentId: string | null) => void
  collapseBookmarkFolder: (id: string, collapsed: boolean) => void
  /** Deja de ser marcador y se queda como pestaña (arrastrarlo a Tabs). */
  detachBookmark: (id: string) => void
  /** Abre el menú contextual nativo de una pestaña */
  tabContextMenu: (id: number) => void
  /** Abre el menú contextual nativo de un bookmark */
  bookmarkContextMenu: (id: string) => void
  /** Silencia/reactiva el audio de una pestaña (o la activa si no se da id) */
  toggleMute: (id?: number) => void
  openDevtools: () => void
  openDownloads: () => void
  /** Popover del botón del topbar; `openDownloads` sigue abriendo la página completa. */
  openDownloadsPopover: (anchor: MenuAnchor) => void
  /** Resumen de descargas (para el icono del topbar) */
  onDownloadsSummary: (cb: (s: DownloadsSummary) => void) => () => void
  getDownloadsSummary: () => Promise<DownloadsSummary>
  /** `section` salta directo a esa sección: un error del proveedor lleva a AI, no al índice. */
  openSettings: (section?: string) => void
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
  onChatError: (cb: (fallo: ChatFallo) => void) => () => void
  /** El main pide abrir el chat y enviar un prompt (p. ej. desde una acción rápida). */
  onChatPrefill: (cb: (prompt: string) => void) => () => void
  // ---- Historial de conversaciones ----
  chatsList: () => Promise<ChatSessionMeta[]>
  /** Settings pidió retomar una conversación: el panel tiene que cargarla. */
  onOpenSession: (cb: (id: string) => void) => () => void
  /** La conversación que toca al abrir el panel (retoma la última reciente, o crea una). */
  chatsResume: () => Promise<{ id: string; messages: StoredChatMsg[] }>
  chatsNew: () => Promise<{ id: string; messages: StoredChatMsg[] }>
  chatsOpen: (id: string) => Promise<{ id: string; messages: StoredChatMsg[] } | null>
  /** Antes de enviar: puede devolver otra id si la actual expiró por inactividad. */
  chatsForNext: (id: string) => Promise<{ id: string; fresh: boolean }>
  /** Persiste la conversación completa (el panel es la fuente de verdad en vivo). */
  chatsSave: (id: string, messages: unknown[]) => void
  chatsRemove: (id: string) => void
  // ---- Vault (ventana nativa flotante) ----
  openVault: (anchor: MenuAnchor) => void
  /** Abre el gestor de extensiones (ventana nativa), anclado a su botón del topbar */
  openExtensions: (anchor: MenuAnchor) => void
  // ---- Anchos de paneles (resize) ----
  getPanels: () => Promise<PanelSizes>
  setPanel: (which: 'sidebar' | 'chat', width: number) => void
  // ---- Actualizaciones ----
  getUpdateState: () => Promise<UpdateState>
  // ---- Control remoto (ver src/main/remote.ts) ----
  getRemoteState: () => Promise<{ enabled: boolean; port: number }>
  onRemoteState: (cb: (s: { enabled: boolean; port: number }) => void) => () => void
  setRemote: (on: boolean) => void
  onUpdateState: (cb: (s: UpdateState) => void) => () => void
  downloadUpdate: () => void
  installUpdate: () => void
  // ---- Menú nativo → acciones de estado del renderer ----
  /**
   * Cada frame de la animación de layout, con el rect que el main acaba de aplicar a la
   * vista nativa. El chrome copia esa posición en vez de animar por su cuenta: con dos
   * relojes independientes siempre se veían desfasados.
   */
  onLayoutFrame: (cb: (r: { left: number; right: number }) => void) => () => void
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
  /** El main avisa antes de esconder la ventana, para poder animar la salida. */
  onClosing: (cb: () => void) => () => void
  /** Se dispara cada vez que el peek se muestra (para la animación de entrada). */
  onShown: (cb: () => void) => () => void
  hide: () => void
}

/** Condición que dispara la notificación de una rutina. */
export interface RoutineCondition {
  op: 'changed' | 'lt' | 'gt' | 'contains' | 'notContains'
  value?: string
}

/** Rutina: vigila una página cada X minutos y avisa cuando se cumple la condición. */
export interface Routine {
  id: string
  name: string
  enabled: boolean
  url: string
  /** lo que pidió el usuario en lenguaje natural (se reusa al reparar el extractor) */
  request: string
  intervalMinutes: number
  /**
   * Snippet del REPL generado UNA vez por el modelo (con `page` de monperwright).
   * Puede esperar contenido diferido o leer la API interna del sitio, no solo el DOM.
   */
  extractor: string
  condition: RoutineCondition
  lastRun: number
  lastValue: string | null
  lastError: string | null
  failures: number
}

/** Estado de las actualizaciones automáticas. */
export interface UpdateState {
  checking: boolean
  /** hay versión nueva, aún sin descargar */
  available: boolean
  /** descargando ahora mismo */
  downloading: boolean
  /** 0–100 mientras descarga */
  percent: number
  /** ya descargada: se puede instalar reiniciando */
  downloaded: boolean
  version: string | null
  error: string | null
}

/** Estado "sin novedades", para inicializar en el main y en los renderers sin duplicar. */
/**
 * Páginas propias de Monper (no son sitios web). El main las sirve como `file://` en
 * producción y como `http://localhost:PORT` en desarrollo, así que se reconocen por el
 * nombre del fichero y no por el origen.
 *
 * Vive en shared porque main y renderer TIENEN que estar de acuerdo: el main decide quién
 * puede tocar datos privados por IPC y el renderer decide cuándo mostrar nuestra marca en
 * vez de un dominio. Dos listas separadas se habrían desincronizado.
 */
export const INTERNAL_PAGES = ['newtab', 'settings', 'error', 'downloads', 'history', 'bookmarks'] as const
export type InternalPage = (typeof INTERNAL_PAGES)[number]

/** El nombre de la página interna de esa URL, o null si es un sitio web de verdad. */
export function internalPageOf(url: string): InternalPage | null {
  return INTERNAL_PAGES.find((p) => url.includes(`/${p}.html`)) ?? null
}

export const NO_UPDATE: UpdateState = {
  checking: false, available: false, downloading: false, percent: 0,
  downloaded: false, version: null, error: null
}

/** Ajustes de apariencia: nivel de transparencia del chrome. */
export interface AppearanceData {
  vibrancy: string
  options: { id: string; label: string; desc: string }[]
}

/** Anchos de los paneles laterales (redimensionables por el usuario). */
export interface PanelSizes {
  sidebar: number
  chat: number
  limits: { sidebarMin: number; sidebarMax: number; chatMin: number; chatMax: number }
}

/** Extensión de Chrome instalada (desempaquetada). */
export interface ExtensionInfo {
  /** ruta en disco: es la identidad estable (el id solo existe si está cargada) */
  path: string
  id: string
  name: string
  version: string
  description: string
  /** icono del manifest como data URL */
  icon: string | null
  enabled: boolean
  /** la carpeta ya no existe en disco */
  missing: boolean
}

/** Estado que la ventana de extensiones recibe del main. */
export interface ExtensionsData {
  items: ExtensionInfo[]
  /** Si la pestaña activa es una página de extensión de la Chrome Web Store */
  storeCandidate: { id: string; installed: boolean } | null
  /** Instalación en curso (para el spinner) */
  installing: boolean
}

/** API expuesta a la ventana nativa de extensiones */
export interface ExtensionsWinApi {
  onData: (cb: (d: ExtensionsData) => void) => () => void
  reportHeight: (h: number) => void
  toggle: (path: string, enabled: boolean) => void
  remove: (path: string) => void
  /** Abre la Chrome Web Store en una pestaña nueva */
  browseStore: () => void
  /** Instala la extensión de la página actual de la Store */
  installFromStore: () => void
  /** Instalar desde una carpeta local (avanzado) */
  installFromFolder: () => void
  /** Abre el popup propio de la extensión */
  openPopup: (path: string) => void
  /** Menú "…" con las opciones de esa extensión */
  menu: (path: string) => void
  close: () => void
}

/** Credencial ofrecida en el quick sign-in (metadata, NUNCA el secreto). */
export interface SigninCredential {
  id: string
  label: string
  username: string
  origin: string
  /** Favicon real del sitio (el que recuerda el main); null si no se ha visitado. */
  favicon?: string | null
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
  /**
   * Los favicons viajan CON los items, no por un canal aparte.
   *
   * La ventana del vault no es una "página interna" (`INTERNAL_PAGES`), así que un
   * `vault:favicons` suyo lo rechazaría `isInternalSender` y devolvería `{}` — que es
   * exactamente por qué no salía ningún icono. Mandarlos empujados evita la pregunta.
   */
  onItems: (cb: (items: VaultItemMeta[], favicons: Record<string, string>) => void) => void
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
  // ---- Apariencia (Settings) ----
  getAppearance: () => Promise<AppearanceData>
  setVibrancy: (id: string) => void
  // ---- Permisos de sitios (Settings → Permissions) ----
  /**
   * `resolve: true` va a buscar al propio sitio los favicons que falten antes de contestar
   * (hasta unos segundos). La primera llamada debe hacerse sin él para pintar ya.
   */
  listSitePermissions: (resolve?: boolean) => Promise<PermSite[]>
  setSitePermission: (origin: string, key: PermKey, state: PermState) => Promise<boolean>
  /** `null` borra las decisiones de TODOS los sitios. */
  clearSitePermissions: (origin: string | null) => Promise<boolean>
  // ---- Actualizaciones (Settings → About) ----
  getUpdateState: () => Promise<UpdateState>
  /** Renombrar o corregir la URL de un marcador. Devuelve null si la URL no es válida. */
  updateBookmark: (id: string, cambios: { title?: string; url?: string }) => Promise<Bookmark | null>
  newBookmarkFolder: (title: string) => Promise<Bookmark>
  moveBookmark: (id: string, parentId: string | null) => void
  // ---- Historial ----
  browseHistory: (query: string, offset: number, limit: number) => Promise<{ entries: HistoryEntryInfo[]; total: number }>
  // ---- Widgets del new tab ----
  widgetsList: () => Promise<WidgetInfo[]>
  widgetsRefresh: () => void
  widgetsRemove: (id: string) => void
  widgetsSeen: (id: string) => void
  widgetsCreate: (url: string, title: string, favicon: string | null) => void
  widgetsRetry: (id: string) => void
  /** Pide un widget en lenguaje natural: el agente elige la fuente y escribe el extractor. */
  widgetsAsk: (peticion: string) => void
  onWidgets: (cb: (lista: WidgetInfo[]) => void) => () => void
  // ---- Memoria del agente (ficheros markdown que escribe él) ----
  memoryList: () => Promise<NodoMemoriaInfo[]>
  memoryRead: (path: string) => Promise<string | null>
  memoryWrite: (path: string, contenido: string) => Promise<boolean>
  memoryDelete: (path: string) => Promise<boolean>
  memoryEnabled: (on?: boolean) => Promise<boolean>
  memoryOpenFolder: () => void
  removeHistoryEntry: (url: string) => Promise<boolean>
  clearHistory: (desde?: number) => Promise<number>
  // ---- Importar de otro navegador ----
  listImportBrowsers: () => Promise<{ id: string; nombre: string; disponible: boolean }[]>
  runImport: (id: string, que: { bookmarks: boolean; history: boolean; passwords: boolean })
    => Promise<{ ok: boolean; bookmarks: number; history: number; passwords: number; error?: string }>
  // ---- Navegador predeterminado ----
  /** `shouldOffer` ya tiene en cuenta si se descartó hace poco y si estamos en desarrollo. */
  getDefaultBrowser: () => Promise<{ isDefault: boolean; shouldOffer: boolean }>
  makeDefaultBrowser: () => Promise<{ ok: boolean; error?: string }>
  dismissDefaultBrowser: () => void
  // ---- Puente MCP (Settings → MCPs). Canal aparte del que usa el chrome: ver mcp:state ----
  getMcpState: () => Promise<{ enabled: boolean; port: number }>
  setMcpEnabled: (on: boolean) => Promise<boolean>
  // ---- Adblocker (Settings → Privacidad) ----
  getAdblockState: () => Promise<AdblockInfo>
  setAdblockEnabled: (on: boolean) => Promise<boolean>
  /** Activa/desactiva el bloqueo en un dominio concreto. */
  setAdblockAllowed: (hostname: string, permitir: boolean) => Promise<boolean>
  // ---- Picture-in-Picture (Settings → General) ----
  getPipState: () => Promise<{ enabled: boolean }>
  setPipEnabled: (on: boolean) => Promise<boolean>
  onUpdateState: (cb: (s: UpdateState) => void) => () => void
  checkUpdates: () => void
  downloadUpdate: () => void
  installUpdate: () => void
  getVersion: () => Promise<string>
  // ---- Rutinas (Settings) ----
  listRoutines: () => Promise<Routine[]>
  onRoutines: (cb: (list: Routine[]) => void) => () => void
  createRoutine: (input: { url: string; request: string; minutes: number }) => Promise<{ ok: boolean; error?: string }>
  toggleRoutine: (id: string, enabled: boolean) => void
  removeRoutine: (id: string) => void
  runRoutine: (id: string) => void
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
  /** Relee el catálogo de modelos del proveedor activo (se lo pregunta a su API). */
  refreshModels: () => Promise<ModelOption[]>
  // ---- Vault (gestión desde Settings) ----
  vaultList: () => Promise<VaultItemMeta[]>
  vaultAdd: (type: VaultItemType, label: string, data: Record<string, string>, secret: string) => Promise<VaultItemMeta[]>
  vaultRemove: (id: string) => Promise<VaultItemMeta[]>
  vaultUpdate: (id: string, patch: { label?: string; data?: Record<string, string>; secret?: string }) => Promise<VaultItemMeta[]>
  /** `false` = el keychain no está disponible: no se puede guardar nada cifrado. */
  vaultAvailable: () => Promise<boolean>
  /**
   * Copia el secreto al portapapeles. Devuelve si salió bien, NUNCA el valor: el secreto no
   * cruza el IPC (ver docs/vault-architecture.md). Por eso no hay "ver contraseña".
   */
  vaultCopy: (id: string) => Promise<boolean>
  /**
   * El secreto en claro, para enseñarlo. Única excepción a "el secreto no cruza el IPC", y
   * deliberada: sin esto no es un gestor de contraseñas. Se pide de una en una, nunca en lote.
   */
  vaultReveal: (id: string) => Promise<string | null>
  /** Iconos de las credenciales web, por origen. Solo los ya conocidos; nunca a un tercero. */
  vaultFavicons: () => Promise<Record<string, string>>
  // ---- Historial de chats (Settings → Archived chats) ----
  /** Busca en el CONTENIDO, no solo en el título. `snippet` dice por qué salió ese resultado. */
  chatsSearch: (q: string, incluirArchivadas: boolean) => Promise<ChatSessionBusqueda[]>
  chatsArchive: (id: string, archived: boolean) => Promise<ChatSessionBusqueda[]>
  chatsRename: (id: string, title: string) => Promise<ChatSessionBusqueda[]>
  chatsDelete: (id: string) => Promise<ChatSessionBusqueda[]>
  /** Abre el panel del chat con esa conversación. La desarchiva: retomarla es usarla. */
  chatsResume: (id: string) => void
  // ---- Consumo del agente (Settings → Billing / Statistics) ----
  usageSummary: (dias?: number) => Promise<ResumenUso | null>
  usageClear: () => Promise<ResumenUso | null>
  /** Sin argumento lee el techo diario en $; con número lo fija. 0 = sin techo. */
  usageLimit: (valor?: number) => Promise<number>
  onUsageChanged: (cb: (r: ResumenUso) => void) => () => void
  onVaultChanged: (cb: (items: VaultItemMeta[]) => void) => () => void
  // ---- Autocompletado del omnibox / new tab ----
  suggest: (query: string) => Promise<Suggestion[]>
  // ---- Acciones del new tab ----
  openSettings: () => void
  openChat: () => void
  // ---- Skills del agente (gestión desde Settings) ----
  // ---- Servidores MCP externos (Settings → MCPs) ----
  listMcpServers: () => Promise<McpServerInfo[]>
  reloadMcpServers: () => Promise<McpServerInfo[]>
  /** Arranca los servidores y devuelve su estado: el botón "Probar". */
  probeMcpServers: () => Promise<McpServerInfo[]>
  openMcpConfig: () => void
  /** `resolve: true` busca los favicons que falten antes de contestar (puede tardar). */
  skillsList: (resolve?: boolean) => Promise<SkillMeta[]>
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
    pipwin: PipWinApi
    permask: PermAskWinApi
    profilemenu: ProfileMenuWinApi
    profilesubmenu: SubmenuWinApi
    peekbar: PeekWinApi
    signin: SigninWinApi
    extensionswin: ExtensionsWinApi
    downloadspop: DownloadsPopApi
  }
}
