import { t as tr } from '../shared/i18n'
import { initLanguage } from './language'
import { join } from 'path'
import { readFileSync } from 'fs'
import { app, BrowserWindow, Menu, Notification, WebContentsView, clipboard, dialog, ipcMain, nativeImage, net, screen, session, shell, type WebContents } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import type { IpcMainEvent } from 'electron'
import type { BrowserState, Bookmark, ChatFallo, ChatMessage, MenuAnchor, ProviderKind, InternalPage, SubmenuData, SubmenuSection } from '../shared/types'
import { internalPageOf, type DatosMenuPerfil } from '../shared/types'
import { nombreDeUrl } from '../shared/url'
import { initBookmarks, listBookmarks, isBookmarked, addBookmark, removeBookmark, toggleBookmark, reorderBookmarks, updateBookmark, createFolder, moveBookmark, setFolderCollapsed } from './bookmarks'
import { initAI, listProviders, addProvider, removeProvider, setActive as setActiveProvider, setModel, setEffort, getChatContext, refrescarModelos, providerSettings, saveProvider, providerConfigPath } from './ai/store'
import type { ProviderInput } from '../shared/types'
import { discoverProvider, prepareActiveProvider } from './ai/store'
import { runMastra, diagnosticar } from './agent/mastra'
import { initUsage, anotarTurno, resumen as resumenUso, gastoDeHoy, borrarUso, limiteDiario, setLimiteDiario } from './usage'
import { initHistory, recordVisit, updateMeta, recent as historyRecent, browse as historyBrowse, removeEntry as historyRemove, clearHistory as historyClear } from './history'
import { initWindowState, initialBounds, shouldMaximize, trackWindow } from './windowState'
import { suggest } from './suggest'
import { attachScreenShare } from './screenshare'
import { esWeb, abrirConElSistema } from './schemes'
import { itemsDeCorrector, itemsDeVideo, type VideoEnPagina } from './contextmenu'
import { navegadoresDisponibles, leerMarcadores, leerHistorial, leerCredenciales, type NavegadorId } from './import/browsers'
import {
  reservarInstanciaUnica, escucharEnlaces, initDefaultBrowser,
  esPredeterminado, hacerPredeterminado, debeOfrecerse, descartarOferta
} from './defaultbrowser'
import {
  initPermissions, attachPermissionHandlers, stateOf, setState, requestedKeys,
  allSites, clearOrigin, clearAllOrigins
} from './permissions'
import { initSkills, listSkills, getSkill, saveSkill, skillFolder, toggleSkill, enabledSkills, skillsDir, resolveSkillFavicons } from './skills'
import { initProfile, getProfile, setProfile, setAvatar } from './profile'
import { PARTICION_NORMAL, particionDe } from './particiones'
import { initMemoria, listarMemoria, leerMemoria, escribirMemoria, borrarMemoria, memoriaHabilitada, setMemoriaHabilitada, contextoDeMemoria, dirMemoria } from './memoria'
import { rutaDePerfil, particionDelPerfil, listaPerfiles, perfilActivoId, crearPerfil, activarPerfil, borrarPerfil } from './perfiles'
import { initDownloads, attachDownloads, listDownloads, activeDownloadCount, cancelDownload, openDownload, showDownload, clearDownloads } from './downloads'
import { credentialsFor, fillFromVault } from './autofill'
import { initExtensions, listExtensions, addExtension, setExtensionEnabled, removeExtension as removeExt, installFromStore, extensionUi } from './extensions'
import { extensionIdFrom } from './crx'
import { createPopover } from './popover'
import { initRemote, remoteState, setRemoteEnabled, onRemoteState } from './remote'
import { initAdblock, adjuntarAdblock, adblockState, setAdblockEnabled, setAdblockAllowed, adblockCountFor } from './adblock'
import { attachChromeHints } from './chromehints'
import { initPip, attachPip, pipState, setPipEnabled } from './pip'
import { initFavicons, rememberFavicon, faviconFor, resolveFavicon, cacheVisitedFavicon } from './favicons'
import { initMcpClient, reloadMcpConfig, mcpServerStates, mcpTools, configPath as mcpConfigPath, stopAllMcp } from './mcp/client'
import { initChats, listSessions, searchSessions, archiveSession, renameSession, resumeOrNew, startSession, openSession, sessionForNextMessage, saveSession, removeSession as removeChatSession } from './chats'
import { writeJson } from './jsonfile'
import { initRoutines, listRoutines, createWatchRoutine, setRoutineEnabled, removeRoutine as removeRoutineEntry, runRoutine } from './routines'
import { initUpdater, checkForUpdates, downloadUpdate, installUpdate, getUpdateState, onUpdateState } from './updater'
import { initQuickActions, listQuickActions, saveQuickAction, removeQuickAction, getQuickAction, fillTemplate } from './quickactions'
import * as vault from './vault/store'
import type { VaultItemType } from '../shared/vault'
import type { SiteInfoData, PermKey, PermState, PermAskData } from '../shared/types'
import appIcon from '../renderer/src/assets/icon.png?asset'

// Anchos redimensionables por el usuario (el renderer los aplica a --spacing-sidebar/panel).
const SIDEBAR_DEFAULT = 300
const CHAT_DEFAULT = 380
const PANEL_LIMITS = { sidebarMin: 180, sidebarMax: 420, chatMin: 300, chatMax: 640 }
let sidebarWidth = SIDEBAR_DEFAULT
let chatWidth = CHAT_DEFAULT
/** Va en pareja con `--spacing-topbar` en styles.css; hay un test que comprueba que coinciden. */
const TOPBAR_HEIGHT = 44
/** Redondeo del page view. Debe coincidir con rounded-t[l/r] en Content.tsx. */
const CONTENT_RADIUS = 14
/**
 * "Sin redondeo" es 1, no 0. Un píxel no se ve; el 0 sí se notaba, y mucho.
 *
 * `setBorderRadius(0)` **no quita la máscara anterior**: la deja instalada, con el tamaño que
 * tenía. Por eso el hueco a la derecha al cerrar el chat aparecía SOLO con los dos sidebars
 * colapsados —el único caso en que el radio objetivo es 0— y por eso su ancho coincidía
 * clavado con el de la última máscara de radio 14 (medido: máscara sellada a w=1261 y la
 * página cortada justo ahí).
 *
 * Descartado antes de llegar aquí, todo medido: el rect calculado, los bounds reales de la
 * vista y el `innerWidth` de la página eran correctos; reinstalar la máscara al asentarse el
 * tamaño se dispara y llega al ancho bueno (se ve en el log como `[resellado]`) y aun así el
 * hueco seguía; y `MONPER_NO_RADIUS=1` —que no llama nunca a `setBorderRadius`— lo hacía
 * desaparecer. Con radio > 0 la máscara sí se reinstala al tamaño nuevo.
 *
 * No hay API para desinstalarla, así que la salida es no pedir nunca 0.
 */
const SIN_REDONDEO = 1
/**
 * Materiales de vibrancy, ordenados de MÁS a MENOS transparente. Definen cuán translúcido
 * se ve TODO el chrome (sidebar, panel de chat), porque esas zonas son HTML sin fondo.
 * ⌘⌥V cicla entre ellos en vivo y la elección se persiste en panels.json.
 * MONPER_NO_VIBRANCY=1 la desactiva (solo para depurar composición).
 */
const VIBRANCY_MATERIALS = ['hud', 'popover', 'menu', 'fullscreen-ui', 'sidebar', 'header', 'window', 'content', 'under-window'] as const
type VibrancyMaterial = (typeof VIBRANCY_MATERIALS)[number]
const VIBRANCY_DEFAULT: VibrancyMaterial = 'hud'
/** 'none' = ventana opaca (sin vibrancy). Es un valor de ajuste, no un material de macOS. */
type VibrancySetting = VibrancyMaterial | 'none'
let vibrancyMaterial: VibrancySetting = VIBRANCY_DEFAULT
let appearanceTint: string | null = null
const NO_VIBRANCY = process.env['MONPER_NO_VIBRANCY'] === '1'
const APP_BG = '#111114' // igual que --color-bg en styles.css
const isMac = process.platform === 'darwin'

// Nombre usado por Electron en los menús; el bundle de macOS se nombra al empaquetar.
app.setName('Titanio Browser')
// Conserva los perfiles existentes y la ruta que usa el puente MCP tras el cambio de nombre.
app.setPath('userData', join(app.getPath('appData'), 'Titanio'))

// FedCM (el "Continuar con Google" moderno) necesita UI a nivel navegador que Electron
// NO implementa: sin esto el click no hace absolutamente nada. Al desactivarlo, Google
// Identity Services cae al flujo clásico de popup, que sí manejamos.
app.commandLine.appendSwitch('disable-features', 'FedCm,FedCmWithoutWellKnownEnforcement')

// Páginas internas servidas por nuestro propio renderer (new-tab, settings…).
const RENDERER_URL_EARLY = process.env['ELECTRON_RENDERER_URL']
function internalUrl(page: InternalPage): string {
  return RENDERER_URL_EARLY
    ? `${RENDERER_URL_EARLY}/${page}.html`
    : `file://${join(__dirname, `../renderer/${page}.html`)}`
}
function newtabUrl(): string {
  return internalUrl('newtab')
}
function isErrorPage(url: string): boolean {
  return url.includes('/error.html')
}

// Proveedores de identidad dedicados: cualquier URL suya abierta con window.open es un login.
const IDP_HOSTS = /^(accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|login\.live\.com|auth\.openai\.com|[\w-]+\.auth0\.com|[\w-]+\.okta\.com)$/i
/** ¿La URL parece un flujo de autenticación (OAuth/SSO)? Debe abrirse como popup real. */
function isAuthUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (IDP_HOSTS.test(u.hostname)) return true
    // Para hosts de uso general exigimos que la RUTA sea de auth (github.com/login/oauth/…,
    // facebook.com/v18.0/dialog/oauth, x.com/i/oauth2/authorize…), y no cualquier /login.
    return /(^|\/)(oauth2?|authorize|sso|saml2?)(\/|$)/i.test(u.pathname)
  } catch { return false }
}
// Carga nuestra página de error interna en la pestaña, con el detalle del fallo.
function loadErrorPage(t: Tab, info: { url: string; code: number; desc: string; kind: string }): void {
  t.errorUrl = info.url
  const q = new URLSearchParams({ url: info.url, code: String(info.code), desc: info.desc || '', kind: info.kind })
  t.view.webContents.loadURL(`${internalUrl('error')}?${q.toString()}`)
}
function isNewtab(url: string): boolean {
  return url.includes('/newtab.html')
}
function isInternal(url: string): boolean {
  return internalPageOf(url) !== null
}
/** Sólo las páginas internas pueden leer/escribir datos privados vía IPC */
function isInternalSender(url: string | undefined): boolean {
  return !!url && isInternal(url)
}

interface Tab {
  pinnedTitanio?: boolean
  view: WebContentsView
  /** Último radio aplicado; ver applyRadius (reaplicarlo trae de vuelta las muescas). */
  radius: number | null
  /** Ancho de la vista cuando se instaló esa máscara. Si difiere del actual, recorta mal. */
  radiusW: number | null
  url: string
  title: string
  favicon: string | null
  loading: boolean
  canBack: boolean
  canForward: boolean
  themeColor: string | null
  /**
   * Color de la ESQUINA superior izquierda. Es lo que pinta la costura del redondeado y tiñe
   * el topbar, así que tiene que ser el píxel de esa esquina y no una media (ver sampleTopStrip).
   */
  pageBg: string | null
  /**
   * Color de fondo del DOCUMENTO (`body`/`html`). Distinto de `pageBg` a propósito: uno es la
   * esquina y el otro es el papel. En un sitio con cabecera oscura y cuerpo blanco —
   * mediotiempo.com, sin ir más lejos— la esquina es negra y el papel blanco, y usar la esquina
   * como fondo de la vista pintaba de negro todo lo que la página no llegara a cubrir.
   */
  docBg: string | null
  recording: boolean
  /** true si el usuario silenció el audio de la pestaña */
  muted: boolean
  /** true mientras la pestaña reproduce audio */
  audible: boolean
  /** Pestaña operada por el agente (aparece en "Agent tabs" y muestra la leyenda de control). */
  agent: boolean
  /** id del bookmark ligado a esta pestaña (se renderiza en su slot de bookmarks). */
  bookmarkId: string | null
  /** URL que se intentaba cargar cuando falló (mientras se muestra la página de error). */
  errorUrl: string | null
}

// Alto de la franja inferior reservada para la leyenda "Titanio is controlling this tab".
const CONTROLLED_STRIP = 40

/**
 * Todo lo que pertenece a UNA ventana: sus pestañas, su activa, su layout y su estado de
 * paneles. Antes eran variables de módulo, y por eso solo podía existir una ventana.
 *
 * Es una FACTORÍA y no una clase a propósito: las funciones de dentro pasan a ser cierres
 * sobre ese estado, así que las ~200 referencias a `win`, `tabs` y `activeId` **no cambian**.
 * Reescribirlas a mano en el área de layout y esquinas —que ya costó días y tres hipótesis
 * falsas— era pedir una regresión.
 *
 * Lo que NO entra aquí porque es global de verdad: marcadores, historial, vault, adblock,
 * proveedores de IA y los anchos de panel (son una preferencia, no un estado de ventana).
 */
export interface Ventana {
  readonly id: number
  readonly win: BrowserWindow
  /**
   * Ventana de incógnito. No es solo cosmético: manda en QUÉ sesión navegan sus pestañas y
   * apaga todo lo que escribe en disco (historial, favicons, restauración de sesión).
   */
  readonly incognito: boolean
  /** Partición de Chromium de sus pestañas. Se decide al crear la ventana y no cambia. */
  readonly particion: string
  readonly tabs: Map<number, Tab>
  activeId(): number | null
  createTab(url?: string, activate?: boolean, agent?: boolean): number
  setActive(id: number): void
  closeTab(id: number): void
  reopenClosedTab(): void
  selectTabByIndex(n: number): void
  reorderTabs(ids: number[]): void
  activeWc(): WebContents | undefined
  /** La pestaña activa, o undefined. Evita repetir el `activeId != null ? tabs.get(...)`. */
  tabActiva(): Tab | undefined
  layoutTabs(soloVisible?: boolean): void
  /** Un vídeo de la pestaña activa entra o sale de pantalla completa. */
  setHtmlFullscreen(on: boolean): void
  layoutActive(): void
  animateLayout(): void
  pushState(): void
  buildState(): BrowserState | null
  toggleDevtools(): void
  contentBounds(): { x: number; y: number; width: number; height: number }
  setCollapsed(v: boolean): void
  setChatOpen(v: boolean): void
  isCollapsed(): boolean
  scheduleTopSample(t: Tab): void
  /** Pone el foco de teclado en el input de New tab, si esa pestaña es la activa. */
  enfocarNewtab(id: number): void
  applyTopColor(t: Tab, c: string): void
  soltarTabsDelBookmark(id: string): void
  atarTabAlBookmark(t: Tab, bm: { id: string } | null): void
  /** Saca la pestaña de esta ventana SIN destruirla, para que otra la adopte. */
  desprenderTab(id: number): Tab | null
  /** Recibe una pestaña que venía de otra ventana, con su historial y su estado intactos. */
  adoptarTab(id: number, t: Tab): void
  /** Detiene el vigía de páginas colgadas. Al cerrar la ventana, o el timer sigue vivo. */
  pararVigia(): void
}


/**
 * Todas las ventanas abiertas, por `BrowserWindow.id`.
 *
 * `vAct()` devuelve la ENFOCADA, y es el último recurso: lo correcto en un handler IPC es
 * resolver de quién viene el mensaje con `vDe(ev)`, porque con dos ventanas abiertas "la
 * enfocada" puede no ser la que te escribió — colapsarías el sidebar de la otra.
 */
const RENDERER_URL = process.env['ELECTRON_RENDERER_URL']

const ventanas = new Map<number, Ventana>()
let ventanaEnfocadaId: number | null = null

function vAct(): Ventana {
  const v = (ventanaEnfocadaId != null ? ventanas.get(ventanaEnfocadaId) : null) ?? [...ventanas.values()][0]
  if (!v) throw new Error('no hay ninguna ventana')
  return v
}
/**
 * Crea una ventana y la registra. Puede llamarse varias veces: es ⌘N.
 *
 * El foco se sigue con `focus`/`closed` porque `` necesita saber cuál es la de delante,
 * y porque una ventana cerrada que siguiera en el registro dejaría `` devolviendo un
 * `BrowserWindow` destruido — que revienta al primer uso, no al cerrarla.
 */
function createWindow(opts: { sinPestanaInicial?: boolean; incognito?: boolean } = {}): Ventana {
  const v = crearVentana(opts)
  ventanas.set(v.id, v)
  ventanaEnfocadaId = v.id
  v.win.on('focus', () => { ventanaEnfocadaId = v.id })
  v.win.on('closed', () => {
    // Cerrar la ventana no destruye los WebContentsView de sus pestañas: hay que hacerlo a
    // mano o cada ⌘N + ⌘⇧W deja los procesos de renderer vivos.
    for (const t of v.tabs.values()) {
      if (!t.view.webContents.isDestroyed()) t.view.webContents.close()
    }
    v.pararVigia()
    v.tabs.clear()
    ventanas.delete(v.id)
    if (ventanaEnfocadaId === v.id) ventanaEnfocadaId = [...ventanas.keys()][0] ?? null
  })
  return v
}

/** La ventana viva, o null si todavía no hay ninguna (arranque, o todas cerradas). */
function vActOpt(): Ventana | null {
  return (ventanaEnfocadaId != null ? ventanas.get(ventanaEnfocadaId) : null) ?? [...ventanas.values()][0] ?? null
}
/** De qué ventana viene un mensaje IPC. Es lo que hay que usar en los handlers. */
function ventanaDe(wc: WebContents): Ventana | null {
  const w = BrowserWindow.fromWebContents(wc)
  if (w && ventanas.has(w.id)) return ventanas.get(w.id) ?? null
  // fromWebContents no resuelve siempre el WebContentsView de una pestaña: buscamos a mano.
  for (const v of ventanas.values()) {
    if (v.win.webContents === wc) return v
    for (const t of v.tabs.values()) if (t.view.webContents === wc) return v
  }
  return null
}
/**
 * La ventana desde la que llega un IPC. Es lo que deben usar los handlers: con dos ventanas
 * abiertas, `vAct()` operaría sobre la enfocada, que no tiene por qué ser la que envió.
 */
function vDe(ev: { sender?: WebContents } | null | undefined): Ventana {
  // `ev` puede venir sin sender: `ipcMain.emit` desde dentro del main no construye un evento.
  return (ev?.sender ? ventanaDe(ev.sender) : null) ?? vAct()
}
/**
 * El id de pestaña es único en TODA la app, no por ventana: si cada ventana empezara en 1,
 * dos pestañas de ventanas distintas compartirían id y cualquier búsqueda global sería ambigua.
 */
let nextId = 1
/** Los servicios de app (scheduler, updater) son uno solo, no uno por ventana. */
let serviciosIniciados = false
/**
 * Difunde a TODAS las ventanas. Es lo correcto para el estado que es de la app y no de una
 * ventana (marcadores, descargas, perfil, vault, actualizaciones): con dos abiertas, mandarlo
 * solo a la enfocada deja la otra con datos viejos y sin forma de enterarse.
 */
function paraTodas(canal: string, ...args: unknown[]): void {
  for (const v of ventanas.values()) {
    if (!v.win.isDestroyed()) v.win.webContents.send(canal, ...args)
  }
}
/**
 * Las ventanas nativas que se crean una sola vez (vault, peek, store) capturan su `parent` al
 * construirse. Con varias ventanas hay que re-parentarlas antes de mostrarlas o se quedan
 * flotando sobre la ventana equivocada.
 */
/** Como `paraTodas`, pero a las pestañas internas de todas las ventanas (settings, descargas). */
function paraPaginas(sufijoUrl: string, canal: string, ...args: unknown[]): void {
  for (const v of ventanas.values()) {
    for (const t of v.tabs.values()) {
      if (t.url.includes(sufijoUrl) && !t.view.webContents.isDestroyed()) t.view.webContents.send(canal, ...args)
    }
  }
}
function reparentar(w: BrowserWindow | null, v?: Ventana): void {
  if (!w || w.isDestroyed()) return
  const padre = (v ?? vActOpt())?.win ?? null
  if (padre && !padre.isDestroyed()) w.setParentWindow(padre)
}

/**
 * Muda una pestaña a una ventana nueva, con su historial y su estado intactos.
 *
 * Devuelve false si no tiene sentido: la pestaña no existe, es del agente (no sale en el
 * sidebar) o es la única de su ventana — sacarla dejaría la de origen creando una pestaña de
 * bienvenida, o sea el mismo contenido repartido en dos ventanas con una vacía de propina.
 */
function moverTabAVentanaNueva(origen: Ventana, id: number): boolean {
  const t = origen.tabs.get(id)
  if (!t || t.agent) return false
  if ([...origen.tabs.values()].filter((tb) => !tb.agent).length < 2) return false
  const destino = createWindow({ sinPestanaInicial: true })
  const suelta = origen.desprenderTab(id)
  if (!suelta) { destino.win.close(); return false }
  destino.adoptarTab(id, suelta)
  destino.win.focus()
  return true
}

/** Qué ventana tiene AHORA esta pestaña. Los ids de pestaña son únicos en toda la app. */
function duenoDeTab(id: number): Ventana | null {
  for (const v of ventanas.values()) if (v.tabs.has(id)) return v
  return null
}

/**
 * Deja una sesión de Chromium lista para navegar: identidad de Chrome, adblocker, permisos,
 * pantalla compartida y descargas.
 *
 * Existe porque incógnito NO es "la misma sesión sin escribir en disco": es OTRA sesión, y todo
 * lo que se enganchaba una vez al arrancar se quedaba fuera de ella. Sin esto, una ventana de
 * incógnito navegaría sin adblocker, diciendo ser Electron y con `getDisplayMedia` rechazado.
 *
 * Es idempotente y se llama al crear cada ventana: la primera de cada partición hace el trabajo.
 */
const sesionesListas = new Set<string>()
function prepararSesion(particion: string, incognito: boolean): void {
  if (sesionesListas.has(particion)) return
  sesionesListas.add(particion)
  const ses = session.fromPartition(particion)
  // UA de Chrome limpia (sin "Electron"/"titanio"): apps como Figma rompen y Google
  // bloquea el login si detectan un navegador embebido.
  const platformUA = isMac
    ? 'Macintosh; Intel Mac OS X 10_15_7'
    : process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64'
  ses.setUserAgent(`Mozilla/5.0 (${platformUA}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`)
  // La UA de texto no basta: Client Hints es una fuente aparte y delataba "Chromium".
  attachChromeHints(ses, process.versions.chrome)
  // Antes que nada lo que navegue: los listeners de red tienen que estar puestos antes de la
  // primera petición, o la primera página se pinta con anuncios. No se espera al motor (las
  // listas tardan): initAdblock engancha ya y rellena el motor cuando lo tiene.
  if (incognito) adjuntarAdblock(ses)
  else void initAdblock(ses)
  // Compartir pantalla en videollamadas. Sin este handler Electron rechaza `getDisplayMedia`
  // y el botón de compartir de Meet/Zoom no hace absolutamente nada.
  attachScreenShare(ses, () => vActOpt()?.win ?? null)
  attachPermissionHandlers(ses, {
    getWindow: () => vActOpt()?.win ?? null,
    ask: askPermission,
    onMedia: (wc, active) => {
      for (const tb of vAct().tabs.values()) {
        if (tb.view.webContents === wc) { tb.recording = active; vAct().pushState(); break }
      }
    }
  })
  attachDownloads(ses)
  ses.on('will-download', (_e, item) => {
    pushAgentEvent(`Descarga iniciada: ${item.getFilename()} (${item.getURL()})`)
  })
  /**
   * Las extensiones NO se cargan en incógnito, igual que Chrome de fábrica.
   *
   * No es pereza: una extensión ve cada página que abres y puede hablar con su servidor. Meter
   * las mismas extensiones en la ventana que se abre justamente para no dejar rastro sería
   * prometer una cosa y hacer la contraria.
   */
  if (!incognito) void initExtensions(ses)
}

function crearVentana(opts: { sinPestanaInicial?: boolean; incognito?: boolean } = {}): Ventana {
  const incognito = !!opts.incognito
  const particion = particionDe(incognito, particionDelPerfil())
  // La sesión tiene que estar preparada (UA de Chrome, adblock, permisos, descargas) ANTES de
  // que navegue nada: si no, la primera página de la primera ventana de incógnito sale con
  // anuncios y delatando Electron. Es idempotente: solo hace el trabajo la primera vez.
  prepararSesion(particion, incognito)
  // Se asigna justo antes de devolver. Solo lo leen callbacks, que corren mucho después.
  let yo: Ventana
  let win: BrowserWindow | null = null
  const tabs = new Map<number, Tab>()
  let activeId: number | null = null
  let sidebarCollapsed = false
  let chatOpen = false
  /** Un vídeo de la pestaña activa está en pantalla completa (ver `setHtmlFullscreen`). */
  let htmlFullscreen = false

  // Rutas de los renderers (dev usa el server de Vite, prod los archivos build)
  function loadRenderer(target: BrowserWindow, page: 'index' | 'menu') {
    if (RENDERER_URL) target.loadURL(`${RENDERER_URL}/${page}.html`)
    else target.loadFile(join(__dirname, `../renderer/${page}.html`))
  }

  function contentBounds() {
    const [w, h] = win!.getContentSize()
    // Vídeo en pantalla completa: la vista se come la ventana entera. Ni topbar, ni sidebar,
    // ni chat, ni la franja del agente — en pantalla completa no hay chrome que valga.
    if (htmlFullscreen) return { x: 0, y: 0, width: w, height: h }
    const left = sidebarCollapsed ? 0 : sidebarWidth
    const right = chatOpen ? chatWidth : 0
    // Solo si la pestaña activa es la que el agente está controlando, reserva la franja de la leyenda.
    const bottom = controllingActive() ? CONTROLLED_STRIP : 0
    return { x: left, y: TOPBAR_HEIGHT, width: Math.max(0, w - left - right), height: Math.max(0, h - TOPBAR_HEIGHT - bottom) }
  }

  /**
   * MONPER_NO_RADIUS=1: no redondear nunca la vista.
   *
   * Es un interruptor de diagnóstico, no una opción. Existe para decidir de una vez si el hueco
   * a la derecha al cerrar el chat lo causa la máscara del redondeado: `setBorderRadius` recorta
   * la vista, y `applyRadius` NO la reaplica cuando solo cambia el tamaño (ver abajo), así que
   * una máscara instalada a un ancho y nunca actualizada explicaría lo que se ve — recorte
   * persistente, no reflow. Con esto en 1 el hueco debe desaparecer; si sigue, no era esto.
   */
  const NO_RADIUS = process.env['MONPER_NO_RADIUS'] === '1'

  function applyRadius(t: Tab) {
    if (NO_RADIUS || typeof t.view.setBorderRadius !== 'function') return
    // Redondea cuando la página "flota" (sidebar izq y/o panel de chat der).
    // El "sin redondeo" es 1, no 0, y no es un capricho: ver SIN_REDONDEO.
    // En pantalla completa nunca: un vídeo a pantalla completa con las esquinas comidas se ve
    // roto, y ahí no hay chrome detrás del que separarse.
    const r = htmlFullscreen ? SIN_REDONDEO : !sidebarCollapsed || chatOpen ? CONTENT_RADIUS : SIN_REDONDEO
    // Solo cuando CAMBIA. Reaplicar el radio en cada layout hace reaparecer las muescas de las
    // esquinas; este `if` estaba en el último estado que se dio por bueno y quitarlo las trajo
    // de vuelta. Ver docs/esquinas-y-vibrancy.md.
    if (t.radius === r) return
    sellarRadio(t, r)
  }

  /**
   * Instala la máscara y apunta a qué ancho se hizo.
   *
   * `forzar` pasa antes por otro valor. Hace falta al RESELLAR, donde el radio no cambia: si
   * Electron ignora un `setBorderRadius` con el mismo valor que ya tiene, la máscara se quedaría
   * con el tamaño viejo y el resellado sería un no-op perfecto — llamada hecha, nada reinstalado.
   * No hay getter con el que comprobarlo desde fuera, así que se fuerza.
   */
  function sellarRadio(t: Tab, r: number, forzar = false): void {
    t.radius = r
    t.radiusW = t.view.getBounds().width
    // Un valor distinto, y NUNCA 0: el 0 no reinstala la máscara (ver SIN_REDONDEO), así que
    // usarlo como paso intermedio dejaría puesta la vieja. +1 es un cambio real e invisible.
    if (forzar) t.view.setBorderRadius(r + 1)
    t.view.setBorderRadius(r)
    if (DEBUG_LAYOUT) console.log(`[radio]   setBorderRadius(${r})${forzar ? ' [resellado]' : ''} con la vista a w=${t.radiusW}`)
  }

  /**
   * Reinstala la máscara del redondeado cuando el tamaño ha cambiado.
   *
   * **Este era el hueco a la derecha al cerrar el chat.** `setBorderRadius` recorta la vista, y
   * ese recorte se instala con el tamaño que la vista tenía en ese momento. `applyRadius` solo
   * la reaplica cuando cambia el RADIO, nunca cuando cambia el ANCHO — así que tras
   * redimensionar el chat, la vista crecía pero seguía recortada al ancho viejo. Por eso el
   * síntoma era recorte y no reflow (el titular de GitHub salía partido a media palabra) y por
   * eso no se iba al reabrir el chat: la máscara seguía puesta.
   *
   * Confirmado con `MONPER_NO_RADIUS=1`: sin redondeo, el hueco no aparece.
   *
   * Va con debounce y **solo sobre la activa** a propósito. Reaplicar el radio en cada layout
   * es exactamente lo que hace reaparecer las muescas de las esquinas (docs/esquinas-y-vibrancy.md,
   * cuatro intentos fallidos); una sola vez cuando el tamaño se asienta, no.
   */
  const RESELLADO_MS = 80
  let resellarTimer: NodeJS.Timeout | null = null
  function resellarRadioAlAsentarse(): void {
    if (resellarTimer) clearTimeout(resellarTimer)
    resellarTimer = setTimeout(() => {
      resellarTimer = null
      const t = activeId != null ? tabs.get(activeId) : null
      if (!t || typeof t.view.setBorderRadius !== 'function' || t.radius === null) return
      if (t.radiusW === t.view.getBounds().width) return
      sellarRadio(t, t.radius, true)
    }, RESELLADO_MS)
  }

  /**
   * Reposiciona TODAS las vistas al área de contenido y trae la activa al frente.
   * Mantenerlas todas vivas (mismo rect, fondo opaco) hace el cambio de pestaña
   * INSTANTÁNEO — no hay repaint por ocultar/mostrar — y sin sangrado en las esquinas
   * redondeadas: todas se recortan igual y la activa (opaca) tapa a las de atrás.
   */
  // Warm set (LRU): mantenemos vivas y compuestas solo las N pestañas más recientes.
  // Cambiar entre ellas es instantáneo (ya están pintadas); las "frías" se ocultan para
  // que dejen de renderizar (ahorra CPU/GPU/energía). Es la contraparte del keep-alive.
  /**
   * Orden de uso reciente de las pestañas (la más reciente primero).
   *
   * Ya NO decide qué se dibuja — eso es solo la activa, ver `layoutTabs`. Se mantiene porque es
   * el LRU que necesita el descarte de pestañas en segundo plano (punto 11 de
   * docs/browser-hardening.md): dormir las que llevan mucho sin tocarse.
   */
  const warmOrder: number[] = []
  function touchWarm(id: number): void {
    const i = warmOrder.indexOf(id)
    if (i >= 0) warmOrder.splice(i, 1)
    warmOrder.unshift(id)
  }

  /**
   * Aquí NO se cachea lo último aplicado.
   *
   * Se probó (caché de bounds/visible/radius para no repetir llamadas al compositor) y se
   * revirtió: medido con `contentTracing`, no movía ni un frame descartado —así que no pagaba
   * por sí misma— y en cambio introducía un modo de fallo nuevo: en cuanto alguien cambia la
   * geometría por otra vía, la caché miente y `layoutTabs` se salta el cambio que hacía falta
   * (pasó con `ui:omnibox`). Repetir un `setBounds` es barato; una vista con el tamaño
   * equivocado no.
   *
   * Aquí se sospechaba también del hueco al cerrar el panel de chat, que llevaba tiempo sin
   * reproducirse. **No era esto**: era la máscara de `setBorderRadius`, que se instala con un
   * tamaño y no se reaplicaba al cambiar el ancho. Ver `resellarRadioAlAsentarse`.
   */
  /**
   * MONPER_DEBUG_LAYOUT=1: imprime, en cada layout, de dónde sale el rect y qué queda libre.
   *
   * Existe por un hueco a la derecha al cerrar el chat tras redimensionarlo que NO se pudo
   * reproducir: se midieron las cajas del main, los estilos del DOM y los píxeles de la página,
   * y las tres acababan correctas en todas las secuencias probadas. Sin poder reproducirlo,
   * arreglarlo sería adivinar; esto dice qué eslabón miente cuando vuelva a pasar.
   */
  const DEBUG_LAYOUT = process.env['MONPER_DEBUG_LAYOUT'] === '1'


  /**
   * @param soloVisible redimensiona SOLO la vista activa. Lo usan el arrastre de los paneles y
   * el final de la animación: tocar las ocultas ahí rompe el compositor (ver dentro del bucle).
   */
  function layoutTabs(soloVisible = false) {
    if (!win || win.isDestroyed()) return
    const cb = contentBounds()
    if (DEBUG_LAYOUT) {
      const [aw] = win.getContentSize()
      const at = activeId != null ? tabs.get(activeId) : null
      const real = at?.view.getBounds()
      console.log(
        `[layout] ventana=${aw} sidebar=${sidebarCollapsed ? 'colapsado' : sidebarWidth} ` +
        `chat=${chatOpen ? chatWidth : 'cerrado'} → calculado x=${cb.x} w=${cb.width} libre=${aw - cb.x - cb.width}` +
        (real ? `  | vista real x=${real.x} w=${real.width} libre=${aw - real.x - real.width}` : '')
      )
    }
    for (const [id, t] of tabs) {
      /**
       * SOLO la activa se dibuja. Las demás son vistas apiladas en el MISMO rect, así que
       * dejarlas visibles solo era inofensivo mientras la de encima fuese opaca y ya hubiese
       * pintado. Ninguna de las dos cosas se cumple siempre:
       *  - una página interna es translúcida y deja ver las de detrás (settings sobre newtab);
       *  - una pestaña recién creada tarda ~80ms en su primer frame, y en ese hueco se ve a
       *    través de ella lo que haya debajo (medido al abrir un marcador desde settings).
       * Se intentó acotarlo al primer caso y volvió disfrazado del segundo. La condición
       * correcta no es "¿puede taparlas?" sino "no hay razón para dibujarlas".
       *
       * No cuesta nada medible: en docs/rendimiento.md está comprobado que el primer frame
       * tarda 2-10ms tanto si la pestaña venía del warm set como si estaba fría. El warm set
       * nunca compró velocidad de pintado; solo hacía renderizar hasta 8 vistas a la vez.
       */
      const activa = id === activeId
      t.view.setVisible(activa)
      /**
       * Una vista OCULTA no sigue el layout en vivo.
       *
       * Al ocultarlas, Chromium libera sus superficies de GPU. Redimensionarlas igualmente
       * —y durante un arrastre eso son 60 `setBounds` por segundo sobre cada una— hacía que el
       * proceso de GPU escupiera `SharedImageManager::ProduceSkia: Trying to Produce a Skia
       * representation from a non-existent mailbox`, y tras ese error la vista ACTIVA se
       * quedaba mostrando el frame del ancho viejo: el hueco a la derecha al cerrar el chat.
       *
       * No las deja descuadradas: `soloVisible` solo lo usan el arrastre y la animación. Al
       * activar una pestaña, `setActive` llama a este layout completo, así que recibe su
       * tamaño antes de mostrarse.
       */
      if (soloVisible && !activa) continue
      t.view.setBounds(cb)
      applyRadius(t)
    }
    // La activa al frente, pero SOLO si no lo está ya: `addChildView` sobre una vista que ya
    // cuelga del contentView la desengancha y la vuelve a enganchar, y esto se llama en cada
    // colapso, cada apertura del chat y cada resize. Medido: 12 de 12 llamadas eran
    // redundantes, o sea 12 re-enganches al compositor para dejar todo como estaba.
    const at = activeId != null ? tabs.get(activeId) : null
    if (at) {
      const kids = win.contentView.children
      if (kids[kids.length - 1] !== at.view) win.contentView.addChildView(at.view)
    }
    // El chrome copia esta misma posición: no anima por su cuenta (ver Content.tsx).
    publicarRect(cb)
    resellarRadioAlAsentarse()
  }

  /** Manda al chrome el rect que acaba de aplicarse a la vista nativa. */
  function publicarRect(r: { x: number; width: number }): void {
    if (!win || win.isDestroyed()) return
    const [ancho] = win.getContentSize()
    win.webContents.send('layout:frame', { left: r.x, right: Math.max(0, ancho - r.x - r.width) })
  }
  // Alias: llamadas existentes que solo querían recolocar la vista activa.
  function layoutActive() { layoutTabs() }

  /**
   * Entra o sale de pantalla completa de vídeo.
   *
   * La ventana se pone en fullscreen de macOS ADEMÁS de estirar la vista: si solo se estirara,
   * seguiría viéndose la barra de menú y el Dock, que es lo que un vídeo a pantalla completa
   * no debe tener. Y al revés, poner solo la ventana en fullscreen sin tocar el layout es lo
   * que pasaba antes: el chrome seguía ocupando su sitio.
   *
   * `setFullScreen` es asíncrono en macOS (la animación del sistema), así que el layout se
   * rehace TAMBIÉN al terminar esa animación: hacerlo solo aquí lo calcularía con el tamaño
   * viejo y la vista se quedaría del tamaño de antes dentro de una ventana ya gigante.
   */
  function setHtmlFullscreen(on: boolean) {
    if (htmlFullscreen === on || !win) return
    htmlFullscreen = on
    for (const t of tabs.values()) applyRadius(t)
    if (win.isFullScreen() !== on) win.setFullScreen(on)
    layoutTabs()
  }

  // Anima los bounds de TODAS las vistas en sync con la transición CSS del content.
  const COLLAPSE_MS = 180
  let collapseAnim: NodeJS.Timeout | null = null
  function animateLayout() {
    if (!win || win.isDestroyed() || tabs.size === 0) return
    for (const t of tabs.values()) applyRadius(t)
    // Solo se anima la ACTIVA: es la única que se dibuja, y mover las ocultas a 60fps rompía
    // el compositor (ver el comentario de `soloVisible` en layoutTabs). Las demás reciben su
    // tamaño en el `layoutTabs()` completo del final.
    const activa = activeId != null ? tabs.get(activeId) : null
    if (!activa) return
    const inicio = activa.view.getBounds()
    const target = contentBounds()
    /**
     * El reloj arranca en el PRIMER tick, no aquí.
     *
     * Medido: el primer tick del intervalo llega ~34ms tarde (el main está ocupado justo
     * después del click), y como la curva está muy cargada al principio, arrancar el reloj
     * antes hacía que la vista nativa apareciera ya al 47% del recorrido — un salto de 112px
     * mientras el chrome iba por 61. Se veía como si fueran a velocidades distintas.
     * Arrancando aquí, el primer frame cae en p=0 y el retraso se paga al final, donde la
     * curva es plana: 2px sobre 240.
     */
    let t0 = 0
    if (collapseAnim) clearInterval(collapseAnim)
    collapseAnim = setInterval(() => {
      const ahora = Date.now()
      if (!t0) t0 = ahora
      const p = Math.min(1, (ahora - t0) / COLLAPSE_MS)
      const e = 1 - Math.pow(1 - p, 3) // easeOutCubic
      const rect = {
        x: Math.round(inicio.x + (target.x - inicio.x) * e),
        width: Math.round(inicio.width + (target.width - inicio.width) * e)
      }
      activa.view.setBounds({ x: rect.x, y: target.y, width: rect.width, height: target.height })
      // El MISMO rect al chrome, en el mismo tick. Antes el topbar lo animaba una transición
      // CSS por su cuenta: dos relojes independientes, y por mucho que coincidieran la curva y
      // la duración, siempre se veían desfasados. Ahora hay un solo animador y el topbar se
      // limita a copiar la posición de la página.
      publicarRect(rect)
      if (p >= 1 && collapseAnim) { clearInterval(collapseAnim); collapseAnim = null; layoutTabs() }
    }, 1000 / 60)
  }

  // DevTools en su propia ventana (undocked): trae cerrar, redimensionar y reposicionar
  // (dock-side) nativos, y no toca nuestro layout ni el rounding del page view.
  function toggleDevtools(): void {
    const wc = activeId != null ? tabs.get(activeId)?.view.webContents : undefined
    if (!wc) return
    if (wc.isDevToolsOpened()) wc.closeDevTools()
    else wc.openDevTools({ mode: 'detach' })
  }

  /**
   * El estado actual, para poder MANDARLO y también para poder PEDIRLO.
   *
   * `state:update` es solo push, y eso deja fuera a cualquiera que se suscriba tarde: el peek se
   * crea al vuelo y su React se suscribe después del `pushState()` que lo acompaña, así que
   * salía con las pestañas de otro momento (o sin ninguna) hasta el siguiente cambio. Con
   * `state:get` quien se suscribe pide el estado y deja de depender de llegar a tiempo.
   */
  function buildState(): BrowserState | null {
    if (!win || win.isDestroyed()) return null
    const t = activeId != null ? tabs.get(activeId) : null
    const displayUrl = (u: string) => (isInternal(u) ? '' : u)
    const state: BrowserState = {
      tint: appearanceTint,
      titanioFavicon: faviconFor('https://app.titanio.ai'),
      activeId,
      tabs: [...tabs.entries()].map(([id, tb]) => ({
        id, url: tb.errorUrl ?? displayUrl(tb.url), title: tb.title || tr("Nueva pestaña"), favicon: tb.favicon, loading: tb.loading, recording: tb.recording, muted: tb.muted, audible: tb.audible, agent: tb.agent, bookmarkId: tb.bookmarkId, pinnedTitanio: tb.pinnedTitanio, internal: internalPageOf(tb.url)
      })),
      active: t
        ? {
            url: t.errorUrl ?? displayUrl(t.url), internal: internalPageOf(t.url), title: t.title, canBack: t.canBack, canForward: t.canForward,
            // Translúcida ⇒ sin color: la franja de costura no debe pintar nada (ver applyBackdrop).
            loading: t.loading, pageColor: esTranslucida(t) ? 'transparent' : (t.pageBg || t.themeColor),
            bookmarked: isBookmarked(t.errorUrl ?? t.url),
            muted: t.muted, audible: t.audible
          }
        : null,
      controlling: controllingActive(),
      incognito
    }
    return state
  }

  function pushState(): void {
    const state = buildState()
    if (!state || !win || win.isDestroyed()) return
    const t = activeId != null ? tabs.get(activeId) : null
    win.webContents.send('state:update', state)
    // El título de la ventana. No se ve en la barra (es frameless), pero sí en Mission
    // Control, en el menú Ventana y al compartir pantalla, donde antes ponía siempre
    // "Titanio": las pestañas son WebContentsView aparte, así que el título del chrome nunca
    // cambiaba solo.
    win.setTitle(t?.title ? `${t.title} — Titanio Browser` : 'Titanio Browser')
    // El peek renderiza el mismo <Sidebar/> con el mismo preload: recibe el mismo estado.
    if (peekWin && !peekWin.isDestroyed()) peekWin.webContents.send('state:update', state)
    // La ventana de extensiones detecta si estás en una página de la Store.
    if (extPopover.isVisible()) sendExtensions()
  }

  /**
   * Aplica el color muestreado bajo el topbar. Lo emite el preload de la página
   * (en la carga y en cada scroll), así el topbar se funde con lo que hay debajo.
   */
  /**
   * Nuestras páginas (newtab, settings, downloads, error) se dibujan TRANSLÚCIDAS, para que se
   * vea la vibrancy de la ventana igual que en el sidebar y el chat. Una web no: la
   * transparencia es del producto, no algo que se le concede a cualquier sitio.
   *
   * Dos cosas tienen que ir juntas o se rompe:
   *  - la vista nativa deja de tener fondo opaco (aquí);
   *  - `pageColor` pasa a ser transparente, para que la franja de costura NO pinte. Esa franja
   *    vive DEBAJO de la página, así que con la página translúcida se vería como una banda
   *    opaca de 16px bajo el topbar (ver docs/esquinas-y-vibrancy.md, regla 2).
   * Y no se muestrea el color: capturar una página transparente da un píxel que no significa
   * nada, y `applyTopColor` volvería a ponerle fondo opaco a la vista.
   */
  function esTranslucida(t: Tab): boolean {
    return isInternal(t.url)
  }
  function applyBackdrop(t: Tab): void {
    if (typeof t.view.setBackgroundColor !== 'function') return
    // El fondo de la vista es el del DOCUMENTO, no el de la esquina: es lo que se ve donde la
    // página no pinta. Hasta que se sepa, el de la app — un blanco por defecto daría un
    // fogonazo claro al abrir cualquier sitio oscuro.
    t.view.setBackgroundColor(esTranslucida(t) ? '#00000000' : (rgbToHex(t.docBg ?? '') ?? APP_BG))
  }

  /**
   * Lee el fondo real del documento y lo aplica a la vista.
   *
   * Chromium resuelve el fondo del papel así: el de `body` si tiene, si no el de `html`, y si
   * ninguno pinta, blanco. Se replica esa cadena porque muchísimos sitios solo declaran el
   * color en uno de los dos, y quedarse con `body` transparente daría el fondo equivocado.
   */
  async function leerFondoDelDocumento(t: Tab): Promise<void> {
    if (esTranslucida(t) || t.view.webContents.isDestroyed()) return
    try {
      const c = (await t.view.webContents.executeJavaScript(`(() => {
        const vale = (v) => v && v !== 'transparent' && !/^rgba\\(0, 0, 0, 0\\)$/.test(v)
        const b = document.body && getComputedStyle(document.body).backgroundColor
        if (vale(b)) return b
        const h = document.documentElement && getComputedStyle(document.documentElement).backgroundColor
        if (vale(h)) return h
        return 'rgb(255, 255, 255)'
      })()`, true)) as string
      const hex = rgbToHex(c)
      if (!hex || hex === t.docBg) return
      t.docBg = hex
      applyBackdrop(t)
    } catch { /* la página puede haberse ido o bloquear la evaluación */ }
  }

  function applyTopColor(t: Tab, c: string): void {
    if (esTranslucida(t)) return
    if (!c || t.pageBg === c) return
    t.pageBg = c
    // OJO: aquí NO se toca `setBackgroundColor`. Se hacía, y era el bug del fondo negro: este
    // color es el de la esquina superior izquierda, y en un sitio con cabecera oscura y cuerpo
    // blanco pintaba de negro toda el área que la página no cubriera. El fondo de la vista
    // sale de `leerFondoDelDocumento`.
    pushState()
  }
  /**
   * Diagnóstico de las esquinas: compara el color que usamos para tapar la costura contra
   * el píxel REAL de cada esquina de la página. Si no coinciden, el problema es el muestreo;
   * si coinciden, el arco es del antialiasing del compositor y el redondeado hay que quitarlo.
   * Se activa con MONPER_DEBUG_CORNERS=1.
   */
  const DEBUG_CORNERS = process.env['MONPER_DEBUG_CORNERS'] === '1'
  async function logCornerDiagnostics(t: Tab, sampled: string): Promise<void> {
    const b = t.view.getBounds()
    const pixel = async (x: number, y: number): Promise<string> => {
      try {
        const img = await t.view.webContents.capturePage({ x, y, width: 1, height: 1 })
        const p = img.toBitmap()
        return p.length >= 3 ? `#${[p[2], p[1], p[0]].map((n) => n.toString(16).padStart(2, '0')).join('')}` : '??'
      } catch { return '??' }
    }
    const [tl, tr, bl, br] = await Promise.all([
      pixel(1, 1),
      pixel(Math.max(0, b.width - 2), 1),
      pixel(1, Math.max(0, b.height - 2)),
      pixel(Math.max(0, b.width - 2), Math.max(0, b.height - 2))
    ])
    console.log('[esquinas]', {
      radio: CONTENT_RADIUS,
      usadoParaLaCostura: sampled,
      pixelRealArribaIzq: tl,
      pixelRealArribaDer: tr,
      pixelRealAbajoIzq: bl,
      pixelRealAbajoDer: br,
      fondoApp: APP_BG,
      coincideArribaIzq: tl.toLowerCase() === sampled.toLowerCase()
    })
  }

  /**
   * Muestrea el color REAL bajo el topbar capturando una franja de 3px del render y
   * promediándola (resize 1x1). A diferencia de leer CSS, esto ve gradientes, imágenes
   * y video — que es lo que usan la mayoría de los hero de las páginas.
   */
  async function sampleTopStrip(t: Tab, motivo = 'directo'): Promise<void> {
    if (esTranslucida(t)) return // no hay color que muestrear: la página deja ver la ventana
    const b = t.view.getBounds()
    if (b.width < 8 || b.height < 8) return
    try {
      // Muestreamos LA ESQUINA superior-izquierda, no el ancho completo: este color rellena
      // la muesca del redondeado nativo, así que debe coincidir con el píxel de ESA esquina.
      // Promediar toda la franja daba un color distinto en páginas con degradado o con algo
      // claro arriba, y esa diferencia se veía como un arco en la esquina.
      const w = Math.min(24, b.width)
      const img = await t.view.webContents.capturePage({ x: 0, y: 0, width: w, height: 4 })
      if (img.isEmpty()) return
      const px = img.resize({ width: 1, height: 1, quality: 'good' }).toBitmap() // BGRA
      if (px.length < 3) return
      const hex = `#${[px[2], px[1], px[0]].map((n) => n.toString(16).padStart(2, '0')).join('')}`
      if (DEBUG_CORNERS) await logCornerDiagnostics(t, hex)
      if (DEBUG_TOPCOLOR) {
        const y = await t.view.webContents.executeJavaScript('window.scrollY').catch(() => '?')
        console.log(`[topcolor] ${motivo.padEnd(7)} scrollY=${String(y).padStart(6)}  ${hex}${t.pageBg === hex ? '' : '  ← cambia'}`)
      }
      applyTopColor(t, hex)
    } catch { /* la vista puede estar oculta o destruida */ }
  }
  /**
   * Throttle por pestaña: el scroll dispara mucho, así que capturamos como máximo cada 100ms.
   *
   * Dos cosas que NO son opcionales, y que faltaban:
   *
   * 1. **Muestra de cierre (`again`).** Los eventos que llegaban mientras había una captura
   *    pendiente se descartaban y nadie volvía a mirar. Si el último evento del scroll caía en
   *    esa ventana, el topbar se quedaba con el color de MITAD del recorrido.
   * 2. **Muestra tras el reposo (`SETTLE_MS`).** En macOS el scroll sigue animándose después
   *    del último evento `scroll` del DOM: momentum y, al llegar arriba, el rebote elástico.
   *    Esa animación la hace el compositor y NO emite más eventos, así que la última captura
   *    veía un frame intermedio. Síntoma: al volver arriba había que mover un pelín el scroll
   *    para que cogiera el color bueno.
   */
  const DEBUG_TOPCOLOR = process.env['MONPER_DEBUG_TOPCOLOR'] === '1'
  const topSampleAt = new WeakMap<Tab, number>()
  const topSamplePending = new WeakSet<Tab>()
  const topSampleAgain = new WeakSet<Tab>()
  const topSettle = new WeakMap<Tab, NodeJS.Timeout>()
  const SETTLE_MS = 260 // margen para que el momentum y el rebote terminen

  function scheduleTopSample(t: Tab): void {
    // Siempre se re-arma la muestra de cierre: se toma cuando el scroll deja de moverse.
    const prev = topSettle.get(t)
    if (prev) clearTimeout(prev)
    topSettle.set(t, setTimeout(() => { topSettle.delete(t); void sampleTopStrip(t, 'reposo') }, SETTLE_MS))

    if (topSamplePending.has(t)) { topSampleAgain.add(t); return }
    const wait = Math.max(0, 100 - (Date.now() - (topSampleAt.get(t) ?? 0)))
    topSamplePending.add(t)
    setTimeout(() => {
      topSamplePending.delete(t)
      topSampleAt.set(t, Date.now())
      void sampleTopStrip(t, 'scroll')
      // Hubo eventos descartados mientras esta captura estaba pendiente: mira otra vez.
      if (topSampleAgain.delete(t)) scheduleTopSample(t)
    }, wait)
  }
  ipcMain.on('page:scrolled', (e) => {
    const t = [...tabs.values()].find((tb) => tb.view.webContents === e.sender)
    if (t && t.view.webContents.id === activeWc()?.id) scheduleTopSample(t)
  })

  // 'rgb(r, g, b)' / 'rgba(...)' → '#rrggbb' (ignora alpha). Devuelve null si no puede.
  function rgbToHex(c: string): string | null {
    const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
    if (!m) return /^#[0-9a-f]{6}$/i.test(c) ? c : null
    const h = (n: string): string => Number(n).toString(16).padStart(2, '0')
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`
  }

  function createTab(url = newtabUrl(), activate = true, agent = false): number {
    const id = nextId++
    /**
     * Una pestaña puede MUDARSE a otra ventana (arrastrarla fuera, "Abrir en ventana nueva").
     * Sus listeners viven para siempre, así que no pueden hablar con la ventana que la creó:
     * resuelven en cada evento quién la tiene ahora. Sin esto, una pestaña arrastrada seguiría
     * repintando el sidebar de su ventana de origen.
     */
    const suya = (): Ventana => duenoDeTab(id) ?? yo
    const view = new WebContentsView({
      webPreferences: {
        partition: particion,
        contextIsolation: true,
        sandbox: true,
        // Explícito aunque sea el valor por defecto: es una decisión de producto (escribir un
        // correo largo sin corrector se nota a los diez segundos) y no queremos que se pierda
        // si algún día se toca este bloque. En macOS lo resuelve el corrector del sistema.
        spellcheck: true,
        preload: join(__dirname, '../preload/content.js')
      }
    })
    const t: Tab = { view, radius: null, radiusW: null, url, title: '', favicon: null, loading: false, canBack: false, canForward: false, themeColor: null, pageBg: null, docBg: null, recording: false, muted: false, audible: false, agent, bookmarkId: null, errorUrl: null }
    // Fondo de la vista. Para una web es opaco: sin esto, al cambiar de pestaña se ve el fondo
    // de la ventana. Y es el color de la app (oscuro), NO blanco — el borde antialiaseado del
    // redondeado nativo tiñe con este color, y en blanco dibujaba un halo en las esquinas.
    // Para nuestras páginas internas es transparente, a propósito: ver applyBackdrop.
    applyBackdrop(t)
    tabs.set(id, t)
    touchWarm(id) // pestaña recién creada: entra al warm set
    win!.contentView.addChildView(view)

    const wc = view.webContents
    const nav = wc.navigationHistory
    const refresh = () => { t.canBack = nav.canGoBack(); t.canForward = nav.canGoForward(); suya().pushState() }
    wc.on('did-start-loading', () => { t.loading = true; suya().pushState() })
    wc.on('did-stop-loading', () => {
      t.loading = false
      void leerFondoDelDocumento(t) // fondo del papel, distinto del color de la esquina
      suya().scheduleTopSample(t) // color del topbar: se remuestrea también en cada scroll
      // Al activarla la página aún no había cargado: el input no existía. Se reintenta aquí.
      suya().enfocarNewtab(id)
      refresh()
    })
    wc.on('did-navigate', (_e, u) => { // sólo main-frame
      t.url = u; t.recording = false
      t.favicon = faviconFor(u)
      // Una pestaña cruza la frontera en los dos sentidos (newtab → web → newtab), así que el
      // fondo se decide en cada navegación, no al crear la vista. Y hay que rehacer el layout:
      // volverse translúcida cambia QUÉ otras vistas pueden quedar visibles detrás (ver
      // `soloActiva` en layoutTabs). Solo si es la activa: el resto ya no se ve.
      // Se olvida el fondo del documento anterior: una SPA que cambia de ruta puede cambiar de
      // tema, y conservarlo dejaría el papel del sitio de antes.
      t.docBg = null
      applyBackdrop(t)
      if (id === suya().activeId()) suya().layoutTabs()
      // Al navegar a algo que NO es la página de error, limpiamos el estado de error y registramos la visita.
      // En incógnito no se apunta la visita: es la mitad de la promesa (la otra mitad es que
      // la partición no persiste, ver particiones.ts).
      if (!isErrorPage(u)) { t.errorUrl = null; if (!isInternal(u) && !suya().incognito) recordVisit(u, t.title, t.favicon) }
      applyZoom(wc, u) // restaura el zoom recordado para el origen
      refresh()
      scheduleSaveSession()
    })
    /**
     * Pantalla completa de un vídeo.
     *
     * Sin esto, darle a fullscreen en YouTube ponía en pantalla completa la VENTANA, con su
     * sidebar y su topbar encima: el vídeo se quedaba en el mismo hueco de siempre, solo que
     * más grande. Chromium avisa con estos eventos, pero el tamaño de la vista lo decidimos
     * nosotros (`contentBounds`), así que nadie lo aplicaba.
     *
     * Solo cuenta la pestaña ACTIVA: una en segundo plano no puede apoderarse de la pantalla.
     */
    wc.on('enter-html-full-screen', () => { if (id === suya().activeId()) suya().setHtmlFullscreen(true) })
    wc.on('leave-html-full-screen', () => { if (id === suya().activeId()) suya().setHtmlFullscreen(false) })
    wc.on('did-navigate-in-page', (_e, u, isMainFrame) => {
      if (!isMainFrame) return
      t.url = u
      void leerFondoDelDocumento(t) // en una SPA no hay recarga: es el único aviso de cambio
      refresh()
    })
    wc.on('page-title-updated', (_e, title) => {
      t.title = title
      // `updateMeta` reescribe la entrada del historial: en incógnito no hay entrada que tocar,
      // pero si la URL ya se visitó en normal SÍ la habría, y le dejaría el título de aquí.
      if (!suya().incognito) updateMeta(t.url, title)
      suya().pushState()
    })
    wc.on('page-favicon-updated', (_e, icons) => {
      const url = t.url
      const icon = icons?.[0]
      if (!icon) return
      t.favicon = faviconFor(url) || icon
      // Se recuerda por host: es el icono de verdad del sitio, y sirve para los marcadores sin
      // icono propio en vez de pedírselo a un tercero.
      if (!suya().incognito) {
        rememberFavicon(t.url, t.favicon)
        updateMeta(t.url, undefined, t.favicon)
      }
      suya().pushState()
      void cacheVisitedFavicon(icon, wc.session).then((data) => {
        if (!data || wc.isDestroyed() || t.url !== url) return
        t.favicon = data
        if (!suya().incognito) {
          rememberFavicon(url, data)
          updateMeta(url, undefined, data)
        }
        suya().pushState()
      })
    })
    wc.on('did-change-theme-color', (_e, color) => { t.themeColor = color; suya().pushState() })
    wc.on('audio-state-changed', (e) => { t.audible = e.audible; suya().pushState() })
    // --- Confiabilidad: fallos de carga (red/DNS/certificado) y crashes → página de error ---
    wc.on('did-fail-load', (_e, code, desc, validatedURL, isMainFrame) => {
      if (!isMainFrame || code === -3) return // -3 = ERR_ABORTED (navegación reemplazada): ignorar
      if (isErrorPage(validatedURL)) return // evita bucles
      loadErrorPage(t, { url: validatedURL || t.url, code, desc, kind: 'network' })
    })
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return
      loadErrorPage(t, { url: t.errorUrl || t.url, code: 0, desc: details.reason, kind: 'crash' })
    })
    wc.on('context-menu', (_e, params) => void showPageContextMenu(wc, params))
    wc.on('found-in-page', (_e, r) => suya().win.webContents.send('find:result', { matches: r.matches, active: r.activeMatchOrdinal }))
    /**
     * Navegación a algo que no es web: `mailto:`, `tel:`, `zoommtg:`…
     *
     * Sin esto, el `WebContentsView` intenta navegar, falla y el enlace **no hace nada**. Se le
     * pasa al sistema si el esquema está en la lista blanca, y en cualquier caso se cancela la
     * navegación: dejarla seguir deja la pestaña en un estado roto.
     *
     * Esto cubre además el punto pendiente de `will-navigate` del hardening: `file:` y
     * `javascript:` iniciados por una página se bloquean aquí.
     */
    wc.on('will-navigate', (e, url) => {
      if (esWeb(url)) return
      e.preventDefault()
      abrirConElSistema(url)
    })

    wc.setWindowOpenHandler((details) => {
      // `<a href="mailto:…" target="_blank">` llega por aquí, no por will-navigate.
      if (!esWeb(details.url)) {
        abrirConElSistema(details.url)
        return { action: 'deny' as const }
      }
      const feats = details.features || ''
      // Popups reales (OAuth, pagos…) → ventana de verdad, que conserva window.opener /
      // postMessage / window.close. OJO: muchos flujos hacen window.open(url, 'name') SIN
      // dimensiones, lo que llega como 'foreground-tab': abrirlo como pestaña rompe el
      // callback (opener = null) y el login falla en silencio. Por eso miramos la URL.
      const isPopup =
        details.disposition === 'new-window' ||
        details.disposition === 'other' ||
        /\b(width|height|popup)\b/i.test(feats) ||
        isAuthUrl(details.url)
      console.log('[popup]', { url: details.url, disposition: details.disposition, feats, isPopup })
      if (isPopup) {
        pushAgentEvent(tr("Se abrió una ventana emergente: {0}", details.url))
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 500, height: 640, resizable: true, minimizable: true, maximizable: false,
            fullscreenable: false, autoHideMenuBar: true, title: 'Titanio Browser',
            // El popup hereda la sesión de quien lo abrió: un OAuth lanzado desde incógnito
            // que cayera en la sesión normal iniciaría sesión de verdad, justo lo contrario.
            webPreferences: { partition: suya().particion, contextIsolation: true, sandbox: true }
          }
        }
      }
      // Links normales (target=_blank) → nueva pestaña.
      pushAgentEvent(tr("Se abrió una pestaña nueva: {0}", details.url))
      suya().createTab(details.url)
      return { action: 'deny' }
    })

    // Manejo de teclas a nivel de la vista (funciona aunque la página tenga el foco):
    // F12 / ⌘⌥I / Ctrl+Shift+I alternan las DevTools acopladas.
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return
      const k = input.key.toLowerCase()
      const isDevtools = k === 'f12' ||
        (input.meta && input.alt && k === 'i') ||
        ((input.control || input.meta) && input.shift && k === 'i')
      if (isDevtools) { e.preventDefault(); suya().toggleDevtools(); return }
      // ⌘1..9 para saltar de pestaña (funciona con el foco en la página).
      if ((input.meta || input.control) && !input.alt && !input.shift && /^[1-9]$/.test(input.key)) {
        e.preventDefault(); suya().selectTabByIndex(Number(input.key))
      }
    })

    wc.loadURL(url)
    if (activate) setActive(id)
    else { layoutTabs(); pushState() } // dimensiona la nueva (queda detrás de la activa)
    return id
  }

  /**
   * La página de New tab se abre para escribir en ella, así que el foco de teclado tiene que
   * estar YA en su input. `autoFocus` del DOM no basta: el `WebContentsView` no tiene el foco
   * —lo tiene el chrome— y escribir no llegaba a ninguna parte hasta hacer clic.
   *
   * Solo para New tab: enfocar la vista en CADA cambio de pestaña le robaría el foco a la barra
   * de direcciones, que es justo lo contrario de lo que se quiere al navegar.
   */
  function enfocarSiNewtab(id: number): void {
    const t = tabs.get(id)
    if (!t || id !== activeId) return
    if (internalPageOf(t.url) !== 'newtab') return
    if (!t.view.webContents.isDestroyed()) t.view.webContents.focus()
  }

  /**
   * Vigía de páginas colgadas.
   *
   * El evento `unresponsive` de Electron **no dispara** en un `WebContentsView`: medido con un
   * bucle de 30 s y clics inyectados, no llega nunca (ver docs/browser-hardening.md). Así que
   * se detecta a mano: se le pide a la página que evalúe algo trivial, y si no contesta es
   * porque su hilo está bloqueado — que es exactamente la definición de colgada.
   *
   * Coste acotado a propósito, que este repo ya tiró 344MB de pre-warm por menos: solo la
   * pestaña ACTIVA, solo con la ventana a la vista, y un `executeJavaScript` trivial cada 8 s.
   *
   * La condición es VISIBLE, no enfocada: dos ventanas lado a lado se están mirando las dos, y
   * exigir foco dejaba el aviso sin salir en la mitad de los casos reales. Minimizada sí se
   * salta — ahí no hay nada que avisar hasta que vuelvas.
   */
  const PING_MS = 8000
  const PACIENCIA_MS = 10000
  let vigia: NodeJS.Timeout | null = null
  let avisandoCuelgue = false

  async function mirarSiCuelga(): Promise<void> {
    if (avisandoCuelgue || !win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return
    const idEnCurso = activeId
    const t = idEnCurso != null ? tabs.get(idEnCurso) : undefined
    if (idEnCurso == null || !t || isInternal(t.url) || t.view.webContents.isDestroyed()) return
    const wc = t.view.webContents

    const respondio = await Promise.race([
      wc.executeJavaScript('1').then(() => true, () => true), // un fallo tampoco es un cuelgue
      new Promise<boolean>((r) => setTimeout(() => r(false), PACIENCIA_MS))
    ])
    // Si mientras esperábamos cambió de pestaña o de foco, el aviso ya no viene a cuento.
    if (respondio || avisandoCuelgue || activeId !== idEnCurso || !win || win.isDestroyed() || !win.isVisible()) return

    avisandoCuelgue = true
    const nombre = t.title || nombreDeUrl(t.url) || tr("La página")
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: [tr("Esperar"), tr("Cerrar la pestaña")],
      defaultId: 0,
      cancelId: 0,
      message: tr("{0} no responde", nombre),
      detail: tr("La página se quedó bloqueada. Puedes darle más tiempo o cerrarla y perder lo que no hayas guardado.")
    })
    avisandoCuelgue = false
    if (response === 1 && tabs.has(idEnCurso)) closeTab(idEnCurso)
  }

  function arrancarVigia(): void {
    if (vigia) return
    vigia = setInterval(() => void mirarSiCuelga(), PING_MS)
  }

  function setActive(id: number) {
    if (!tabs.has(id)) return
    if (signinTabId != null && signinTabId !== id) hideSignin() // el prompt era de otra pestaña
    // Al DEJAR una pestaña que está reproduciendo, el vídeo se va a la ventanita flotante; al
    // volver a ella, se sale. Ver autoPip.
    const anterior = activeId != null && activeId !== id ? tabs.get(activeId) : undefined
    if (anterior) void autoPip(anterior, 'entrar')
    const nueva = tabs.get(id)
    if (nueva) void autoPip(nueva, 'salir')
    activeId = id
    touchWarm(id) // la activa entra/sube en el warm set
    const at = tabs.get(id)
    if (at) scheduleTopSample(at) // recolorea el topbar con la pestaña recién activada
    layoutTabs()
    pushState()
    enfocarSiNewtab(id)
    arrancarVigia()
    scheduleSaveSession()
  }

  /**
   * Saca la pestaña de esta ventana sin destruirla. NO se toca el `WebContentsView` más allá
   * de sacarlo del árbol: ese es el punto de mudar una pestaña en vez de recrearla — conserva
   * su historial de navegación, su scroll y lo que hubiera escrito en un formulario.
   */
  function desprenderTab(id: number): Tab | null {
    const t = tabs.get(id)
    if (!t) return null
    win!.contentView.removeChildView(t.view)
    tabs.delete(id)
    const wi = warmOrder.indexOf(id); if (wi >= 0) warmOrder.splice(wi, 1)
    if (activeId === id) {
      const visibles = [...tabs.entries()].filter(([, tb]) => !tb.agent).map(([tid]) => tid)
      if (visibles.length) setActive(visibles[visibles.length - 1])
      else { activeId = null; createTab() }
    } else pushState()
    scheduleSaveSession()
    return t
  }

  function adoptarTab(id: number, t: Tab): void {
    tabs.set(id, t)
    touchWarm(id)
    win!.contentView.addChildView(t.view)
    // El fondo depende de si la vista es interna o web, y el redondeado se sella al tamaño de
    // ESTA ventana: hay que rehacer los dos, no vale con heredar los de la ventana anterior.
    applyBackdrop(t)
    t.radius = null; t.radiusW = null
    setActive(id)
  }

  // Pila de URLs de pestañas cerradas recientemente (para ⌘⇧T).
  const closedStack: string[] = []

  function closeTab(id: number) {
    const t = tabs.get(id)
    if (!t) return
    // Cerrar la pestaña que el agente está operando es una orden de parar inequívoca. Sin
    // esto, el agente la reabría con `openTab` y seguía: el usuario cerraba una pestaña que
    // volvía sola, una y otra vez, sin forma de detenerla salvo cerrar Titanio.
    if (t.agent || id === controlledTabId) pararAgente(tr("se cerró su pestaña"))
    // Recuerda la URL para poder reabrirla (solo http(s), no agent tabs).
    const u = t.errorUrl ?? t.url
    if (!t.agent && /^https?:\/\//i.test(u)) { closedStack.push(u); if (closedStack.length > 25) closedStack.shift() }
    win!.contentView.removeChildView(t.view)
    t.view.webContents.close()
    tabs.delete(id)
    const wi = warmOrder.indexOf(id); if (wi >= 0) warmOrder.splice(wi, 1)
    if (activeId === id) {
      // Se activa la última pestaña VISIBLE. Las del agente no salen en el sidebar, así que
      // saltar a una de ellas parece que no ha pasado nada: la lista se queda vacía y el
      // contenido cambia a algo que el usuario no abrió.
      const visibles = [...tabs.entries()].filter(([, t]) => !t.agent).map(([tid]) => tid)
      if (visibles.length) setActive(visibles[visibles.length - 1])
      else createTab()
    } else {
      pushState()
    }
    scheduleSaveSession()
  }

  function reopenClosedTab(): void {
    const u = closedStack.pop()
    if (u) createTab(u, true)
  }

  // ⌘1..8 → n-ésima pestaña; ⌘9 → última (como en Chrome).
  function selectTabByIndex(n: number): void {
    const ids = [...tabs.keys()]
    if (!ids.length) return
    const idx = n >= 9 ? ids.length - 1 : Math.min(n - 1, ids.length - 1)
    setActive(ids[idx])
  }

  // Reordena las pestañas al orden dado (los ids no incluidos quedan al final, en su orden actual).
  function reorderTabs(orderedIds: number[]): void {
    const seen = new Set<number>()
    const entries: [number, Tab][] = []
    for (const id of orderedIds) { const t = tabs.get(id); if (t) { entries.push([id, t]); seen.add(id) } }
    for (const [id, t] of tabs) if (!seen.has(id)) entries.push([id, t])
    tabs.clear()
    for (const [id, t] of entries) tabs.set(id, t)
    pushState()
    scheduleSaveSession()
  }

  // Menú contextual nativo del contenido de la página (click derecho sobre un enlace,
  // imagen, selección, campo editable, o el fondo).

  function iniciar(): void {
    win = new BrowserWindow({
      // Tamaño/posición recordados de la sesión anterior (o default centrado).
      ...initialBounds(1440 + SIDEBAR_DEFAULT, 900 + TOPBAR_HEIGHT),
      minWidth: 720,
      minHeight: 480,
      show: false,
      // Fondo transparente en mac para que la vibrancy se vea a través del sidebar y de
      // las muescas del redondeado del page view.
      ...(isMac && !NO_VIBRANCY && vibrancyMaterial !== 'none'
        ? {
            vibrancy: vibrancyMaterial,
            visualEffectState: 'active' as const,
            backgroundColor: '#00000000'
          }
        : { backgroundColor: APP_BG }),
      titleBarStyle: isMac ? 'hiddenInset' : 'default',
      // y=20: el semáforo mide 12px, así que su centro cae en 26 — el mismo que los iconos del
      // topbar y los del sidebar, que comparten banda. Con y=17 caía en 23 y se veía desalineado.
      // El semáforo tiene que compartir centro con los iconos del topbar y los del sidebar: los
      // botones de macOS miden 12px, así que su centro es y+6 y la cuenta es TOPBAR_HEIGHT/2 - 6.
      // Con 52px eran y=20; con 44, y=16. Si cambia la altura, esta línea cambia con ella.
      trafficLightPosition: isMac ? { x: 15, y: TOPBAR_HEIGHT / 2 - 6 } : undefined,
      ...(isMac ? {} : { icon: appIcon }),
      webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: false }
    })

    if (shouldMaximize()) win.maximize()
    win.once('ready-to-show', () => {
      // Se reaplica el material ELEGIDO. Antes había aquí un `setVibrancy('under-window')` fijo
      // que pisaba la preferencia guardada y también ignoraba MONPER_NO_VIBRANCY: el selector
      // de Settings solo surtía efecto si lo cambiabas en vivo.
      if (isMac && !NO_VIBRANCY && vibrancyMaterial !== 'none') win!.setVibrancy(vibrancyMaterial)
      win!.show()
    })
    if (win) trackWindow(win)

    loadRenderer(win!, 'index')
    // Minimizar es el mismo caso que cambiar de pestaña: dejas de ver la página y el vídeo se
    // va a la ventanita, que en macOS sigue visible con la app minimizada. Al restaurar, vuelve.
    const activa = (): Tab | undefined => (activeId != null ? tabs.get(activeId) : undefined)
    win.on('minimize', () => { const t = activa(); if (t) void autoPip(t, 'entrar') })
    win.on('restore', () => { const t = activa(); if (t) void autoPip(t, 'salir') })
    win.on('resize', () => { layoutActive(); hideOmni(); if (peekWin && !peekWin.isDestroyed() && peekWin.isVisible()) placePeekWin() })
    // El fullscreen de macOS anima: al empezar, la ventana aún mide lo de antes. Sin rehacer
    // el layout AQUÍ, la vista se queda del tamaño viejo dentro de una pantalla entera.
    win.on('enter-full-screen', () => layoutActive())
    win.on('leave-full-screen', () => {
      // Salir con Esc o con el botón verde también tiene que sacar a la página de su
      // fullscreen: si no, la web se cree a pantalla completa dentro de una ventana normal.
      if (htmlFullscreen) { htmlFullscreen = false; for (const t of tabs.values()) applyRadius(t) }
      layoutActive()
    })
    win.on('move', hideOmni)
    // ⌘1..9 cuando el foco está en el chrome (no en una página).
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && (input.meta || input.control) && !input.alt && !input.shift && /^[1-9]$/.test(input.key)) {
        e.preventDefault(); selectTabByIndex(Number(input.key))
      }
    })
    win.webContents.on('did-finish-load', () => {
      // La sesión guardada se restaura UNA vez, en la primera ventana. Sin esto, ⌘N
      // duplicaría todas las pestañas de la sesión anterior en cada ventana nueva.
      // `sinPestanaInicial` es para la ventana que nace al arrastrar una pestaña fuera: si se
      // creara la de bienvenida, la ventana abriría con dos y habría que cerrar una a la vista
      // del usuario.
      if (tabs.size === 0 && !opts.sinPestanaInicial) {
        if (!restoreSession(ventanas.get(win!.id) ?? vAct())) createTab()
      } else pushState()
      // Pre-carga las ventanas nativas de popups (site-info, menú de perfil) para que
      // abran instantáneo — crearlas en el primer click era lento (2-3 clicks).
      // NO se pre-crean los popovers. Se hacía para que el primer click fuera instantáneo,
      // pero eso arrastraba 3 procesos de renderer desde el arranque. Medido:
      //   con pre-warm:  primer abrir 31ms, 919MB de base, 4 ventanas
      //   sin pre-warm:  primer abrir 63ms, 575MB de base, 1 ventana
      // 344MB por 30ms que nadie percibe, una sola vez. Y el motivo original —que el popover
      // saliera VACÍO en el primer click— era otro bug, ya resuelto en createPopover
      // (reenvía sus datos en did-finish-load). Verificado: abre con sus 10 filas a la primera.
      // Si vuelves a pre-crear, mide antes.
      // Servicios globales, no por ventana: el scheduler y el updater son uno solo.
      if (!serviciosIniciados) {
        serviciosIniciados = true
        if (win) initRoutines(win, broadcastRoutines) // scheduler de rutinas (necesita la ventana)
        onUpdateState(broadcastUpdateState)
        void initUpdater() // comprobación silenciosa de actualizaciones
      }
    })
  }

  iniciar()
  const ventana = win as BrowserWindow | null
  if (!ventana) throw new Error('no se pudo crear la ventana')

  // ---- Lo que el resto del main necesita de esta ventana ----
  const api: Ventana = {
    id: ventana.id,
    win: ventana,
    incognito,
    particion,
    tabs,
    activeId: () => activeId,
    createTab, setActive, closeTab, reopenClosedTab, selectTabByIndex, reorderTabs,
    activeWc: () => (activeId != null ? tabs.get(activeId)?.view.webContents : undefined),
    tabActiva: () => (activeId != null ? tabs.get(activeId) ?? undefined : undefined),
    layoutTabs, layoutActive, animateLayout, pushState, buildState, toggleDevtools, contentBounds,
    setHtmlFullscreen,
    setCollapsed: (v: boolean) => { sidebarCollapsed = v },
    setChatOpen: (v: boolean) => { chatOpen = v },
    isCollapsed: () => sidebarCollapsed,
    scheduleTopSample, applyTopColor, enfocarNewtab: enfocarSiNewtab,
    soltarTabsDelBookmark, atarTabAlBookmark,
    desprenderTab, adoptarTab,
    pararVigia: () => { if (vigia) { clearInterval(vigia); vigia = null } }
  }
  yo = api
  return api
}

/**
 * Imprime la pestaña activa.
 *
 * En macOS el diálogo de impresión trae "Guardar como PDF", así que esto cubre las dos cosas
 * y no hace falta un `printToPDF` aparte — que además obligaría a elegir carpeta y nombre
 * nosotros, peor que el panel del sistema.
 *
 * El fallo se cuenta: `print` avisa por callback y quedarse callado deja al usuario esperando
 * un diálogo que no va a salir.
 */
function imprimirActiva(): void {
  const wc = activeWc()
  if (!wc) return
  wc.print({}, (ok, motivo) => {
    // "cancelled" no es un fallo: es el usuario cerrando el diálogo.
    if (!ok && motivo && motivo !== 'cancelled') {
      console.error('[imprimir] no se pudo:', motivo)
      dialog.showMessageBox(vActOpt()?.win ?? undefined!, {
        type: 'error', buttons: ['OK'], message: tr("No se pudo imprimir esta página"), detail: motivo
      })
    }
  })
}

/**
 * Picture-in-picture automático al dejar de ver una pestaña.
 *
 * Es lo que se espera de un navegador hoy: te cambias de pestaña —o minimizas— y el vídeo que
 * estabas viendo sigue delante en una ventanita, en vez de desaparecer. Titanio lo necesita más
 * que nadie: el agente se lleva una pestaña a trabajar mientras tú sigues viendo lo tuyo.
 *
 * Reglas, todas por evitar que moleste:
 * - **Solo si está REPRODUCIENDO.** Una pestaña con un vídeo pausado o ya visto no debe sacar
 *   una ventanita al cambiar de pestaña; sería un pop-up cada vez que navegas.
 * - **Solo un vídeo a la vez**, que es lo que permite el sistema: si ya hay algo en PiP no se
 *   toca, o el último en cambiar le robaría la ventana al anterior.
 * - **Al volver a la pestaña, se sale.** Dejarla flotando sobre su propio vídeo sería absurdo.
 * - `requestPictureInPicture()` exige gesto de usuario: de ahí el `true` de executeJavaScript.
 *   Cambiar de pestaña ES un gesto del usuario, solo que no ocurre dentro de la página.
 */
async function autoPip(t: Tab, accion: 'entrar' | 'salir'): Promise<void> {
  const wc = t.view.webContents
  if (!wc || wc.isDestroyed() || isInternal(t.url)) return
  const codigo = accion === 'entrar'
    ? `(async () => {
        if (document.pictureInPictureElement) return ''
        const v = ${BUSCAR_VIDEO}
        // `+"`paused`"+` es la condición: sin esto saldría una ventanita en cada pestaña con un
        // vídeo cargado, aunque nadie lo estuviera viendo.
        if (!v || v.paused || v.ended || !document.pictureInPictureEnabled) return ''
        try { await v.requestPictureInPicture(); return 'ENTRÓ' } catch (e) { return 'error: ' + ((e && e.message) || e) }
      })()`
    : `(async () => {
        if (!document.pictureInPictureElement) return ''
        try { await document.exitPictureInPicture(); return 'SALIÓ' } catch (e) { return 'error: ' + ((e && e.message) || e) }
      })()`
  try {
    const r = String(await wc.executeJavaScript(codigo, true))
    if (r.startsWith('error')) console.error(`[pip] auto (${accion}):`, r)
    else if (r && DEBUG_PIP) console.log(`[pip] auto: ${r}`)
  } catch (e) {
    if (DEBUG_PIP) console.log('[pip] auto: la página no respondió —', e instanceof Error ? e.message : e)
  }
}

/**
 * Cómo se encuentra el vídeo de una página, en JS y en un solo sitio.
 *
 * Las coordenadas del clic NO sirven: en YouTube el `<video>` está tapado por los overlays de
 * controles, y además el clic derecho que nos llega es el SEGUNDO —el primero lo captura
 * YouTube para su propio menú—, así que cae sobre ese menú. Se busca el vídeo visible más
 * grande, que en un reproductor es siempre el que el usuario está viendo.
 */
const BUSCAR_VIDEO = `(() => {
  const vs = [...document.querySelectorAll('video')]
    .filter((e) => e.readyState > 0 && e.clientWidth > 0 && !e.disablePictureInPicture)
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)
  return vs[0] || null
})()`

/**
 * Le pregunta a la página si tiene un vídeo del que se pueda hacer PiP.
 *
 * Se hace ANTES de abrir el menú, y por eso `showPageContextMenu` es async: el item tiene que
 * estar o no estar según lo que haya en la página, no según dónde se hizo clic.
 */
async function detectarVideo(wc: Electron.WebContents): Promise<VideoEnPagina> {
  const vacio: VideoEnPagina = { hay: false, enPip: false, url: '' }
  if (!document_pip_disponible(wc)) return vacio
  try {
    const r = (await wc.executeJavaScript(`(() => {
      const v = ${BUSCAR_VIDEO}
      if (!v) return { hay: false, enPip: false, url: '' }
      const src = v.currentSrc || v.src || ''
      return {
        hay: !!document.pictureInPictureEnabled,
        enPip: document.pictureInPictureElement === v,
        url: /^https?:/i.test(src) ? src : ''
      }
    })()`)) as VideoEnPagina
    if (DEBUG_PIP) console.log('[pip] detección:', JSON.stringify(r))
    return r ?? vacio
  } catch (e) {
    // Un fallo aquí no puede impedir que salga el menú: se pierde el item de vídeo y ya.
    console.error('[pip] no se pudo mirar si hay vídeo:', e instanceof Error ? e.message : e)
    return vacio
  }
}
/** La página puede estar destruida entre el clic y la consulta. */
function document_pip_disponible(wc: Electron.WebContents): boolean {
  return !!wc && !wc.isDestroyed()
}
const DEBUG_PIP = process.env['MONPER_DEBUG_PIP'] === '1'

/**
 * Mete o saca de picture-in-picture el vídeo sobre el que se hizo clic derecho.
 *
 * Electron no expone una API para esto: hay que pedírselo a la página. Y va con `userGesture`
 * en true porque `requestPictureInPicture()` exige gesto del usuario — sin eso el navegador lo
 * rechaza y el menú parecería no hacer nada.
 *
 * Buscar el vídeo por las coordenadas del clic NO basta: en YouTube (y en casi cualquier
 * reproductor) el `<video>` está TAPADO por los overlays de controles, así que
 * `elementFromPoint` devuelve un div. De ahí el plan B: el vídeo visible más grande de la
 * página, que en un reproductor es siempre el que el usuario está viendo.
 */
async function alternarPip(wc: Electron.WebContents): Promise<void> {
  const codigo = `(async () => {
    const v = ${BUSCAR_VIDEO}
    if (!v) return 'no se encontró ningún vídeo en la página'
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
      return ''
    } catch (e) { return (e && e.message) || String(e) }
  })()`
  try {
    const fallo = String(await wc.executeJavaScript(codigo, true))
    // Nunca en silencio: un item de menú que no hace nada es de lo más difícil de depurar.
    if (fallo) console.error('[pip] no se pudo activar:', fallo)
    else if (DEBUG_PIP) console.log('[pip] alternado OK')
  } catch (e) {
    console.error('[pip] no se pudo hablar con la página:', e instanceof Error ? e.message : e)
  }
}

async function showPageContextMenu(wc: Electron.WebContents, p: Electron.ContextMenuParams): Promise<void> {
  if (!vActOpt()?.win) return
  // Se consulta a la página ANTES de construir el menú (ver detectarVideo). Cuesta unos ms y es
  // lo que hace que el item aparezca en YouTube, donde el clic no cae sobre el vídeo.
  const video = await detectarVideo(wc)
  if (DEBUG_PIP) console.log('[pip] menú contextual — mediaType:', p.mediaType, '· vídeo en la página:', video.hay)
  const nav = wc.navigationHistory
  const items: MenuItemConstructorOptions[] = []
  if (!p.isEditable && !p.linkURL && !p.selectionText) {
    items.push({ label: tr("Imprimir…"), accelerator: 'CmdOrCtrl+P', click: () => imprimirActiva() }, { type: 'separator' })
  }
  if (p.linkURL) {
    items.push(
      { label: tr("Abrir enlace en pestaña nueva"), click: () => vAct().createTab(p.linkURL) },
      { label: tr("Copiar dirección del enlace"), click: () => clipboard.writeText(p.linkURL) },
      { type: 'separator' }
    )
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: tr("Abrir imagen en pestaña nueva"), click: () => vAct().createTab(p.srcURL) },
      { label: tr("Copiar dirección de la imagen"), click: () => clipboard.writeText(p.srcURL) },
      { label: tr("Guardar imagen"), click: () => wc.downloadURL(p.srcURL) },
      { type: 'separator' }
    )
  }
  items.push(...itemsDeVideo(video, {
    alternarPip: () => void alternarPip(wc),
    copiarUrl: (u) => clipboard.writeText(u),
    guardar: (u) => wc.downloadURL(u)
  }))
  // Sugerencias del corrector. La lógica vive en contextmenu.ts para poder probarla.
  items.push(...itemsDeCorrector(p, {
    reemplazar: (s) => wc.replaceMisspelling(s),
    aprender: (w) => wc.session.addWordToSpellCheckerDictionary(w)
  }))
  if (p.isEditable) {
    items.push(
      { role: 'cut', label: tr('Cortar'), enabled: p.editFlags.canCut },
      { role: 'copy', label: tr('Copiar'), enabled: p.editFlags.canCopy },
      { role: 'paste', label: tr('Pegar'), enabled: p.editFlags.canPaste },
      { role: 'selectAll', label: tr('Seleccionar todo') },
      { type: 'separator' }
    )
  } else if (p.selectionText) {
    const sel = p.selectionText.trim().slice(0, 40)
    items.push(
      { role: 'copy', label: tr('Copiar') },
      { label: tr("Buscar \"{0}\" en Google", sel), click: () => vAct().createTab('https://www.google.com/search?q=' + encodeURIComponent(p.selectionText)) },
      { type: 'separator' }
    )
  }
  items.push(
    { label: tr("Atrás"), enabled: nav.canGoBack(), click: () => nav.goBack() },
    { label: tr("Adelante"), enabled: nav.canGoForward(), click: () => nav.goForward() },
    { label: tr("Recargar"), click: () => wc.reload() },
    { type: 'separator' },
    { label: tr("Copiar dirección de la página"), click: () => clipboard.writeText(wc.getURL()) },
    { label: tr("Inspeccionar elemento"), click: () => wc.inspectElement(p.x, p.y) }
  )
  Menu.buildFromTemplate(items).popup({ window: vActOpt()?.win })
}

// ---- Restauración de sesión: persistir las pestañas abiertas y reabrirlas al arrancar ----
// Por perfil: las pestañas abiertas son suyas, igual que su historial.
function sessionFile(): string { return rutaDePerfil('session.json') }
let saveSessionTimer: NodeJS.Timeout | null = null

interface SesionVentana { urls: string[]; activeIndex: number; titanioIndex?: number }
function collectVentana(v: Ventana): SesionVentana {
  const urls: string[] = []
  let titanioIndex: number | undefined
  let activeIndex = 0
  for (const [id, t] of v.tabs) {
    if (t.agent) continue // las pestañas del agente no se persisten
    const u = t.errorUrl ?? t.url
    // Solo http(s), y nunca una página interna: se re-crean como new tab.
    //
    // El `isInternal` no es redundante con el esquema. En producción las internas son `file://`
    // y el primer test ya las descartaba, pero en DEV se sirven desde `http://localhost:5173`
    // y pasaban el filtro. Como `pnpm dev` y la app instalada comparten perfil, la sesión de
    // dev acababa guardada y la app empaquetada arrancaba pidiendo un servidor que no existe:
    // ERR_CONNECTION_REFUSED en la cara del usuario, en su propia página de bienvenida.
    if (!/^https?:\/\//i.test(u) || isInternal(u)) continue
    if (id === v.activeId()) activeIndex = urls.length
    if (t.pinnedTitanio) titanioIndex = urls.length
    urls.push(u)
  }
  return { urls, activeIndex, titanioIndex }
}
function collectSession(): { ventanas: SesionVentana[] } {
  // Las ventanas de incógnito no se guardan: reabrirlas al arrancar sería contar en voz alta
  // exactamente lo que se pidió no contar.
  const grupos = [...ventanas.values()].filter((v) => !v.incognito).map(collectVentana).filter((g) => g.urls.length > 0)
  return { ventanas: grupos }
}
function saveSessionNow(): void {
  writeJson(sessionFile(), collectSession(), 'la sesión (pestañas abiertas)', false)
}
function scheduleSaveSession(): void {
  if (saveSessionTimer) clearTimeout(saveSessionTimer)
  saveSessionTimer = setTimeout(saveSessionNow, 800)
}
/**
 * Cola de ventanas por restaurar. La primera ventana se queda con el primer grupo y abre una
 * ventana por cada grupo restante; cada una toma el suyo al terminar de cargar.
 */
let colaSesion: SesionVentana[] | null = null
function leerSesion(): SesionVentana[] {
  let data: unknown
  try { data = JSON.parse(readFileSync(sessionFile(), 'utf-8')) } catch { return [] }
  const d = data as { ventanas?: SesionVentana[]; urls?: string[]; activeIndex?: number }
  // Formato viejo (una lista plana de urls): era de una sola ventana.
  if (Array.isArray(d?.urls)) return d.urls.length ? [{ urls: d.urls, activeIndex: d.activeIndex ?? 0 }] : []
  return Array.isArray(d?.ventanas) ? d.ventanas.filter((g) => Array.isArray(g?.urls) && g.urls.length > 0) : []
}
function restoreSession(v: Ventana): boolean {
  // Ni se restaura EN una ventana de incógnito: abriría ahí las pestañas de la sesión normal.
  if (v.incognito) return false
  if (colaSesion === null) {
    colaSesion = leerSesion()
    // Las ventanas extra se piden aquí, no dentro del bucle de abajo: cada una se sirve sola.
    for (let i = 1; i < colaSesion.length; i++) setTimeout(() => createWindow(), 0)
  }
  const grupo = colaSesion.shift()
  if (!grupo) return false
  for (const [index, u] of grupo.urls.entries()) {
    const id = v.createTab(u, false)
    const tab = v.tabs.get(id)
    if (tab && index === grupo.titanioIndex) tab.pinnedTitanio = true
  }
  const ids = [...v.tabs.keys()]
  const target = ids[Math.min(Math.max(0, grupo.activeIndex ?? 0), ids.length - 1)]
  if (target != null) v.setActive(target)
  return true
}

function normalizeUrl(raw: string): string | null {
  const url = String(raw || '').trim()
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  // Escribir `mailto:alguien@sitio.com` en la barra abría una BÚSQUEDA de eso en Google.
  // Si el sistema se hace cargo, no hay nada que navegar.
  if (abrirConElSistema(url)) return null
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(url) || url === 'localhost' || url.startsWith('localhost:')) return 'https://' + url
  return 'https://www.google.com/search?q=' + encodeURIComponent(url)
}

// WebContents de la pestaña activa (para acciones de navegación del menú).
function activeWc() {
  return vAct().activeWc()
}

// ---- Zoom por sitio (recordado por origen) ----
const ZOOM_STEPS = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3]
const zoomByOrigin = new Map<string, number>()
function originOfUrl(u: string): string { try { return new URL(u).origin } catch { return '' } }
function applyZoom(wc: Electron.WebContents, url: string): void {
  const z = zoomByOrigin.get(originOfUrl(url)) ?? 0
  wc.setZoomLevel(z)
}
function changeZoom(delta: number | 'reset'): void {
  const t = vAct().tabActiva()
  if (!t) return
  const origin = originOfUrl(t.errorUrl ?? t.url)
  const cur = zoomByOrigin.get(origin) ?? 0
  let next = 0
  if (delta !== 'reset') {
    // Salta al step más cercano en la dirección pedida.
    const idx = ZOOM_STEPS.reduce((best, v, i) => (Math.abs(v - cur) < Math.abs(ZOOM_STEPS[best] - cur) ? i : best), 0)
    next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, idx + (delta > 0 ? 1 : -1)))]
  }
  if (next === 0) zoomByOrigin.delete(origin); else zoomByOrigin.set(origin, next)
  t.view.webContents.setZoomLevel(next)
}
// Envía una acción al renderer del chrome (toggles de estado: sidebar / chat / URL).
function menuAction(action: string): void {
  vActOpt()?.win?.webContents.send('menu:action', action)
}

function buildAppMenu(): void {
  const appMenu: MenuItemConstructorOptions = {
    label: 'Titanio',
    submenu: [
      { role: 'about', label: tr("Acerca de Titanio") },
      { label: tr("Buscar actualizaciones…"), click: () => void checkForUpdates(true, vActOpt()?.win) },
      { type: 'separator' },
      { label: tr("Ajustes…"), accelerator: 'CmdOrCtrl+,', click: () => openSettings() },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', label: tr("Ocultar Titanio") },
      { role: 'hideOthers', label: tr("Ocultar otros") },
      { role: 'unhide', label: tr("Mostrar todo") },
      { type: 'separator' },
      { role: 'quit', label: tr("Salir de Titanio") }
    ]
  }

  const fileMenu: MenuItemConstructorOptions = {
    label: tr("Archivo"),
    submenu: [
      { label: tr("Nueva ventana"), accelerator: 'CmdOrCtrl+N', click: () => { createWindow() } },
      { label: tr("Nueva ventana de incógnito"), accelerator: 'CmdOrCtrl+Shift+N', click: () => { createWindow({ incognito: true }) } },
      { label: tr("Nueva pestaña"), accelerator: 'CmdOrCtrl+T', click: () => vAct().createTab() },
      { label: tr("Reabrir pestaña cerrada"), accelerator: 'CmdOrCtrl+Shift+T', click: () => vAct().reopenClosedTab() },
      { label: tr("Historial"), accelerator: 'CmdOrCtrl+Y', click: () => openHistory() },
      { label: tr("Marcadores"), accelerator: 'CmdOrCtrl+Alt+B', click: () => openBookmarksManager() },
      { type: 'separator' },
      { label: tr("Imprimir…"), accelerator: 'CmdOrCtrl+P', click: () => imprimirActiva() },
      { label: tr("Cerrar pestaña"), accelerator: 'CmdOrCtrl+W', click: () => { const id = vAct().activeId(); if (id != null) vAct().closeTab(id) } },
      { type: 'separator' },
      { label: tr("Editar URL"), accelerator: 'CmdOrCtrl+L', click: () => menuAction('edit-url') }
    ]
  }

  const editMenu: MenuItemConstructorOptions = {
    label: tr("Editar"),
    submenu: [
      { role: 'undo', label: tr("Deshacer") },
      { role: 'redo', label: tr("Rehacer") },
      { type: 'separator' },
      { role: 'cut', label: tr("Cortar") },
      { role: 'copy', label: tr("Copiar") },
      { role: 'paste', label: tr("Pegar") },
      { role: 'selectAll', label: tr("Seleccionar todo") },
      { type: 'separator' },
      { label: tr("Buscar en la página"), accelerator: 'CmdOrCtrl+F', click: () => menuAction('find') }
    ]
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: tr("Ver"),
    submenu: [
      { label: tr("Recargar"), accelerator: 'CmdOrCtrl+R', click: () => activeWc()?.reload() },
      { label: tr("Atrás"), accelerator: 'CmdOrCtrl+[', click: () => { const wc = activeWc(); if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack() } },
      { label: tr("Adelante"), accelerator: 'CmdOrCtrl+]', click: () => { const wc = activeWc(); if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward() } },
      { type: 'separator' },
      { label: tr("Acercar"), accelerator: 'CmdOrCtrl+Plus', click: () => changeZoom(1) },
      { label: tr("Acercar"), accelerator: 'CmdOrCtrl+=', visible: false, click: () => changeZoom(1) },
      { label: tr("Alejar"), accelerator: 'CmdOrCtrl+-', click: () => changeZoom(-1) },
      { label: tr("Zoom normal"), accelerator: 'CmdOrCtrl+0', click: () => changeZoom('reset') },
      { type: 'separator' },
      { label: tr("Mostrar/ocultar sidebar"), accelerator: 'CmdOrCtrl+S', click: () => menuAction('toggle-sidebar') },
      { label: tr("Ask Titanio"), accelerator: 'CmdOrCtrl+J', click: () => menuAction('toggle-chat') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: tr("Pantalla completa") },
      { label: tr("Herramientas de desarrollo"), accelerator: 'F12', click: () => vAct().toggleDevtools() }
    ]
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: tr("Ventana"),
    role: 'windowMenu',
    submenu: [
      { role: 'minimize', label: tr('Minimizar') },
      { role: 'zoom', label: tr('Ampliar ventana') },
      { type: 'separator' },
      { role: 'front', label: tr('Traer todo al frente') }
    ]
  }

  const template: MenuItemConstructorOptions[] = isMac
    ? [appMenu, fileMenu, editMenu, viewMenu, windowMenu]
    : [fileMenu, editMenu, viewMenu, windowMenu]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}


// ---- IPC ----
ipcMain.handle('tabs:new', (ev) => { hidePeek(); return vDe(ev).createTab() })
ipcMain.handle('tabs:titanio', (ev) => {
  hidePeek()
  const v = vDe(ev)
  const existing = [...v.tabs.entries()].find(([, t]) => t.pinnedTitanio)
    ?? [...v.tabs.entries()].find(([, t]) => !t.agent && !t.bookmarkId && originOfUrl(t.url) === 'https://app.titanio.ai')
  const id = existing?.[0] ?? v.createTab('https://app.titanio.ai', false)
  const tab = v.tabs.get(id)
  if (!tab) return
  tab.pinnedTitanio = true
  tab.favicon ||= faviconFor('https://app.titanio.ai')
  v.setActive(id)
  v.pushState()
  scheduleSaveSession()
})
// La ventana de origen es la que TIENE la pestaña, no la que envía: el id es único en toda la
// app, así que no hay ambigüedad y así funciona igual si el mensaje llega desde otro sitio.
ipcMain.on('tabs:tearOff', (ev, id: number) => { moverTabAVentanaNueva(duenoDeTab(id) ?? vDe(ev), id) })
ipcMain.on('tabs:reorder', (ev, orderedIds: number[]) => vDe(ev).reorderTabs(orderedIds))
ipcMain.handle('tabs:close', (ev, id: number) => vDe(ev).closeTab(id))
ipcMain.handle('tabs:select', (ev, id: number) => { hidePeek(); vDe(ev).setActive(id) })
ipcMain.handle('nav:go', (ev, raw: string) => {
  const url = normalizeUrl(raw)
  const t = vDe(ev).tabActiva()
  if (url && t) t.view.webContents.loadURL(url)
})
ipcMain.handle('nav:back', (ev) => { const t = vDe(ev).tabActiva(); if (t?.view.webContents.navigationHistory.canGoBack()) t.view.webContents.navigationHistory.goBack() })
ipcMain.handle('nav:forward', (ev) => { const t = vDe(ev).tabActiva(); if (t?.view.webContents.navigationHistory.canGoForward()) t.view.webContents.navigationHistory.goForward() })
ipcMain.handle('nav:reload', (ev) => { const t = vDe(ev).tabActiva(); t?.view.webContents.reload() })
// ---- Anchos de los paneles (redimensionables, persistidos) ----
function panelsFile(): string { return join(app.getPath('userData'), 'panels.json') }
function loadPanels(): void {
  try {
    const d = JSON.parse(readFileSync(panelsFile(), 'utf-8')) as { sidebar?: number; chat?: number; vibrancy?: string; tint?: string }
    const L = PANEL_LIMITS
    if (d.sidebar) sidebarWidth = Math.min(L.sidebarMax, Math.max(L.sidebarMin, Math.round(d.sidebar)))
    if (d.chat) chatWidth = Math.min(L.chatMax, Math.max(L.chatMin, Math.round(d.chat)))
    // Solo aceptamos un valor conocido: el JSON lo puede editar el usuario.
    const v = d.vibrancy as VibrancySetting
    if (v === 'none' || VIBRANCY_MATERIALS.includes(v as VibrancyMaterial)) vibrancyMaterial = v
    if (typeof d.tint === 'string' && /^#[0-9a-f]{6}$/i.test(d.tint)) appearanceTint = d.tint.toLowerCase()
  } catch { /* valores por defecto */ }
}
let savePanelsTimer: NodeJS.Timeout | null = null
function savePanels(): void {
  if (savePanelsTimer) clearTimeout(savePanelsTimer)
  savePanelsTimer = setTimeout(() => {
    writeJson(panelsFile(), { sidebar: sidebarWidth, chat: chatWidth, vibrancy: vibrancyMaterial, tint: appearanceTint }, 'la apariencia y el tamaño de los paneles', false)
  }, 400)
}
ipcMain.handle('state:get', (ev) => vDe(ev).buildState())
ipcMain.handle('ui:panels', () => ({ sidebar: sidebarWidth, chat: chatWidth, limits: PANEL_LIMITS }))

// ---- Apariencia: nivel de transparencia del chrome (sidebar y panel de chat) ----
/** Materiales expuestos en Settings, con nombre humano en vez del término de macOS. */
const VIBRANCY_OPTIONS: { id: VibrancySetting; label: string; desc: string }[] = [
  { id: 'hud', get label() { return tr("Máxima") }, get desc() { return tr("Fondo muy visible") } },
  { id: 'popover', get label() { return tr("Alta") }, get desc() { return tr("Fondo visible") } },
  { id: 'menu', get label() { return tr("Media") }, get desc() { return tr("Fondo parcialmente visible") } },
  { id: 'sidebar', get label() { return tr("Baja") }, get desc() { return tr("Fondo poco visible") } },
  { id: 'under-window', get label() { return tr("Mínima") }, get desc() { return tr("Casi opaco") } },
  { id: 'none', get label() { return tr("Sin transparencia") }, get desc() { return tr("Fondo opaco") } }
]
/** Aplica el ajuste en vivo. 'none' quita la vibrancy y pone fondo opaco. */
function applyVibrancy(v: VibrancySetting): void {
  if (!isMac || NO_VIBRANCY) return
  for (const { win } of ventanas.values()) {
    if (win.isDestroyed()) continue
    if (v === 'none') {
      win.setVibrancy(null)
      win.setBackgroundColor(APP_BG)
    } else {
      win.setBackgroundColor('#00000000') // necesario para que el material se vea
      win.setVibrancy(v)
    }
  }
}

function appearanceData() {
  return { vibrancy: vibrancyMaterial, tint: appearanceTint, options: VIBRANCY_OPTIONS }
}
function broadcastAppearance(): void {
  paraPaginas('/settings.html', 'ui:appearanceChanged', appearanceData())
  for (const v of ventanas.values()) v.pushState()
}
// ---- Actualizaciones: estado compartido con el chrome (pill) y con Settings ----
function broadcastUpdateState(s: ReturnType<typeof getUpdateState>): void {
  paraTodas('update:state', s)
  for (const t of vAct().tabs.values()) {
    if (t.url.includes('/settings.html')) t.view.webContents.send('update:state', s)
  }
}
ipcMain.handle('update:state', () => getUpdateState())
ipcMain.handle('remote:get', () => { const r = remoteState(); return { enabled: r.enabled, port: r.port } })
ipcMain.on('remote:set', (_e, on: boolean) => setRemoteEnabled(!!on))
/**
 * El mismo interruptor, para Settings → MCPs.
 *
 * Va por un canal aparte y con `isInternalSender` porque `titanioTab` es el preload de
 * CONTENIDO: existe también en cualquier web que cargues. Sin ese filtro, una página podría
 * encender el puente y quedarse conduciendo tu navegador con tus sesiones. No es teórico: es
 * el mismo agujero que ya tapamos en los permisos de sitios.
 */
// ---- Gestor de marcadores ----
// Solo páginas internas: crear/editar/borrar marcadores no es algo que una web deba poder
// hacer, igual que `bookmarks:add` y `bookmarks:remove`.
ipcMain.handle('bookmarks:update', (e, id: string, cambios: { title?: string; url?: string }) => {
  if (!isInternalSender(e.senderFrame?.url)) return null
  const b = updateBookmark(String(id), cambios ?? {})
  if (b) broadcastBookmarks()
  return b
})

// ---- Historial ----
// Restringido a páginas internas: es el registro de todo lo que el usuario ha visitado.
ipcMain.handle('history:browse', (e, query: string, offset: number, limit: number) =>
  isInternalSender(e.senderFrame?.url) ? historyBrowse(String(query ?? ''), Number(offset) || 0, Number(limit) || 100) : { entries: [], total: 0 })
ipcMain.handle('history:remove', (e, url: string) => (isInternalSender(e.senderFrame?.url) ? historyRemove(String(url)) : false))
ipcMain.handle('history:clear', (e, desde?: number) => (isInternalSender(e.senderFrame?.url) ? historyClear(desde) : 0))

// ---- Importar de otro navegador ----
// Todo restringido a páginas internas: son los datos más sensibles que toca la app (el
// historial completo del usuario y sus contraseñas). Una web no puede ni preguntar.
ipcMain.handle('import:browsers', (e) => (isInternalSender(e.senderFrame?.url) ? navegadoresDisponibles() : []))
ipcMain.handle('import:run', async (e, id: NavegadorId, que: { bookmarks: boolean; history: boolean; passwords: boolean }) => {
  if (!isInternalSender(e.senderFrame?.url)) return { ok: false, error: tr("No permitido.") }
  const resumen = { bookmarks: 0, history: 0, passwords: 0 }
  const errores: string[] = []

  // Cada parte va en su propio try: que Safari no deje leer sus marcadores no debe impedir
  // importar el historial, y que fallen las contraseñas no debe tirar lo ya importado.
  if (que.bookmarks) {
    try {
      // Se respeta el árbol del navegador de origen: una carpeta allí es una carpeta aquí.
      // `createFolder` reutiliza la que ya exista con ese nombre, así que reimportar no
      // acaba con tres "Trabajo".
      for (const b of leerMarcadores(id)) {
        const carpeta = b.carpeta ? createFolder(b.carpeta) : null
        const bm = addBookmark({ url: b.url, title: b.title, favicon: faviconFor(b.url) })
        if (carpeta && (bm.parentId ?? null) === null) moveBookmark(bm.id, carpeta.id)
        resumen.bookmarks++
      }
      broadcastBookmarks()
    } catch (err) { errores.push(err instanceof Error ? err.message : String(err)) }
  }
  if (que.history) {
    try {
      // Con la fecha ORIGINAL: sin ella el historial importado aparecía entero como de hoy.
      for (const v of leerHistorial(id)) { recordVisit(v.url, v.title, null, v.visitedAt); resumen.history++ }
    } catch (err) { errores.push(err instanceof Error ? err.message : String(err)) }
  }
  if (que.passwords) {
    try {
      for (const c of leerCredenciales(id)) {
        try {
          if (vault.importCredential(c.url, c.username, c.password)) resumen.passwords++
        } catch (err) { errores.push(err instanceof Error ? err.message : String(err)) }
      }
    } catch (err) { errores.push(err instanceof Error ? err.message : String(err)) }
  }
  if (resumen.passwords) { notifyVault(); notifyChatContext() }
  // Se devuelve lo importado Y lo que falló: un resumen que solo cuenta éxitos miente.
  return { ok: errores.length === 0, ...resumen, error: errores.join(' · ') || undefined }
})

// ---- Navegador predeterminado ----
// Abierto al chrome y a las páginas internas: el banner vive en la new tab y el ajuste en
// Settings, y ninguna de las dos cosas es privada — solo dice si el sistema nos eligió.
ipcMain.handle('browser:default', () => ({ isDefault: esPredeterminado(), shouldOffer: debeOfrecerse() }))
ipcMain.handle('browser:makeDefault', () => {
  const r = hacerPredeterminado()
  // El estado cambia sin que nadie nos avise: se reenvía para que la UI no se quede vieja.
  paraTodas('browser:defaultChanged', { isDefault: esPredeterminado(), shouldOffer: debeOfrecerse() })
  return r
})
ipcMain.on('browser:dismissDefault', () => descartarOferta())

// ---- Servidores MCP externos: el agente usa herramientas que Titanio no tiene ----
ipcMain.handle('mcp:servers', (e) => (isInternalSender(e.senderFrame?.url) ? mcpServerStates() : []))
ipcMain.handle('mcp:reload', (e) => {
  if (!isInternalSender(e.senderFrame?.url)) return []
  reloadMcpConfig()
  return mcpServerStates()
})
/**
 * Arranca los servidores y devuelve su estado. Es el botón "Probar" de Settings: quien añade
 * un servidor necesita saber si funciona SIN tener que ponerse a chatear con el agente, y un
 * fallo de arranque tiene que verse aquí y no como un "el agente no sabe hacer eso".
 */
ipcMain.handle('mcp:probe', async (e) => {
  if (!isInternalSender(e.senderFrame?.url)) return []
  await mcpTools()
  return mcpServerStates()
})
ipcMain.on('mcp:openConfig', (e) => {
  // Se abre el fichero, no la carpeta: editarlo es la forma de añadir un servidor, igual
  // que la carpeta de skills es la forma de añadir una skill.
  if (isInternalSender(e.senderFrame?.url)) shell.openPath(mcpConfigPath())
})

ipcMain.handle('mcp:state', (e) => {
  if (!isInternalSender(e.senderFrame?.url)) return { enabled: false, port: 0 }
  const r = remoteState()
  return { enabled: r.enabled, port: r.port }
})
ipcMain.handle('mcp:enable', (e, on: boolean) => {
  if (!isInternalSender(e.senderFrame?.url)) return false
  setRemoteEnabled(!!on)
  return remoteState().enabled
})
ipcMain.handle('adblock:state', (e) => {
  if (!isInternalSender(e.senderFrame?.url)) return { enabled: false, allow: [], ready: false }
  return adblockState()
})
ipcMain.handle('adblock:enable', (e, on: boolean) => {
  if (!isInternalSender(e.senderFrame?.url)) return false
  setAdblockEnabled(!!on)
  return adblockState().enabled
})
ipcMain.handle('adblock:allow', (e, hostname: string, permitir: boolean) => {
  if (!isInternalSender(e.senderFrame?.url)) return false
  setAdblockAllowed(String(hostname ?? ''), !!permitir)
  return true
})
ipcMain.handle('pip:state', (e) => {
  if (!isInternalSender(e.senderFrame?.url)) return { enabled: false }
  return pipState()
})
ipcMain.handle('pip:enable', (e, on: boolean) => {
  if (!isInternalSender(e.senderFrame?.url)) return false
  setPipEnabled(!!on)
  return pipState().enabled
})
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.on('update:check', () => void checkForUpdates(true, vActOpt()?.win))
ipcMain.on('update:download', () => void downloadUpdate())
ipcMain.on('update:install', () => installUpdate())

ipcMain.handle('ui:appearance', () => appearanceData())
ipcMain.handle('ui:setTint', (e, color: unknown) => {
  if (!isInternalSender(e.senderFrame?.url)) throw new Error(tr("No permitido."))
  if (color !== null && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) throw new Error(tr("Color no válido."))
  appearanceTint = typeof color === 'string' ? color.toLowerCase() : null
  broadcastAppearance()
  savePanels()
  return appearanceTint
})
ipcMain.on('ui:setVibrancy', (e, v: VibrancySetting) => {
  if (!isInternalSender(e.senderFrame?.url)) return
  if (!VIBRANCY_OPTIONS.some((o) => o.id === v)) return
  vibrancyMaterial = v
  applyVibrancy(v)
  broadcastAppearance()
  savePanels()
})
ipcMain.on('ui:setPanel', (ev, which: 'sidebar' | 'chat', width: number) => {
  const L = PANEL_LIMITS
  const w = Math.round(width)
  if (which === 'sidebar') sidebarWidth = Math.min(L.sidebarMax, Math.max(L.sidebarMin, w))
  else chatWidth = Math.min(L.chatMax, Math.max(L.chatMin, w))
  // Solo la activa: esto llega a 60fps mientras arrastras, y redimensionar ahí las vistas
  // ocultas (sin superficie de GPU) es lo que rompía el compositor.
  vDe(ev).layoutTabs(true)
  savePanels()
})

ipcMain.handle('ui:collapse', (ev, collapsed: boolean) => {
  // Primer handler migrado a resolver el emisor: con dos ventanas, `` podría no ser la
  // que mandó el mensaje y colapsarías el sidebar de la otra.
  const v = vDe(ev)
  v.setCollapsed(!!collapsed)
  lastCollapseAt = Date.now() // suprime el hover falso del botón que aparece bajo el cursor
  hidePeek()
  vDe(ev).animateLayout()
  /**
   * Crear la ventana del peek AQUÍ, no en el primer hover.
   *
   * Medido: crearla y cargar `peekbar.html` cuesta ~230ms hasta el primer frame, y
   * `showPeekNow` la mostraba nada más llamar a `loadURL` — o sea, ventana vacía y
   * transparente durante todo ese rato. Con el hover-intent de 180ms encima, la primera
   * apertura tardaba ~410ms y las siguientes ~185ms. Eso era el "la primera vez tarda
   * muchísimo".
   *
   * No es pre-crear al arrancar (eso costaba 344MB y hay un test que lo prohíbe): si nunca
   * colapsas el sidebar, esta ventana no se crea nunca. Colapsar es justo la acción que
   * declara que vas a usar el peek, y ahí no estás esperando a nada. Además encaja con los
   * 600ms en los que `peek:show` ignora el hover tras colapsar: para cuando puedes abrirlo,
   * ya está cargado.
   *
   * Cuesta un proceso de renderer mientras el sidebar esté colapsado. No se destruye al
   * expandir a propósito: con ⌘S se alterna constantemente y volveríamos a pagarlo.
   */
  if (vDe(ev).isCollapsed()) ensurePeekWin()
})
ipcMain.handle('ui:chat', (ev, open: boolean) => { vDe(ev).setChatOpen(!!open); vDe(ev).animateLayout() })
// Al editar la URL, oculta la vista nativa (que se dibuja encima del DOM) para que
// el dropdown del omnibox sea visible; se restaura al cerrar el editor.
ipcMain.on('ui:omnibox', (ev, open: boolean) => {
  const t = vDe(ev).tabActiva()
  if (t) t.view.setVisible(!open)
})

// ---- Bookmarks ----
/**
 * Completa los marcadores con el icono que se vio al visitar el sitio. Los que sigan sin
 * icono (marcadores heredados, de antes de la caché) se resuelven en segundo plano pidiéndolo
 * al propio sitio, y cuando llega se reemiten.
 */
function conFavicon(list: Bookmark[]): Bookmark[] {
  const out = list.map((b) => (b.favicon ? b : { ...b, favicon: faviconFor(b.url) }))
  const faltan = out.filter((b) => !b.favicon)
  if (faltan.length) {
    void Promise.all(faltan.map((b) => resolveFavicon(b.url))).then((r) => {
      if (r.some(Boolean)) broadcastBookmarks()
    })
  }
  return out
}

function broadcastBookmarks(): void {
  const list = conFavicon(listBookmarks())
  for (const t of vAct().tabs.values()) {
    if (isNewtab(t.url)) t.view.webContents.send('bookmarks:changed', list)
  }
  paraTodas('bookmarks:changed', list) // sidebar del chrome
  if (peekWin && !peekWin.isDestroyed()) peekWin.webContents.send('bookmarks:changed', list)
  vAct().pushState() // refresca el estado "bookmarked" del chrome
}
function navigateActive(raw: string): void {
  const url = normalizeUrl(raw)
  const t = vAct().tabActiva()
  if (url && t) t.view.webContents.loadURL(url)
}

ipcMain.handle('bookmarks:list', () => conFavicon(listBookmarks()))
ipcMain.on('bookmarks:add', (e: IpcMainEvent, b: Omit<Bookmark, 'id'>) => {
  if (!isInternalSender(e.senderFrame?.url)) return
  addBookmark(b); broadcastBookmarks()
})
ipcMain.on('bookmarks:remove', (e: IpcMainEvent, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return
  soltarTabsDelBookmark(id); removeBookmark(id); broadcastBookmarks()
})
ipcMain.on('tab:navigate', (_e: IpcMainEvent, url: string) => navigateActive(url))
function abrirBookmark(id: string): void {
  const b = listBookmarks().find((x) => x.id === id)
  if (!b) return
  hidePeek()
  // Si ya hay una pestaña viva para este bookmark, actívala; si no, crea una ligada a su slot.
  for (const [tid, t] of vAct().tabs) if (t.bookmarkId === id) { vAct().setActive(tid); return }
  const tabId = vAct().createTab(b.url, true)
  const t = vAct().tabs.get(tabId)
  if (t) { t.bookmarkId = id; vAct().pushState() }
}
ipcMain.on('bookmarks:open', (_e: IpcMainEvent, id: string) => abrirBookmark(id))

function setTabMuted(id: number, muted: boolean): void {
  const t = vAct().tabs.get(id)
  if (!t) return
  t.view.webContents.setAudioMuted(muted)
  t.muted = muted
  vAct().pushState()
}
ipcMain.on('tab:toggleMute', (ev: IpcMainEvent, id?: number) => {
  const tid = id ?? vDe(ev).activeId()
  if (tid == null) return
  const t = vDe(ev).tabs.get(tid)
  if (t) setTabMuted(tid, !t.muted)
})

// Menú contextual nativo de un bookmark (click derecho en el BookmarkRow).
ipcMain.on('bookmark:contextMenu', (ev: IpcMainEvent, id: string) => {
  const b = listBookmarks().find((x) => x.id === id)
  if (!b || !vActOpt()?.win) return
  const template: MenuItemConstructorOptions[] = [
    { label: tr("Abrir"), click: () => { for (const [tid, t] of vDe(ev).tabs) { if (t.bookmarkId === id) { vDe(ev).setActive(tid); return } } const nid = vDe(ev).createTab(b.url, true); const nt = vDe(ev).tabs.get(nid); if (nt) { nt.bookmarkId = id; vDe(ev).pushState() } } },
    { label: tr("Abrir en pestaña nueva"), click: () => vDe(ev).createTab(b.url) },
    {
      // Un marcador abierto es una pestaña como otra: se muda entera, con su historial. Si no
      // está abierto no hay nada que mudar y se abre de cero en la ventana nueva.
      label: tr("Abrir en ventana nueva"),
      click: () => {
        const v = vDe(ev)
        const abierta = [...v.tabs.entries()].find(([, t]) => t.bookmarkId === id)
        if (abierta && moverTabAVentanaNueva(v, abierta[0])) return
        const destino = createWindow({ sinPestanaInicial: true })
        const nid = destino.createTab(b.url, true)
        const nt = destino.tabs.get(nid)
        if (nt) { nt.bookmarkId = id; destino.pushState() }
      }
    },
    { label: tr("Copiar enlace"), click: () => clipboard.writeText(b.url) },
    { type: 'separator' },
    { label: tr("Quitar de bookmarks"), click: () => { soltarTabsDelBookmark(id); removeBookmark(id); broadcastBookmarks() } }
  ]
  Menu.buildFromTemplate(template).popup({ window: vDe(ev).win })
})

// Menú contextual nativo de una pestaña (click derecho en el TabRow).
ipcMain.on('tab:contextMenu', (ev: IpcMainEvent, id: number) => {
  const t = vDe(ev).tabs.get(id)
  if (!t || !vActOpt()?.win) return
  const wc = t.view.webContents
  const ids = [...vDe(ev).tabs.keys()]
  const below = ids.slice(ids.indexOf(id) + 1)
  const others = ids.filter((x) => x !== id)
  const internal = isInternal(t.url)
  const template: MenuItemConstructorOptions[] = [
    { label: tr("Nueva pestaña"), click: () => vDe(ev).createTab() },
    { label: tr("Duplicar"), enabled: !internal, click: () => vDe(ev).createTab(t.url) },
    {
      label: tr("Abrir en ventana nueva"),
      enabled: [...vDe(ev).tabs.values()].filter((tb) => !tb.agent).length > 1,
      click: () => { moverTabAVentanaNueva(vDe(ev), id) }
    },
    { type: 'separator' },
    { label: tr("Recargar"), click: () => wc.reload() },
    {
      label: isBookmarked(t.url) ? tr("Quitar de bookmarks") : 'Agregar a bookmarks',
      enabled: !internal,
      click: () => {
        if (t.bookmarkId) soltarTabsDelBookmark(t.bookmarkId)
        atarTabAlBookmark(t, toggleBookmark(t.url, t.title || t.url, t.favicon))
        broadcastBookmarks()
      }
    },
    { label: t.muted ? tr("Reactivar sonido") : tr("Silenciar sitio"), click: () => setTabMuted(id, !t.muted) },
    { label: tr("Copiar enlace"), enabled: !internal, click: () => clipboard.writeText(t.url) },
    { type: 'separator' },
    { label: tr("Cerrar"), click: () => vDe(ev).closeTab(id) },
    { label: tr("Cerrar otras"), enabled: others.length > 0, click: () => others.forEach((x) => vDe(ev).closeTab(x)) },
    { label: tr("Cerrar las de abajo"), enabled: below.length > 0, click: () => below.forEach((x) => vDe(ev).closeTab(x)) }
  ]
  Menu.buildFromTemplate(template).popup({ window: vDe(ev).win })
})
/**
 * Ata (o desata) una pestaña a su marcador.
 *
 * `TabInfo.bookmarkId` es lo que hace que la pestaña se pinte EN el slot del marcador y
 * desaparezca de "Tabs". Sin esto, al marcar una pestaña salía dos veces: la fila del
 * marcador y la de la pestaña, como si fueran cosas distintas. La atadura solo existía al
 * ABRIR un marcador, nunca al crearlo.
 */
function atarTabAlBookmark(t: Tab, bm: { id: string } | null): void {
  t.bookmarkId = bm?.id ?? null
  vAct().pushState()
}

/**
 * Suelta las pestañas que colgaban de un marcador que ya no existe.
 *
 * Sin esto quedan INVISIBLES: el sidebar las excluye de "Tabs" por tener `bookmarkId` y ya no
 * hay fila de marcador donde pintarlas, así que la pestaña sigue viva y no se puede ni
 * seleccionar ni cerrar. Hay que llamarlo en TODO camino que borre un marcador.
 */
function soltarTabsDelBookmark(id: string): void {
  for (const t of vAct().tabs.values()) if (t.bookmarkId === id) t.bookmarkId = null
}

// Sin `isInternalSender`: viene del CHROME (el sidebar), igual que `bookmarks:toggle` y
// `bookmarks:open`. El filtro existe para que no lo llame una web, y una web no tiene este
// preload. Reordenar no crea ni borra nada.
/**
 * "Esto ya no es un marcador": el gesto de arrastrarlo a Tabs.
 *
 * Sin `isInternalSender` por lo mismo que `bookmarks:toggle`, que ya borra marcadores desde el
 * chrome. Y suelta las pestañas atadas ANTES de borrar: si no, la pestaña se queda invisible
 * (el sidebar la excluye de Tabs por tener `bookmarkId` y su fila de marcador ya no existe).
 */
ipcMain.on('bookmarks:detach', (_e: IpcMainEvent, id: string) => {
  soltarTabsDelBookmark(id)
  removeBookmark(id)
  broadcastBookmarks()
})

ipcMain.on('bookmarks:reorder', (_e: IpcMainEvent, ids: string[]) => {
  reorderBookmarks(Array.isArray(ids) ? ids : [])
  broadcastBookmarks()
})

// ---- Carpetas de marcadores ----
/**
 * Renombrar desde el chrome. Existe aparte de `bookmarks:update` a propósito: ese solo lo
 * pueden usar las páginas internas y además deja cambiar la URL. Aquí solo entra el título, que
 * es organización pura — la misma categoría que reordenar o mover, que el sidebar ya hace.
 */
ipcMain.on('bookmarks:rename', (_e, id: string, title: string) => {
  if (updateBookmark(String(id), { title: String(title ?? '') })) broadcastBookmarks()
})
ipcMain.handle('bookmarks:newFolder', (_e, title: string) => {
  const f = createFolder(String(title ?? ''))
  broadcastBookmarks()
  return f
})
ipcMain.on('bookmarks:move', (_e, id: string, parentId: string | null) => {
  if (!moveBookmark(String(id), parentId ? String(parentId) : null)) return
  broadcastBookmarks()
})
// Plegar una carpeta se persiste: si al reabrir Titanio volvieran todas desplegadas, plegarlas
// no serviría de nada — que es justo para lo que se pliegan con 79 marcadores.
ipcMain.on('bookmarks:collapse', (_e, id: string, collapsed: boolean) => {
  setFolderCollapsed(String(id), !!collapsed)
  broadcastBookmarks()
})

ipcMain.on('bookmarks:toggle', (ev) => {
  const t = vDe(ev).tabActiva()
  if (!t || isNewtab(t.url)) return
  if (t.bookmarkId) soltarTabsDelBookmark(t.bookmarkId)
  atarTabAlBookmark(t, toggleBookmark(t.url, t.title || t.url, t.favicon))
  broadcastBookmarks()
})

// Reenvía la interacción con la página al chrome, para cerrar el menú de perfil.
ipcMain.on('tab:pointerdown', () => { if (vActOpt()?.win && !vActOpt()?.win.isDestroyed()) vActOpt()?.win.webContents.send('page:pointerdown') })

// Acciones del menú de perfil
ipcMain.on('ui:devtools', (ev) => vDe(ev).toggleDevtools())
// ---- Descargas ----
function broadcastDownloads(): void {
  const list = listDownloads()
  paraPaginas('/downloads.html', 'downloads:changed', list)
  paraTodas('downloads:summary', { active: activeDownloadCount(), total: list.length })
  // El popover se refresca EN VIVO: se abre justo para mirar cómo va una descarga, así que si
  // solo recibiera datos al abrirse, la barra de progreso se quedaría congelada delante.
  downloadsPopover.send('downloadspop:data', list)
}
/** Reutiliza la pestaña si ya está abierta, como downloads: no se acumulan historiales. */
function openHistory(): void {
  for (const [id, t] of vAct().tabs) if (t.url.includes('/history.html')) { vAct().setActive(id); return }
  vAct().createTab(internalUrl('history'))
}

/** Igual que historial y descargas: reutiliza la pestaña si ya está abierta. */
function openBookmarksManager(): void {
  for (const [id, t] of vAct().tabs) if (t.url.includes('/bookmarks.html')) { vAct().setActive(id); return }
  vAct().createTab(internalUrl('bookmarks'))
}

function openDownloads(): void {
  for (const [id, t] of vAct().tabs) if (t.url.includes('/downloads.html')) { vAct().setActive(id); return }
  vAct().createTab(internalUrl('downloads'))
}
ipcMain.handle('downloads:list', () => listDownloads())
ipcMain.handle('downloads:summary', () => ({ active: activeDownloadCount(), total: listDownloads().length }))
ipcMain.on('downloads:cancel', (_e, id: string) => cancelDownload(id))
ipcMain.on('downloads:open', (_e, id: string) => openDownload(id))
ipcMain.on('downloads:show', (_e, id: string) => showDownload(id))
ipcMain.on('downloads:clear', () => clearDownloads())
ipcMain.on('ui:downloads', () => openDownloads())

/**
 * Popover de descargas del botón del topbar.
 *
 * Ese botón abría la PÁGINA de todas las descargas: para comprobar si el archivo que acabas de
 * bajar terminó, te cambiaba de página y perdías lo que estabas viendo. El popover contesta esa
 * pregunta donde estás, y "Ver todas" sigue llevando al listado completo.
 */
const downloadsPopover = createPopover(() => vActOpt()?.win ?? null, {
  name: 'downloadspop', width: 320, height: 180,
  preload: 'downloadspop', page: 'downloadspop', align: 'right',
  data: { channel: 'downloadspop:data', get: () => listDownloads() }
}, RENDERER_URL)
ipcMain.on('downloadspop:open', (_e, anchor: MenuAnchor) => downloadsPopover.show(anchor))
ipcMain.on('downloadspop:open-file', (_e, id: string) => { openDownload(String(id)); downloadsPopover.hide() })
ipcMain.on('downloadspop:reveal', (_e, id: string) => { showDownload(String(id)); downloadsPopover.hide() })
ipcMain.on('downloadspop:cancel', (_e, id: string) => cancelDownload(String(id)))
ipcMain.on('downloadspop:clear', () => { clearDownloads(); downloadsPopover.hide() })
ipcMain.on('downloadspop:all', () => { downloadsPopover.hide(); openDownloads() })

// ---- Buscar en página ----
ipcMain.on('find:start', (_e, query: string, opts: { forward: boolean; findNext: boolean }) => {
  const wc = activeWc()
  if (!wc || !query) return
  wc.findInPage(query, { forward: opts.forward, findNext: opts.findNext })
})
ipcMain.on('find:stop', () => { activeWc()?.stopFindInPage('clearSelection') })

// ---- Acciones rápidas sobre texto seleccionado ----
ipcMain.handle('quickactions:list', () => listQuickActions())
ipcMain.handle('quickactions:save', (e, a) => (isInternalSender(e.senderFrame?.url) ? saveQuickAction(a) : listQuickActions()))
ipcMain.handle('quickactions:remove', (e, id: string) => (isInternalSender(e.senderFrame?.url) ? removeQuickAction(id) : listQuickActions()))
// Ejecuta una acción: arma el prompt (plantilla + selección) y lo manda al chat del agente.
function runAgentPrompt(prompt: string): void {
  if (!prompt.trim()) return
  vActOpt()?.win?.webContents.send('chat:prefill', prompt)
}
ipcMain.on('quickaction:run', (_e, id: string, selection: string) => {
  const a = getQuickAction(id)
  if (a) runAgentPrompt(fillTemplate(a.template, selection))
})
ipcMain.on('quickaction:runFree', (_e, instruction: string, selection: string) => {
  runAgentPrompt(`${instruction.trim()}\n\n---\n${selection}`)
})
function openSettings(section?: string): void {
  const hash = section ? `#${section}` : ''
  // Si ya hay una pestaña de settings, actívala (y navega a la sección si se pidió); si no, ábrela.
  for (const [id, t] of vAct().tabs) if (t.url.includes('/settings.html')) {
    vAct().setActive(id)
    if (section) t.view.webContents.loadURL(internalUrl('settings') + hash)
    return
  }
  vAct().createTab(internalUrl('settings') + hash)
}
ipcMain.on('ui:settings', (_e, section?: string) => openSettings(typeof section === 'string' ? section : undefined))
ipcMain.on('ui:openChat', () => vActOpt()?.win?.webContents.send('menu:action', 'toggle-chat'))

// ---- Skills del agente (gestión desde Settings) ----
/**
 * Dos pasadas, como `perms:list`: la primera contesta al instante con los favicons que ya
 * están en caché y la segunda (`resolve`) va a buscar los que falten al propio sitio. Si se
 * hiciera siempre, la lista entera esperaría al servicio más lento.
 */
ipcMain.handle('skills:list', async (e, resolve?: boolean) => {
  if (!isInternalSender(e.senderFrame?.url)) return []
  if (resolve) await resolveSkillFavicons()
  return listSkills()
})
ipcMain.handle('skills:get', (e, id: string) => (isInternalSender(e.senderFrame?.url) ? getSkill(id) : null))
ipcMain.handle('skills:save', (e, id: string, source: string, expectedSource: string) => {
  if (!isInternalSender(e.senderFrame?.url)) throw new Error(tr("No permitido."))
  const detail = saveSkill(id, source, expectedSource)
  notifyChatContext()
  return detail
})
ipcMain.handle('skills:openItemFolder', async (e, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) throw new Error(tr("No permitido."))
  const error = await shell.openPath(skillFolder(id))
  if (error) throw new Error(error)
})
ipcMain.handle('skills:toggle', (e, id: string, on: boolean) => (isInternalSender(e.senderFrame?.url) ? toggleSkill(id, on) : listSkills()))
ipcMain.on('skills:openFolder', (e) => { if (isInternalSender(e.senderFrame?.url)) shell.openPath(skillsDir()) })

// ---- Perfil ----
function broadcastProfile(): void {
  const p = getProfile()
  paraTodas('profile:changed', p)
  if (peekWin && !peekWin.isDestroyed()) peekWin.webContents.send('profile:changed', p)
  pmPopover.send('profilemenu:profile', p)
}
ipcMain.handle('profile:get', () => getProfile())
ipcMain.handle('profile:set', (e, name: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return getProfile()
  const p = setProfile(name); broadcastProfile()
  return p
})
ipcMain.handle('profile:setAvatar', (e, dataUrl: string | null) => {
  if (!isInternalSender(e.senderFrame?.url)) return getProfile()
  const p = setAvatar(dataUrl); broadcastProfile()
  return p
})

// Autocompletado del omnibox / new tab. Cancela la búsqueda anterior en cada tecla.
const suggestAborts = new Map<number, AbortController>()
ipcMain.handle('omni:suggest', async (e, query: string) => {
  // Un controller POR EMISOR: antes era uno global y el omnibox del topbar y la
  // new-tab page se cancelaban mutuamente las sugerencias.
  const key = e.sender.id
  suggestAborts.get(key)?.abort()
  const ctrl = new AbortController()
  suggestAborts.set(key, ctrl)
  try { return await suggest(query, ctrl.signal) } catch { return [] }
  finally { if (suggestAborts.get(key) === ctrl) suggestAborts.delete(key) }
})
ipcMain.handle('ui:clearData', async (e) => {
  if (!isInternalSender(e.senderFrame?.url)) return false
  const ses = session.fromPartition(PARTICION_NORMAL)
  await ses.clearStorageData()
  await ses.clearCache()
  return true
})

// ---- Vault ----
// Ventana nativa flotante, creada una vez y reutilizada (abrir = posicionar + show).
/**
 * El vault NO usa la factoría de popovers a propósito: es una ventana opaca con esquinas
 * y sombra nativas, con su cabecera y su pie, y ese diseño es el que queremos aquí. Pasarlo
 * a las primitivas compartidas se probó y se descartó — no repetirlo.
 */
let vaultWin: BrowserWindow | null = null
/**
 * ¿Ya pintó su primer frame? El primer click en el vault no abría nada: `show()` llegaba con el
 * renderer todavía arrancando, y la ventana o salía vacía o se iba de blur antes de pintar — de
 * ahí el "hay que darle dos veces". Mismo arreglo que en la factoría de popovers.
 */
let vaultPintado = false
const VAULT_W = 320
const VAULT_H = 380
function ensureVaultWin(): BrowserWindow {
  if (vaultWin && !vaultWin.isDestroyed()) return vaultWin
  vaultWin = new BrowserWindow({
    parent: vActOpt()?.win!, width: VAULT_W, height: VAULT_H, show: false,
    frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, hasShadow: true, roundedCorners: true, backgroundColor: '#1b1b1f',
    webPreferences: { preload: join(__dirname, '../preload/vaultwin.js'), contextIsolation: true, sandbox: false }
  })
  vaultWin.once('ready-to-show', () => { vaultPintado = true })
  if (RENDERER_URL) vaultWin.loadURL(`${RENDERER_URL}/vault.html`)
  else vaultWin.loadFile(join(__dirname, '../renderer/vault.html'))
  vaultWin.on('blur', () => { if (vaultWin && !vaultWin.isDestroyed()) vaultWin.hide() })
  return vaultWin
}

/**
 * Los iconos de los sitios del vault. Nunca se le piden a un tercero.
 *
 * La caché solo tiene iconos de sitios VISITADOS, y una credencial dada de alta a mano no ha
 * visitado nada: por eso el vault salía entero con el icono genérico. Los que falten se piden
 * al propio sitio en segundo plano (igual que los marcadores heredados) y, cuando llegan, se
 * vuelve a notificar. `resolveFavicon` lo intenta una sola vez por host y sesión, así que esto
 * no puede convertirse en un bucle.
 */
function faviconsDelVault(): Record<string, string> {
  const out: Record<string, string> = {}
  const faltan: string[] = []
  for (const i of vault.list()) {
    const origin = i.data.origin
    if (!origin) continue
    const f = faviconFor(origin)
    if (f) out[origin] = f
    else faltan.push(origin)
  }
  if (faltan.length) {
    void Promise.all(faltan.map((o) => resolveFavicon(o).catch(() => false)))
      .then((rs) => { if (rs.some(Boolean)) notifyVault() })
  }
  return out
}

function notifyVault(): void {
  paraTodas('vault:changed', vault.list())
  if (vaultWin && !vaultWin.isDestroyed() && vaultWin.isVisible()) {
    vaultWin.webContents.send('vault:items', vault.list(), faviconsDelVault())
  }
}

/**
 * Un fallo del vault se le DICE al usuario. Es la diferencia entre "tu contraseña no se
 * guardó" y creer que sí y descubrirlo dos semanas después sin poder entrar a un sitio.
 */
function reportVaultError(e: unknown): void {
  const detail = e instanceof Error ? e.message : String(e)
  console.error('[vault]', detail)
  dialog.showMessageBox(vActOpt()?.win ?? undefined!, {
    type: 'error', buttons: ['OK'], message: tr("No se pudo guardar en el Vault"), detail
  })
}

ipcMain.handle('vault:list', () => vault.list())
ipcMain.handle('vault:add', (e, type: VaultItemType, label: string, data: Record<string, string>, secret: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return vault.list()
  vault.add(type, label, data, secret)
  notifyVault(); notifyChatContext()
  return vault.list()
})
ipcMain.handle('vault:remove', (e, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return vault.list()
  vault.remove(id); notifyVault(); notifyChatContext()
  return vault.list()
})
ipcMain.handle('vault:update', (e, id: string, patch: { label?: string; data?: Record<string, string>; secret?: string }) => {
  if (!isInternalSender(e.senderFrame?.url)) return vault.list()
  vault.update(String(id), patch ?? {})
  notifyVault(); notifyChatContext()
  return vault.list()
})
ipcMain.handle('vault:available', () => vault.isAvailable())

/**
 * Devuelve el secreto EN CLARO para enseñarlo en pantalla.
 *
 * Es la única excepción al principio 1 del vault ("el secreto no cruza el IPC"), y es
 * deliberada: un gestor de contraseñas en el que no puedes mirar tu propia contraseña no es
 * un gestor. Decisión de producto, tomada a sabiendas — ver docs/vault-architecture.md.
 *
 * Lo que la acota:
 * - Solo páginas internas (`isInternalSender`), igual que borrar o editar.
 * - **Se pide de una en una y solo al pulsar.** No hay forma de volcar el vault entero: el
 *   listado sigue sin llevar secretos, que es lo que impide un escape accidental.
 * - Nunca se registra. Un `console.log` aquí lo dejaría en disco para siempre.
 * - El renderer lo esconde solo a los 15 s (ver PasswordSection).
 *
 * Lo que NO cambia: el agente sigue sin verlo. Este canal es del preload de páginas internas,
 * al que el modelo no tiene acceso.
 */
ipcMain.handle('vault:reveal', (e, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return null
  return vault.getSecret(String(id))
})

/**
 * Favicons de las credenciales web, por origen.
 *
 * Van aparte y no dentro de `VaultItemMeta.data` a propósito: `data` es lo que se PERSISTE en
 * vault.json, y un icono cacheado no es metadata del secreto — se recalcula solo cuando visitas
 * el sitio. Solo salen los ya conocidos: nunca se le pide el icono a un tercero.
 */
ipcMain.handle('vault:favicons', (e) => {
  if (!isInternalSender(e.senderFrame?.url)) return {}
  return faviconsDelVault()
})

/**
 * Segundos que el secreto vive en el portapapeles antes de borrarse solo.
 *
 * Lo que se copia de aquí es una contraseña: dejarla ahí indefinidamente la expone a lo
 * siguiente que lea el portapapeles, que en macOS es cualquier app. 30 s es de sobra para
 * pegarla y poco para olvidarla.
 */
const CLIP_TTL = 30_000
let clipTimer: NodeJS.Timeout | null = null
/**
 * Copia el secreto al portapapeles DESDE EL MAIN.
 *
 * No hay "ver contraseña" y no es un olvido: el principio del vault es que el secreto no
 * cruza el IPC ni pasa por un renderer (ver docs/vault-architecture.md). Descifrar aquí y
 * escribir directo en el portapapeles lo respeta — el renderer solo se entera de si salió
 * bien. Devuelve booleano, nunca el valor.
 */
ipcMain.handle('vault:copy', (e, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return false
  const secreto = vault.getSecret(String(id))
  if (!secreto) return false
  clipboard.writeText(secreto)
  if (clipTimer) clearTimeout(clipTimer)
  clipTimer = setTimeout(() => {
    clipTimer = null
    // Solo se borra si sigue estando LO QUE COPIAMOS: si el usuario copió otra cosa mientras
    // tanto, vaciarlo le destruiría su portapapeles.
    if (clipboard.readText() === secreto) clipboard.clear()
  }, CLIP_TTL)
  return true
})

// ---- "¿Guardar contraseña?" al enviar un login ----
async function faviconImage(url: string | null): Promise<Electron.NativeImage | undefined> {
  if (!url) return undefined
  try {
    if (url.startsWith('data:')) { const i = nativeImage.createFromDataURL(url); return i.isEmpty() ? undefined : i }
    const res = await net.fetch(url)
    const img = nativeImage.createFromBuffer(Buffer.from(await res.arrayBuffer()))
    return img.isEmpty() ? undefined : img
  } catch { return undefined }
}
ipcMain.on('vault:capture', async (ev, cred: { username: string; password: string }) => {
  const origin = ((): string => { try { return new URL(ev.senderFrame?.url || '').origin } catch { return '' } })()
  if (!origin || !/^https?:/.test(origin) || !cred?.password) return
  const host = origin.replace(/^https?:\/\//, '').replace(/^www\./, '')
  const username = (cred.username || '').trim()
  const existing = vault.findCredential(origin, username)
  // Ya guardada con la misma contraseña → no molestar.
  if (existing && vault.getSecret(existing.id) === cred.password) return
  const t = [...vDe(ev).tabs.values()].find((tb) => tb.view.webContents === ev.sender)
  const icon = await faviconImage(t?.favicon ?? null)
  const update = !!existing
  const { response } = await dialog.showMessageBox(vActOpt()?.win ?? undefined!, {
    type: 'question',
    icon,
    message: update ? tr("¿Actualizar la contraseña de {0}?", host) : tr("¿Guardar la contraseña de {0} en tu Vault?", host),
    detail: cred.username ? `Usuario: ${cred.username}` : tr("Titanio la guardará cifrada."),
    buttons: [tr("Ahora no"), update ? tr("Actualizar") : tr("Guardar")],
    defaultId: 1,
    cancelId: 0,
    noLink: true
  })
  if (response !== 1) return
  try {
    if (existing) vault.update(existing.id, { secret: cred.password })
    else vault.add('web-credential', host, { origin, username }, cred.password)
  } catch (err) { reportVaultError(err); return }
  notifyVault()
})
ipcMain.on('vault:open', (ev, anchor: MenuAnchor) => {
  const w = ensureVaultWin()
  reparentar(w)
  const cb = vDe(ev).win.getContentBounds()
  const x = Math.round(cb.x + (anchor?.x ?? 0) + (anchor?.width ?? 0) - VAULT_W)
  const y = Math.round(cb.y + (anchor?.y ?? 0) + (anchor?.height ?? 0) + 6)
  const mostrar = (): void => {
    if (!vaultWin || vaultWin.isDestroyed()) return
    vaultWin.setBounds({ x: Math.max(cb.x + 8, x), y, width: VAULT_W, height: VAULT_H })
    vaultWin.webContents.send('vault:items', vault.list(), faviconsDelVault())
    vaultWin.show(); vaultWin.focus()
  }
  if (vaultPintado) mostrar()
  else w.once('ready-to-show', mostrar)
})
ipcMain.on('vault:closeWindow', () => { if (vaultWin && !vaultWin.isDestroyed()) vaultWin.hide() })
// "Gestionar" cae en la sección Password, no en el índice de Settings: antes te dejaba en
// General y había que buscar dónde estaba lo que acababas de pedir.
ipcMain.on('vault:manage', () => {
  if (vaultWin && !vaultWin.isDestroyed()) vaultWin.hide()
  openSettings('password')
})

// ---- Omnibox: ventana nativa del dropdown de sugerencias (flota sobre la página) ----
// focusable:false → clicks no le roban el foco al input del chrome; la página no se toca.
let lastOmniData: unknown = null
const omniPopover = createPopover(() => vActOpt()?.win ?? null, {
  // width solo es el ancho con el que nace la ventana (para que el renderer no mida a
  // 24px); el real lo pone el anchor en cada show.
  name: 'omni', width: 420, widthFromAnchor: true, offsetY: -2,
  focusable: false, // los clicks no le roban el foco al input del chrome
  preload: 'omnibox', page: 'omnibox',
  data: { channel: 'omni:data', get: () => lastOmniData }
}, RENDERER_URL)
function hideOmni(): void { omniPopover.hide() }
ipcMain.on('omni:show', (_e, rect: MenuAnchor, data) => {
  lastOmniData = data
  omniPopover.show(rect)
})
ipcMain.on('omni:update', (_e, data) => { lastOmniData = data; omniPopover.send('omni:data', data) })
ipcMain.on('omni:hide', hideOmni)
ipcMain.on('omni:choose', (_e, i: number) => vActOpt()?.win?.webContents.send('omni:chosen', i))
ipcMain.on('omni:hover', (_e, i: number) => vActOpt()?.win?.webContents.send('omni:hovered', i))

// ---- Petición de permiso: popover anclado al pill del dominio ----
/**
 * Un `dialog.showMessageBox` para pedir la cámara es una caja del sistema, centrada, que
 * detiene la ventana entera y no se parece a nada de lo que hay alrededor. Y sobre todo:
 * aparece lejos del sitio donde ese permiso vive después (el pill del dominio), así que no
 * enseña dónde volver a cambiarlo.
 *
 * Aquí se pregunta donde el usuario está mirando. El main no sabe dónde cae el pill —eso es
 * DOM del chrome—, así que se lo pregunta: manda `perm:ask` y el chrome contesta con el rect
 * por `perm:anchor`. Si no contesta (ventana oculta, chrome aún cargando), se resuelve
 * `unavailable` y permissions.ts cae al diálogo de siempre.
 */
interface PermPendiente {
  data: PermAskData
  resolve: (r: boolean | 'dismissed' | 'unavailable') => void
  respondido: boolean
  /** La ventana que pregunta: es donde se ancla el popover. */
  ventana: Ventana
}
let permPend: PermPendiente | null = null

/**
 * El popover cuelga de la ventana QUE PIDE el permiso, no de la activa.
 *
 * Con varias ventanas abiertas no son lo mismo: anclarlo a la activa pondría el panel sobre
 * un chrome que no es el del sitio que pregunta, señalando el dominio equivocado.
 */
const permPopover = createPopover(() => permPend?.ventana.win ?? vActOpt()?.win ?? null, {
  name: 'permask', width: 320, height: 132,
  preload: 'permask', page: 'permask',
  align: 'left',
  data: { channel: 'permask:data', get: () => permPend?.data ?? null },
  onHide: () => {
    // Cerrado sin pulsar nada: se deniega esta vez, sin recordar nada.
    if (permPend && !permPend.respondido) {
      const p = permPend
      permPend = null
      p.resolve('dismissed')
    }
  }
}, RENDERER_URL)

function askPermission(
  origin: string,
  keys: PermKey[],
  label: string,
  wc: WebContents | null
): Promise<boolean | 'dismissed' | 'unavailable'> {
  /**
   * Se busca la ventana donde vive la pestaña que pide el permiso, y se exige que sea la
   * pestaña ACTIVA de ESA ventana.
   *
   * Anclar al pill el permiso de una pestaña de fondo señalaría un dominio que no es el que
   * pregunta; y con varias ventanas, mirar solo la activa global fallaría en cuanto la
   * petición viniera de otra.
   */
  const ventana = wc
    ? [...ventanas.values()].find((v) => v.tabActiva()?.view.webContents.id === wc.id)
    : undefined
  if (!ventana || permPend) return Promise.resolve('unavailable')

  let domain = origin
  try { domain = new URL(origin).hostname.replace(/^www\./, '') } catch { /* origen raro: se muestra tal cual */ }

  return new Promise((resolve) => {
    permPend = { data: { domain, label, keys }, resolve, respondido: false, ventana }
    // El chrome contesta con el rect del pill; si no lo hace, no dejamos la petición colgada.
    const timer = setTimeout(() => {
      // Se descarta también el anclaje: si el chrome contesta tarde, mostraría un popover
      // huérfano —sin petición viva— y el usuario vería un panel vacío.
      anclaPermiso = null
      if (permPend && !permPend.respondido) {
        const p = permPend
        permPend = null
        p.resolve('unavailable')
      }
    }, 1500)
    anclaPermiso = (anchor) => { clearTimeout(timer); permPopover.show(anchor) }
    ventana.win.webContents.send('perm:ask')
  })
}

/** Lo rellena `askPermission` mientras espera el rect del chrome. */
let anclaPermiso: ((anchor: MenuAnchor) => void) | null = null
ipcMain.on('perm:anchor', (_e, anchor: MenuAnchor) => {
  const f = anclaPermiso
  anclaPermiso = null
  f?.(anchor)
})
ipcMain.on('permask:answer', (_e, granted: boolean) => {
  const p = permPend
  if (!p) return
  p.respondido = true
  permPend = null
  permPopover.hide()
  p.resolve(!!granted)
})

// ---- Site info: popup nativo de info/permisos del sitio (anclado al pill del dominio) ----
function activeUrl(): string {
  const t = vAct().tabActiva()
  return t?.url || ''
}
function buildSiteInfo(): SiteInfoData {
  const url = activeUrl()
  let origin = '', domain = ''
  // Sin URL parseable no hay origen ni dominio: es una página interna o about:blank,
  // y buildSiteInfo ya lo trata como `internal`. No hay nada que reportar.
  try { const u = new URL(url); origin = u.origin; domain = u.hostname.replace(/^www\./, '') } catch { /* url no parseable: interna */ }
  const internal = isInternal(url) || !origin
  const secure = /^https:\/\//i.test(url)
  const permissions = internal ? [] : requestedKeys(origin).map((key) => ({ key, state: stateOf(origin, key) }))
  // El bloqueo "en este sitio" es el global menos la excepción del usuario: dos cosas
  // distintas que en el popover se ven como un solo interruptor, que es como se piensan.
  const ab = adblockState()
  const excluido = ab.allow.some((a) => domain === a || domain.endsWith('.' + a))
  const tab = vAct().tabActiva()
  return {
    url, origin, domain, secure, internal, permissions,
    adblockOn: ab.enabled && !excluido,
    adblockBlocked: tab ? adblockCountFor(tab.view.webContents.id) : 0
  }
}
const sitePopover = createPopover(() => vActOpt()?.win ?? null, {
  name: 'siteinfo', width: 340, height: 200,
  preload: 'siteinfo', page: 'siteinfo',
  data: { channel: 'siteinfo:data', get: buildSiteInfo }
}, RENDERER_URL)
ipcMain.on('siteinfo:open', (_e, anchor: MenuAnchor) => sitePopover.show(anchor))
ipcMain.on('siteinfo:toggle', (_e, key: PermKey, state: PermState) => {
  try {
    setState(new URL(activeUrl()).origin, key, state)
  } catch (e) {
    // El interruptor vuelve a su sitio solo, porque abajo se reenvía el estado REAL.
    console.error(`[permisos] no se pudo poner ${key}=${state} en ${activeUrl()}:`, e instanceof Error ? e.message : e)
  }
  sitePopover.send('siteinfo:data', buildSiteInfo())
})
ipcMain.on('siteinfo:adblock', (ev, on: boolean) => {
  const { domain } = buildSiteInfo()
  // Aquí se invierte a propósito: el interruptor dice "bloquear aquí", y lo que se guarda es
  // la EXCEPCIÓN. Apagarlo = añadir el dominio a la allowlist.
  if (domain) setAdblockAllowed(domain, !on)
  sitePopover.send('siteinfo:data', buildSiteInfo())
  // Recargar es parte de la acción: los recursos ya bloqueados no vuelven solos, y el usuario
  // que desactiva el bloqueo lo hace porque la página está rota AHORA.
  const t = vDe(ev).tabActiva()
  t?.view.webContents.reload()
})
ipcMain.on('siteinfo:clear', async () => {
  // "Borrar datos del sitio" es una acción de privacidad: si no se borró, hay que decirlo.
  // Callarlo es dejar al usuario creyendo que sus datos ya no están.
  try {
    await session.fromPartition(vAct().particion).clearStorageData({ origin: new URL(activeUrl()).origin })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error('[siteinfo] no se pudieron borrar los datos de', activeUrl(), detail)
    dialog.showMessageBox(vActOpt()?.win ?? undefined!, {
      type: 'error', buttons: ['OK'],
      message: tr("No se pudieron borrar los datos del sitio"), detail
    })
  }
  sitePopover.hide()
})

// ---- Permisos de sitios: la vista global, desde Settings ----
// Solo para páginas internas: son datos de navegación del usuario, no algo que una web deba
// poder leer ni tocar (misma regla que bookmarks o downloads). Hasta ahora un permiso solo se
// veía desde el candado de SU sitio: para revocar la cámara había que volver a entrar en la
// página que la pidió.
/**
 * Los favicons se sirven de la caché, que es instantánea. Resolver el de un sitio no visitado
 * implica pedirle su HTML y puede tardar segundos: si se hiciera siempre, la lista entera
 * esperaría al más lento. Por eso son dos pasadas — la página pinta con lo que hay y vuelve
 * a pedirla con `resolve` para completar los que falten.
 */
ipcMain.handle('perms:list', async (e, resolve?: boolean) => {
  if (!isInternalSender(e.senderFrame?.url)) return []
  const sites = allSites()
  if (resolve) await Promise.all(sites.filter((s) => !faviconFor(s.origin)).map((s) => resolveFavicon(s.origin)))
  return sites.map((s) => ({ ...s, favicon: faviconFor(s.origin) }))
})
ipcMain.handle('perms:set', (e, origin: string, key: PermKey, state: PermState) => {
  if (!isInternalSender(e.senderFrame?.url)) return false
  setState(origin, key, state)
  // Si el candado del sitio está abierto, se quedaría mostrando el estado viejo.
  sitePopover.send('siteinfo:data', buildSiteInfo())
  return true
})
ipcMain.handle('perms:clear', (e, origin: string | null) => {
  if (!isInternalSender(e.senderFrame?.url)) return false
  if (origin) clearOrigin(origin)
  else clearAllOrigins()
  sitePopover.send('siteinfo:data', buildSiteInfo())
  return true
})

/** Lo que necesita el menú de perfil: quién eres ahora y entre quiénes puedes elegir. */
function datosMenuPerfil(): DatosMenuPerfil {
  const activo = perfilActivoId()
  return {
    perfil: getProfile(),
    perfiles: listaPerfiles().map((p) => ({ ...p, activo: p.id === activo }))
  }
}

/**
 * Cambia de perfil REINICIANDO la app.
 *
 * Es la consecuencia de "un solo perfil activo": media docena de módulos leen su JSON una única
 * vez al arrancar, y cambiarlos en caliente pediría inventar un `reinit` en cada uno. La sesión
 * de pestañas se guarda antes de salir y cada perfil restaura la suya, así que no se pierde nada.
 */
function cambiarDePerfil(id: string): void {
  if (!activarPerfil(id)) {
    console.error('[perfiles] se pidió activar un perfil que no existe:', id)
    return
  }
  saveSessionNow()
  app.relaunch()
  app.quit()
}

// ---- Menú de perfil: ventana nativa (flota sobre la página) ----
const pmPopover = createPopover(() => vActOpt()?.win ?? null, {
  name: 'profilemenu', width: 240, height: 395,
  side: 'top',
  preload: 'profilemenu', page: 'profilemenu',
  data: { channel: 'profilemenu:profile', get: datosMenuPerfil },
  // El submenú es una ventana aparte: si el menú se va, se va con él.
  onHide: () => submenuPopover.hide(),
  // Mientras el submenú esté abierto, perder el foco NO cierra el menú: se lo ha llevado él.
  keepOnBlur: () => submenuPopover.isVisible()
}, RENDERER_URL)
/**
 * El anchor llega en coordenadas de QUIEN lo manda, y el popover lo coloca contra la ventana
 * principal. Desde el chrome coinciden; desde el peek —que es otra ventana, flotando con su
 * margen— no, y el menú salía desplazado esos píxeles. Se traduce aquí en vez de en la factoría
 * porque es el peek quien es raro, no los popovers.
 */
function anchorDelPeek(ev: Electron.IpcMainEvent, anchor: MenuAnchor): MenuAnchor {
  const padre = vActOpt()?.win
  if (!padre || !peekWin || peekWin.isDestroyed() || ev.sender !== peekWin.webContents) return anchor
  const pb = peekWin.getContentBounds()
  const cb = padre.getContentBounds()
  return { ...anchor, x: pb.x + anchor.x - cb.x, y: pb.y + anchor.y - cb.y }
}
ipcMain.on('profilemenu:open', (ev, anchor: MenuAnchor) => pmPopover.show(anchorDelPeek(ev, anchor)))
// Anticipa el primer clic sin mostrar ni enfocar la ventana.
ipcMain.on('profilemenu:warm', () => { if (vActOpt()) pmPopover.ensure() })
/**
 * Se precalienta solo ESTE popover, y con retraso.
 *
 * Medido: la primera apertura tardaba 291 ms en tener contenido y las siguientes 13 ms — el
 * coste no es abrir la ventana, es arrancar su renderer. Precalentarlos TODOS al inicio ya se
 * probó y se descartó (344 MB, ver docs/popovers.md); este es el único que se abre de verdad en
 * cada sesión, así que paga su renderer. Los 4 s son para no competir con el arranque.
 */
setTimeout(() => { if (vActOpt()) pmPopover.ensure() }, 4000).unref?.()

// ---- Peek del sidebar (hover del botón expandir con el sidebar colapsado) ----
let peekWin: BrowserWindow | null = null
const PEEK_W = 310 // el peek es el mismo sidebar flotando: sigue a SIDEBAR_DEFAULT
const PEEK_MARGIN = 10 // separación del borde/topbar para que se vea flotante
const PEEK_HIT_PAD = 26 // margen de "sigue vivo" alrededor del botón/panel
const PEEK_GRACE = 240 // coyote time al salir (ms)
let peekButtonRect: { x: number; y: number; w: number; h: number } | null = null
let peekPoll: NodeJS.Timeout | null = null
let peekLastInside = 0
let peekOpenTimer: NodeJS.Timeout | null = null
let lastCollapseAt = 0
function ensurePeekWin(): BrowserWindow {
  if (peekWin && !peekWin.isDestroyed()) return peekWin
  peekWin = new BrowserWindow({
    parent: vActOpt()?.win!, width: PEEK_W, height: 200, show: false, frame: false, transparent: true,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, hasShadow: false, skipTaskbar: true, backgroundColor: '#00000000',
    acceptFirstMouse: true, // clicks funcionan sin activar la ventana (no roba foco)
    webPreferences: { preload: join(__dirname, '../preload/peekbar.js'), contextIsolation: true, sandbox: false }
  })
  if (RENDERER_URL) peekWin.loadURL(`${RENDERER_URL}/peekbar.html`)
  else peekWin.loadFile(join(__dirname, '../renderer/peekbar.html'))
  return peekWin
}
/**
 * El peek se coloca contra la ventana que lo pidió, no contra la enfocada: se abre al pasar el
 * ratón por encima, y en macOS el ratón puede estar sobre una ventana que no tiene el foco.
 */
let peekVentanaId: number | null = null
function placePeekWin(): void {
  const v = (peekVentanaId != null ? ventanas.get(peekVentanaId) : null) ?? vActOpt()
  if (!peekWin || peekWin.isDestroyed() || !v) return
  const cb = v.win.getContentBounds()
  // Del topbar hasta abajo, pegado a la izquierda. El margen "flotante" lo da el padding
  // del propio panel (CSS); la ventana ocupa desde debajo del topbar hasta el fondo.
  peekWin.setBounds({
    x: Math.round(cb.x),
    y: Math.round(cb.y + TOPBAR_HEIGHT),
    width: PEEK_W + PEEK_MARGIN * 2,
    height: Math.max(1, Math.round(cb.height - TOPBAR_HEIGHT))
  })
}
/**
 * Esconde el peek, pero no de golpe: avisa al renderer para que se retraiga y esconde la
 * ventana cuando la animación ha terminado. Sin esto la ventana desaparece en seco y no hay
 * salida que animar (una ventana oculta no pinta nada).
 */
const PEEK_OUT_MS = 140
let peekHideTimer: NodeJS.Timeout | null = null

function hidePeek(): void {
  if (peekOpenTimer) { clearTimeout(peekOpenTimer); peekOpenTimer = null }
  // El sondeo del cursor se para YA: mientras se retrae no debe volver a abrirse sola.
  if (peekPoll) { clearInterval(peekPoll); peekPoll = null }
  if (!peekWin || peekWin.isDestroyed() || !peekWin.isVisible()) return
  if (peekHideTimer) return // ya se está retrayendo
  peekWin.webContents.send('peek:closing')
  peekHideTimer = setTimeout(() => {
    peekHideTimer = null
    if (!peekWin || peekWin.isDestroyed() || !peekWin.isVisible()) return
    const hadFocus = peekWin.isFocused()
    peekWin.hide()
    if (hadFocus) vActOpt()?.win?.focus() // devuelve el foco al navegador
  }, PEEK_OUT_MS)
}
// El cursor está sobre el botón o el panel (con margen para cruzar el hueco entre ambos).
function cursorNearPeek(px: number, py: number): boolean {
  const pad = PEEK_HIT_PAD
  if (peekWin && !peekWin.isDestroyed()) {
    const b = peekWin.getBounds()
    if (px >= b.x - pad && px <= b.x + b.width + pad && py >= b.y - pad && py <= b.y + b.height + pad) return true
  }
  const r = peekButtonRect
  if (r && px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad) return true
  return false
}
/**
 * ¿Hay un menú abierto POR ENCIMA del peek?
 *
 * El peek abre menús desde su propio sidebar (el de perfil, con su submenú). Esos menús son
 * ventanas nativas que se cierran al perder el foco, así que mientras estén abiertos el peek no
 * puede ni robarles el foco ni retirarse debajo de ellos.
 */
function menuSobreElPeek(): boolean {
  return pmPopover.isVisible() || submenuPopover.isVisible()
}

// Sondea la posición del cursor (fiable entre 2 ventanas) — coyote time al salir.
function startPeekPoll(): void {
  peekLastInside = Date.now()
  if (peekPoll) clearInterval(peekPoll)
  peekPoll = setInterval(() => {
    /**
     * El bug: abrir el menú de perfil desde el peek lo enseñaba y lo quitaba al instante.
     *
     * No era del menú. Es este sondeo: 60 ms después de abrirlo, el cursor sigue dentro del
     * área del peek, así que le devolvía el foco — y el menú, que se cierra al perder el foco,
     * se cerraba solo. Mientras haya un menú abierto, el peek se queda quieto y se da por
     * "dentro", o además se retiraría por debajo del menú a los PEEK_GRACE ms.
     */
    if (menuSobreElPeek()) { peekLastInside = Date.now(); return }
    const p = screen.getCursorScreenPoint()
    if (cursorNearPeek(p.x, p.y)) peekLastInside = Date.now()
    else if (Date.now() - peekLastInside > PEEK_GRACE) { hidePeek(); return }
    // Al ENTRAR al panel lo activamos: macOS no entrega mouse-move a ventanas inactivas,
    // y sin eso el :hover del CSS (close buttons, filas) no funciona. Se muestra inactivo
    // para no robar el click del botón de expandir, y se activa solo al entrar en él.
    if (peekWin && !peekWin.isDestroyed() && peekWin.isVisible() && !peekWin.isFocused()) {
      const b = peekWin.getBounds()
      if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) peekWin.focus()
    }
  }, 60)
}
function showPeekNow(): void {
  // Si volvió el ratón mientras se retraía, se cancela la retirada y entra otra vez.
  if (peekHideTimer) { clearTimeout(peekHideTimer); peekHideTimer = null }
  const w = ensurePeekWin()
  const vp = (peekVentanaId != null ? ventanas.get(peekVentanaId) : null) ?? vAct()
  reparentar(w, vp)
  vp.pushState() // refresca el <Sidebar/> del peek con el estado actual
  placePeekWin()
  w.showInactive() // NO roba el foco: el botón de expandir sigue clickeable y sin resaltar items
  w.webContents.send('peek:shown') // dispara la animación de entrada
  startPeekPoll()
}
ipcMain.on('peek:show', (ev, anchor: MenuAnchor) => {
  if (!vDe(ev).isCollapsed()) return // solo tiene sentido con el sidebar colapsado
  // Al colapsar, el botón de expandir aparece justo debajo del cursor y dispara un
  // mouseenter falso: ignoramos el hover inmediatamente después de colapsar.
  if (Date.now() - lastCollapseAt < 600) return
  peekVentanaId = vDe(ev).id
  const cb = vDe(ev).win.getContentBounds()
  peekButtonRect = { x: cb.x + anchor.x, y: cb.y + anchor.y, w: anchor.width, h: anchor.height }
  if (peekWin && !peekWin.isDestroyed() && peekWin.isVisible()) {
    // Puede estar VISIBLE pero retrayéndose: si el ratón vuelve ahora hay que cancelar la
    // retirada y volver a entrar. Sin esto el peek se escondía igual aunque hubieras vuelto,
    // porque este atajo se saltaba `showPeekNow`, que es donde se cancela.
    if (peekHideTimer) {
      clearTimeout(peekHideTimer)
      peekHideTimer = null
      peekWin.webContents.send('peek:shown') // vuelve a entrar deslizándose
    }
    startPeekPoll()
    return
  }
  // Hover intent: solo abrir si el cursor sigue sobre el botón tras un instante.
  if (peekOpenTimer) clearTimeout(peekOpenTimer)
  peekOpenTimer = setTimeout(() => {
    peekOpenTimer = null
    const r = peekButtonRect
    if (!r || !vDe(ev).isCollapsed()) return
    const p = screen.getCursorScreenPoint()
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) showPeekNow()
  }, 180)
})
ipcMain.on('peek:hide', hidePeek)
/**
 * Passkeys (WebAuthn) con el autenticador de plataforma de macOS (Touch ID / Secure Enclave).
 * Sin esto, `isUserVerifyingPlatformAuthenticatorAvailable()` devuelve false y los sitios
 * no ofrecen passkey. Requiere que la app esté FIRMADA con el entitlement
 * `keychain-access-groups` que incluya este mismo grupo (ver build/entitlements.mac.plist).
 */
const BUNDLE_ID = 'com.titanio.app'
/**
 * El equipo con el que se firmaría: el PERSONAL (`MRWANXY92L`), no el de la organización.
 *
 * No se usa por defecto a propósito. Firmar con este equipo y el entitlement
 * `keychain-access-groups` **impide que la app arranque**: es un entitlement restringido y
 * macOS solo lo concede con un `embedded.provisionprofile` que lo autorice. Medido: la app
 * firmada moría al lanzar, sin mensaje (AMFI), y solo se veía "Titanio no se puede abrir".
 *
 * Cuando exista el perfil de aprovisionamiento, esto pasa a ser el valor por defecto.
 * Ver docs/pendiente-passkeys-firma.md.
 */
const TEAM_ID = 'MRWANXY92L'
function configurePasskeys(): void {
  if (!isMac || typeof app.configureWebAuthn !== 'function') return
  /**
   * Hace falta pedirlo explícitamente con `MONPER_TEAM_ID`.
   *
   * Ni en `dev` (el binario de Electron no lleva nuestro entitlement) ni en un build ad-hoc
   * (sin equipo) el grupo de llavero es válido. Configurarlo igual no es neutral: se le
   * estaría diciendo a Chromium que use un autenticador que no puede abrir el llavero, y eso
   * deja WebAuthn roto en vez de simplemente ausente.
   */
  const teamId = process.env['TITANIO_TEAM_ID']
  if (!teamId) {
    console.log(`[passkeys] deshabilitadas: requieren firmar con ${TEAM_ID} + provisioning profile (ver docs/pendiente-passkeys-firma.md).`)
    return
  }
  try {
    app.configureWebAuthn({
      touchID: {
        keychainAccessGroup: `${teamId}.${BUNDLE_ID}.webauthn`,
        promptReason: 'verificar tu identidad en $1'
      }
    })
    console.log('[passkeys] Touch ID habilitado para WebAuthn.')
  } catch (e) {
    console.log('[passkeys] No se pudo habilitar Touch ID:', e instanceof Error ? e.message : e)
  }
}

// ---- Rutinas (vigilar páginas y avisar) ----
function broadcastRoutines(): void {
  const list = listRoutines()
  paraPaginas('/settings.html', 'routines:changed', list)
}
ipcMain.handle('routines:list', (e) => (isInternalSender(e.senderFrame?.url) ? listRoutines() : []))
ipcMain.handle('routines:create', async (e, input: { url: string; request: string; minutes: number }) => {
  if (!isInternalSender(e.senderFrame?.url)) return { ok: false, error: tr("No permitido.") }
  try {
    await createWatchRoutine(input)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})
ipcMain.on('routines:toggle', (e, id: string, on: boolean) => { if (isInternalSender(e.senderFrame?.url)) setRoutineEnabled(id, on) })
ipcMain.on('routines:remove', (e, id: string) => { if (isInternalSender(e.senderFrame?.url)) removeRoutineEntry(id) })
ipcMain.on('routines:run', (e, id: string) => { if (isInternalSender(e.senderFrame?.url)) void runRoutine(id) })

// ---- Extensiones de Chrome (ventana nativa de gestión) ----
let extInstalling = false
/** Estado que ve la ventana de extensiones: lo instalado + si la pestaña activa es la store. */
function extensionsData(): unknown {
  const items = listExtensions()
  // ¿La pestaña activa es la página de una extensión en la Chrome Web Store?
  const url = vAct().tabActiva()?.url ?? ''
  const isStore = /chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(url)
  const id = isStore ? extensionIdFrom(url) : null
  return {
    items,
    storeCandidate: id ? { id, installed: items.some((e) => e.path.endsWith(id)) } : null,
    installing: extInstalling
  }
}
const extPopover = createPopover(() => vActOpt()?.win ?? null, {
  name: 'extensions', width: 320, height: 240, align: 'center',
  preload: 'extensionswin', page: 'extensions',
  data: { channel: 'extensions:data', get: extensionsData }
}, RENDERER_URL)
function sendExtensions(): void { extPopover.send('extensions:data', extensionsData()) }
ipcMain.on('extensions:open', (_e, anchor: MenuAnchor) => extPopover.show(anchor))
ipcMain.on('extensions:toggle', async (_e, path: string, enabled: boolean) => {
  await setExtensionEnabled(path, enabled)
  sendExtensions()
})
ipcMain.on('extensions:remove', (_e, path: string) => { removeExt(path); sendExtensions() })

// Popup propio de la extensión (el que Chrome abre al clicar su icono).
let extPopupWin: BrowserWindow | null = null
function openExtensionPopup(path: string): void {
  const ui = extensionUi(path)
  if (!ui?.popup) return
  if (extPopupWin && !extPopupWin.isDestroyed()) extPopupWin.destroy()
  const cb = vAct().win.getContentBounds()
  extPopupWin = new BrowserWindow({
    parent: vActOpt()?.win!, width: 400, height: 600, show: false, frame: false,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, roundedCorners: true, backgroundColor: '#ffffff',
    x: Math.round(cb.x + cb.width - 420), y: Math.round(cb.y + TOPBAR_HEIGHT),
    webPreferences: { partition: PARTICION_NORMAL, contextIsolation: true, sandbox: false }
  })
  extPopupWin.on('blur', () => { if (extPopupWin && !extPopupWin.isDestroyed()) extPopupWin.destroy() })
  extPopupWin.loadURL(ui.popup)
  extPopupWin.once('ready-to-show', () => extPopupWin?.show())
}
ipcMain.on('extensions:openPopup', (_e, path: string) => {
  extPopover.hide()
  openExtensionPopup(path)
})
// Menú "…" de una extensión: sus opciones + acciones del navegador.
ipcMain.on('extensions:menu', (ev, path: string) => {
  const ui = extensionUi(path)
  const items: MenuItemConstructorOptions[] = [
    { label: tr("Abrir"), enabled: !!ui?.popup, click: () => { extPopover.hide(); openExtensionPopup(path) } },
    { label: tr("Opciones"), enabled: !!ui?.options, click: () => { extPopover.hide(); if (ui?.options) vDe(ev).createTab(ui.options) } },
    { type: 'separator' },
    { label: tr("Quitar de Titanio"), click: () => { removeExt(path); sendExtensions() } }
  ]
  Menu.buildFromTemplate(items).popup({ window: extPopover.window ?? vActOpt()?.win! })
})
ipcMain.on('extensions:browseStore', (ev) => {
  vDe(ev).createTab('https://chromewebstore.google.com/category/extensions')
  extPopover.hide()
})
ipcMain.on('extensions:installFromStore', async (ev) => {
  // La petición puede venir del popup del puzzle o del botón inyectado en la Store.
  const fromTab = [...vDe(ev).tabs.values()].find((t) => t.view.webContents === ev.sender)
  const url = fromTab?.url || (vDe(ev).tabActiva()?.url ?? '')
  extInstalling = true; sendExtensions()
  const r = await installFromStore(url)
  extInstalling = false; sendExtensions()
  // Avisa al botón de la página (si de ahí vino) para que muestre el resultado.
  if (fromTab && !fromTab.view.webContents.isDestroyed()) {
    fromTab.view.webContents.send('extensions:installResult', r)
  }
  if (!r.ok && r.error) {
    const parent = extPopover.isVisible() ? extPopover.window : vActOpt()?.win
    dialog.showMessageBox(parent!, {
      type: 'error', buttons: ['OK'],
      message: tr("No se pudo añadir la extensión"),
      detail: r.error
    })
  } else if (r.ok) {
    new Notification({ title: tr("Extensión añadida"), body: r.name ?? 'Listo' }).show()
  }
})
async function importarExtensionDesdeCarpeta(): Promise<void> {
  const parent = extPopover.window ?? vActOpt()?.win
  const res = await dialog.showOpenDialog(parent!, {
    title: tr("Elige la carpeta de la extensión"),
    properties: ['openDirectory']
  })
  const dir = res.filePaths?.[0]
  if (!dir) return
  const r = await addExtension(dir)
  sendExtensions()
  if (!r.ok && r.error) {
    dialog.showMessageBox(parent!, { type: 'error', message: tr("No se pudo añadir la extensión"), detail: r.error, buttons: ['OK'] })
  }
}
ipcMain.on('extensions:installFromFolder', () => void importarExtensionDesdeCarpeta())

// ---- Quick sign-in: "Sign in with…" al detectar un login con credenciales guardadas ----
const SIGNIN_W = 360
let signinTabId: number | null = null
let signinCreds: unknown = null
const signinDismissed = new Set<string>() // orígenes descartados en esta sesión
const signinPopover = createPopover(() => vActOpt()?.win ?? null, {
  name: 'signin', width: SIGNIN_W, height: 160,
  focusable: false, // aparece sobre la página sin robarle el foco al formulario
  preload: 'signin', page: 'signin',
  data: { channel: 'signin:credentials', get: () => signinCreds }
}, RENDERER_URL)
/**
 * Este no cuelga de ningún botón: va en la esquina del área de contenido. La factoría
 * posiciona respecto a un anchor, así que se le pasa uno sintético — el desplazamiento del
 * panel (PAD) lo compensa el +12 de la x.
 */
function showSignin(): void {
  const cb = vAct().contentBounds()
  signinPopover.show({ x: cb.x + 16 + 12, y: cb.y + 12, width: 0, height: 0 })
}
function hideSignin(): void { signinTabId = null; signinPopover.hide() }
ipcMain.on('autofill:loginForm', (ev, hasForm: boolean) => {
  const entry = [...vDe(ev).tabs.entries()].find(([, t]) => t.view.webContents === ev.sender)
  if (!entry) return
  const [id, t] = entry
  if (!hasForm) { if (signinTabId === id) hideSignin(); return }
  if (id !== vDe(ev).activeId()) return
  const origin = ((): string => { try { return new URL(t.url).origin } catch { return '' } })()
  if (!origin || signinDismissed.has(origin)) return
  const creds = credentialsFor(origin)
  if (!creds.length) return
  signinTabId = id
  signinCreds = creds
  showSignin()
})
ipcMain.on('signin:fill', async (ev, itemId: string) => {
  const t = signinTabId != null ? vDe(ev).tabs.get(signinTabId) : null
  hideSignin()
  if (t) await fillFromVault(t.view.webContents, itemId) // el secreto nunca sale del main
})
ipcMain.on('signin:dismiss', (ev) => {
  const t = signinTabId != null ? vDe(ev).tabs.get(signinTabId) : null
  // Si la URL no es parseable no hay origen que recordar; el popup ya se cierra igual.
  if (t) { try { signinDismissed.add(new URL(t.url).origin) } catch { /* sin origen: no se recuerda */ } }
  hideSignin()
})

// `profilemenu:close` lo maneja la factoría de popovers.

// ---- Submenús del menú de perfil ----
/**
 * Ventana propia, no un div dentro del menú: el submenú sale FUERA del panel y la vista de la
 * página se dibuja encima del DOM. `focusable: false` a propósito — si robara el foco, el
 * menú padre se cerraría por su `blur`.
 */
let submenuSección: SubmenuSection = 'downloads'

function datosSubmenu(): SubmenuData {
  switch (submenuSección) {
    case 'downloads': {
      const estado = (d: { state: string }): string =>
        d.state === 'completed' ? 'Descargado' : d.state === 'progressing' ? 'Descargando…' : 'Cancelado'
      return {
        section: 'downloads',
        rows: [
          { id: 'all', label: tr("Show all downloads"), icon: 'download', action: 'downloads:all', primary: true },
          ...listDownloads().slice(0, 8).map((d) => ({
            id: d.id,
            label: d.filename,
            sub: estado(d),
            icon: 'file' as const,
            action: `downloads:open:${d.id}`
          }))
        ]
      }
    }
    case 'extensions': {
      const items = listExtensions()
      return {
        section: 'extensions',
        listLabel: items.length ? 'Installed extensions' : undefined,
        rows: [
          { id: 'manage', label: tr("Manage all extensions"), icon: 'puzzle', action: 'extensions:manage', primary: true },
          { id: 'import', label: tr("Import extensions"), icon: 'download', action: 'extensions:import', primary: true },
          ...items.map((e) => ({
            id: e.path,
            label: e.name,
            image: e.icon ?? null,
            action: `extensions:open:${e.path}`
          }))
        ]
      }
    }
    case 'bookmarks': {
      const items = conFavicon(listBookmarks())
      return {
        section: 'bookmarks',
        // Los 12 primeros son un atajo, no la lista: con 79 marcadores importados hacía falta
        // una puerta al gestor, igual que en historial.
        rows: [
          { id: 'todos', label: tr("Gestionar marcadores"), icon: 'bookmark' as const, meta: '⌘⌥B', action: 'bookmarks:all', primary: true },
          ...items.slice(0, 12).map((b) => ({
          id: b.id,
          label: b.title || b.url,
          image: b.favicon ?? null,
          icon: 'bookmark' as const,
          action: `bookmarks:open:${b.id}`
        }))
        ]
      }
    }
    case 'history': {
      return {
        section: 'history',
        // `primary` es la fila de cabecera que ya usan otros submenús. Los 10 recientes son
        // un atajo, no el historial: sin esta fila no había forma de llegar a la lista
        // completa desde la UI.
        rows: [
          { id: 'todo', label: tr("Ver todo el historial"), icon: 'history' as const, meta: '⌘Y', action: 'history:all', primary: true },
          ...historyRecent(10).map((h) => ({
          id: h.url,
          label: h.title || h.url,
          sub: (() => { try { return new URL(h.url).hostname.replace(/^www\./, '') } catch { return '' } })(),
          image: h.favicon ?? null,
          icon: 'history' as const,
          action: `history:open:${h.url}`
        }))
        ]
      }
    }
    case 'developers': {
      const r = remoteState()
      return {
        section: 'developers',
        listLabel: 'Advanced',
        rows: [
          { id: 'devtools', label: tr("Developer tools"), icon: 'code', meta: '⌥⌘I', action: 'dev:devtools', primary: true },
          { id: 'reload', label: tr("Recargar sin caché"), icon: 'gauge', meta: '⇧⌘R', action: 'dev:hardReload', primary: true },
          {
            id: 'remote',
            label: tr("Remote debugging"),
            sub: r.enabled ? `Escuchando en 127.0.0.1:${r.port}` : 'Deja que una IA externa controle el navegador',
            toggle: true,
            on: r.enabled,
            action: 'dev:remote'
          },
          ...(r.enabled
            ? [{ id: 'token', label: tr("Copiar token de acceso"), icon: 'code' as const, action: 'dev:copyToken' }]
            : [])
        ]
      }
    }
  }
}

const submenuPopover = createPopover(() => vActOpt()?.win ?? null, {
  name: 'profilesubmenu', width: 300, height: 180,
  offsetY: 0,
  activateOnShow: false, // se abre con el ratón aún sobre el padre; ver el sondeo de abajo
  preload: 'profilesubmenu', page: 'profilesubmenu',
  data: { channel: 'profilesubmenu:data', get: datosSubmenu },
  // Al cerrarse el hijo, el padre solo sobrevive si tiene el foco (volviste a él). Si el
  // foco se fue a otra parte, se cierran los dos: es un menú, no dos ventanas sueltas.
  onHide: () => {
    pararSondeoSubmenu()
    const pm = pmPopover.window
    if (pm && !pm.isDestroyed() && pm.isVisible() && !pm.isFocused()) pmPopover.hide()
  }
}, RENDERER_URL)

/**
 * Activa el submenú cuando el cursor entra en él.
 *
 * macOS no entrega eventos de ratón a una ventana inactiva: sin esto había que CLICAR antes
 * de que el hover funcionara. Es el mismo truco que ya usa el peek, y por eso el submenú es
 * focusable y el padre se declara `keepOnBlur` mientras esté abierto.
 */
let sondeoSubmenu: NodeJS.Timeout | null = null
function pararSondeoSubmenu(): void {
  if (sondeoSubmenu) { clearInterval(sondeoSubmenu); sondeoSubmenu = null }
}
function sondearSubmenu(): void {
  pararSondeoSubmenu()
  const dentro = (w: Electron.BrowserWindow, x: number, y: number): boolean => {
    const b = w.getBounds()
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
  }
  sondeoSubmenu = setInterval(() => {
    const sub = submenuPopover.window
    const pm = pmPopover.window
    if (!sub || !sub.isVisible()) { pararSondeoSubmenu(); return }
    const p = screen.getCursorScreenPoint()
    // El foco sigue al cursor en los DOS sentidos: si solo lo diera al hijo, al volver al
    // padre sus filas dejarían de responder al hover, que es el mismo bug al revés.
    if (dentro(sub, p.x, p.y)) { if (!sub.isFocused()) sub.focus() }
    else if (pm && pm.isVisible() && dentro(pm, p.x, p.y) && !pm.isFocused()) pm.focus()
  }, 60)
}

/**
 * Coloca el submenú a la derecha del menú de perfil, a la altura de la fila.
 *
 * El rect llega en coordenadas de la VENTANA del menú, así que hay que pasarlo por pantalla
 * y de ahí al área de contenido de la ventana principal, que es el sistema en el que trabaja
 * la factoría. Los ±PAD son el margen que el panel deja dentro de su ventana para la sombra.
 */
/** Abre el gestor de extensiones anclado al botón del topbar (o al centro si no lo hay). */
function abrirExtensionesDesdeMenu(): void {
  const cb = vActOpt()?.win?.getContentBounds()
  extPopover.show({ x: Math.round((cb?.width ?? 800) / 2) - 20, y: TOPBAR_HEIGHT - 8, width: 40, height: 28 })
}

ipcMain.on('profilemenu:submenu', (ev, section: SubmenuSection, rect: { top: number; height: number }) => {
  const pm = pmPopover.window
  if (!pm || !vActOpt()?.win) return
  submenuSección = section
  const pmb = pm.getBounds()
  const cb = vDe(ev).win.getContentBounds()
  const PAD = 12
  submenuPopover.show({
    x: pmb.x + pmb.width - PAD + 6 - cb.x,
    y: pmb.y + rect.top - PAD - cb.y,
    width: 0,
    height: 0
  })
  submenuPopover.send('profilesubmenu:data', datosSubmenu())
  sondearSubmenu()
})
ipcMain.on('profilemenu:submenuClose', () => submenuPopover.hide())
ipcMain.on('profilesubmenu:action', (ev, action: string) => {
  const [grupo, verbo, ...resto] = action.split(':')
  const arg = resto.join(':')
  // El toggle es la excepción: cerrar el menú al pulsarlo impediría ver que cambió.
  if (action === 'dev:remote') {
    setRemoteEnabled(!remoteState().enabled)
    submenuPopover.send('profilesubmenu:data', datosSubmenu())
    return
  }
  submenuPopover.hide()
  pmPopover.hide()
  switch (`${grupo}:${verbo}`) {
    case 'downloads:all': openDownloads(); break
    case 'downloads:open': openDownload(arg); break
    // Sin anchor propio: se ancla al mismo sitio donde estaba el menú de perfil.
    case 'extensions:manage': abrirExtensionesDesdeMenu(); break
    case 'extensions:import': void importarExtensionDesdeCarpeta(); break
    case 'extensions:open': openExtensionPopup(arg); break
    case 'bookmarks:open': abrirBookmark(arg); break
    case 'bookmarks:all': openBookmarksManager(); break
    case 'history:open': vDe(ev).createTab(arg); break
    case 'history:all': openHistory(); break
    case 'dev:devtools': vDe(ev).toggleDevtools(); break
    case 'dev:hardReload': activeWc()?.reloadIgnoringCache(); break
    case 'dev:copyToken': clipboard.writeText(remoteState().token); break
  }
})

ipcMain.on('profilemenu:action', (ev, name: string) => {
  pmPopover.hide()
  switch (name) {
    case 'new-tab':
    case 'bookmarks': openBookmarksManager(); break
    case 'settings': openSettings(); break
    case 'downloads': openDownloads(); break
    case 'developers': vDe(ev).toggleDevtools(); break
    case 'history': openHistory(); break
    case 'incognito': createWindow({ incognito: true }); break
  }
})
ipcMain.on('profilemenu:switchProfile', (_e, id: string) => {
  pmPopover.hide()
  cambiarDePerfil(String(id))
})
/**
 * Quitar un perfil de la lista. **No borra su carpeta** (ver perfiles.ts): un click no puede
 * tirar meses de historial y marcadores sin vuelta atrás. Por eso se pregunta, y por eso el
 * diálogo dice que los datos se quedan — prometer un borrado que no ocurre sería mentir.
 */
ipcMain.on('profilemenu:deleteProfile', (ev, id: string) => {
  const p = listaPerfiles().find((x) => x.id === String(id))
  if (!p) return
  const r = dialog.showMessageBoxSync(vDe(ev).win, {
    type: 'warning', buttons: [tr("Cancelar"), tr("Quitar")], defaultId: 0, cancelId: 0, noLink: true,
    message: tr("¿Quitar el perfil \"{0}\"?", p.nombre),
    detail: tr("Deja de aparecer en la lista. Sus datos (historial, marcadores, sesión) se quedan en el disco.")
  })
  if (r !== 1) return
  if (!borrarPerfil(p.id)) {
    console.error('[perfiles] no se pudo quitar el perfil', p.id)
    return
  }
  pmPopover.send('profilemenu:profile', datosMenuPerfil())
})
ipcMain.on('profilemenu:createProfile', (_e, nombre: string) => {
  pmPopover.hide()
  // Se crea Y se entra: crear un perfil y quedarte en el de antes no es lo que nadie pide.
  cambiarDePerfil(crearPerfil(String(nombre)).id)
})

/**
 * Memoria del agente. Solo páginas internas: son notas sobre el usuario, escritas por el
 * modelo — misma regla que el historial o el vault.
 */
ipcMain.handle('memory:list', (e) => (isInternalSender(e.senderFrame?.url) ? listarMemoria() : []))
ipcMain.handle('memory:read', (e, path: string) => (isInternalSender(e.senderFrame?.url) ? leerMemoria(String(path)) : null))
ipcMain.handle('memory:write', (e, path: string, contenido: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return false
  return escribirMemoria(String(path), String(contenido ?? ''))
})
ipcMain.handle('memory:delete', (e, path: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return false
  return borrarMemoria(String(path))
})
ipcMain.handle('memory:enabled', (e, on?: boolean) => {
  if (!isInternalSender(e.senderFrame?.url)) return memoriaHabilitada()
  return typeof on === 'boolean' ? setMemoriaHabilitada(on) : memoriaHabilitada()
})
ipcMain.on('memory:openFolder', (e) => {
  if (!isInternalSender(e.senderFrame?.url)) return
  void shell.openPath(dirMemoria())
})

// ---- Proveedores de IA (gestión desde la página de Settings, sender-validada) ----
function notifyChatContext(): void { vActOpt()?.win?.webContents.send('chat:contextChanged', getChatContext()) }
ipcMain.handle('providers:list', (e) => (isInternalSender(e.senderFrame?.url) ? listProviders() : []))
ipcMain.handle('providers:add', (e, input: { label: string; kind: ProviderKind; baseUrl?: string }, apiKey: string) => {
  if (!isInternalSender(e.senderFrame?.url)) { console.warn('[providers:add] denegado, sender:', e.senderFrame?.url); return listProviders() }
  addProvider(input, apiKey)
  notifyChatContext(); notifyVault()
  return listProviders()
})
ipcMain.handle('providers:remove', (e, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return []
  removeProvider(id)
  notifyChatContext(); notifyVault()
  return listProviders()
})
ipcMain.handle('providers:settings', (e) => {
  if (!isInternalSender(e.senderFrame?.url)) throw new Error('Acceso denegado.')
  return providerSettings()
})
ipcMain.handle('providers:discover', async (e, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) throw new Error('Acceso denegado.')
  const models = await discoverProvider(id)
  notifyChatContext()
  return models
})
ipcMain.handle('providers:save', (e, input: ProviderInput, apiKey: string, revision: string) => {
  if (!isInternalSender(e.senderFrame?.url)) throw new Error('Acceso denegado.')
  const state = saveProvider(input, apiKey, revision)
  notifyChatContext(); notifyVault()
  void refrescarModelos().then(notifyChatContext).catch(() => console.error('[providers] no se pudo actualizar el catálogo'))
  return state
})
ipcMain.handle('providers:delete', (e, id: string, revision: string) => {
  if (!isInternalSender(e.senderFrame?.url)) throw new Error('Acceso denegado.')
  removeProvider(id, revision)
  notifyChatContext(); notifyVault()
  return providerSettings()
})
ipcMain.handle('providers:openConfig', async (e) => {
  if (!isInternalSender(e.senderFrame?.url)) throw new Error('Acceso denegado.')
  const error = await shell.openPath(providerConfigPath())
  if (error) throw new Error('No se pudo abrir titanio.jsonc. Asocia los archivos .jsonc con tu editor.')
})
ipcMain.handle('providers:setActive', (e, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return []
  setActiveProvider(id)
  notifyChatContext(); notifyVault()
  return listProviders()
})
// El chrome (composer) pide el contexto del chat: proveedor activo + modelos + modelo elegido
ipcMain.handle('chat:context', () => getChatContext())
/**
 * Relee el catálogo del proveedor. Lo llaman Settings al abrirse y al conectar: así los modelos
 * nuevos aparecen el día que salen, sin esperar a una versión de Titanio con la lista tocada.
 */
ipcMain.handle('providers:models', async (e) => {
  if (!isInternalSender(e.senderFrame?.url)) return []
  const lista = await refrescarModelos()
  notifyChatContext()
  return lista
})
ipcMain.on('chat:setModel', (_e, id: string) => setModel(id))
ipcMain.on('chat:setEffort', (_e, e: 'low' | 'medium' | 'high') => setEffort(e))

// ---- Chat en streaming (desde el ChatPanel del chrome) ----
let chatAbort: AbortController | null = null
/**
 * Único punto por el que se para al agente.
 *
 * Existe porque había tres sitios abortando por su cuenta y ninguno dejaba rastro: cuando el
 * agente seguía trabajando después de pausarlo no había forma de saber si la orden había
 * llegado siquiera. El log es barato y esa duda costó una sesión entera.
 */
function pararAgente(motivo: string): void {
  if (!chatAbort || chatAbort.signal.aborted) return
  console.log(`[agent] parado: ${motivo}`)
  chatAbort.abort()
  setAgentRunning(false)
}
// El agente está operando el navegador; `controlledTabId` es la pestaña concreta que controla.
let agentRunning = false
let controlledTabId: number | null = null
// La leyenda de control solo se muestra en la pestaña que el agente controla de verdad.
function controllingActive(): boolean {
  return agentRunning && vAct().activeId() != null && vAct().activeId() === controlledTabId
}
function setAgentRunning(on: boolean): void {
  if (agentRunning === on) return
  agentRunning = on
  controlledTabId = on ? vAct().activeId() : null // arranca controlando la pestaña activa
  vAct().layoutActive() // ajusta la franja inferior de la vista nativa
  vAct().pushState()
}
// El agente movió su foco a otra pestaña (open_tab/switch_tab): sigue la leyenda.
function setControlledTab(id: number): void {
  if (!agentRunning) return
  controlledTabId = id
  vAct().layoutActive()
  vAct().pushState()
}
// Cola de eventos asíncronos del navegador (popups, descargas) para steering del agente.
let agentEvents: string[] = []
function pushAgentEvent(msg: string): void { if (agentEvents.length < 20) agentEvents.push(msg) }
ipcMain.on('chat:cancel', () => pararAgente(tr("el usuario lo canceló")))
// El historial de chats vive en el chrome como el propio chat, así que estos canales no
// llevan la guarda de `isInternalSender` — igual que `chat:send`.
ipcMain.handle('chats:list', () => listSessions())
ipcMain.handle('chats:resume', () => resumeOrNew())
ipcMain.handle('chats:new', () => startSession())
ipcMain.handle('chats:open', (_e, id: string) => openSession(id))
ipcMain.handle('chats:forNext', (_e, id: string) => sessionForNextMessage(id))
ipcMain.handle('chats:save', (_e, id: string, messages) => saveSession(id, messages))
ipcMain.on('chats:remove', (_e, id: string) => removeChatSession(id))

// ---- Gestión del historial de chats (Settings → Archived chats) ----
// Solo páginas internas: son todas las conversaciones del usuario con el agente.
ipcMain.handle('chats:search', (e, q: string, incluirArchivadas: boolean) =>
  isInternalSender(e.senderFrame?.url) ? searchSessions(String(q ?? ''), !!incluirArchivadas) : [])
ipcMain.handle('chats:archive', (e, id: string, archived: boolean) => {
  if (!isInternalSender(e.senderFrame?.url)) return []
  archiveSession(String(id), !!archived)
  return searchSessions('', true)
})
ipcMain.handle('chats:rename', (e, id: string, title: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return []
  renameSession(String(id), String(title ?? ''))
  return searchSessions('', true)
})
ipcMain.handle('chats:delete', (e, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return []
  removeChatSession(String(id))
  return searchSessions('', true)
})
/**
 * Retomar una conversación desde Settings: abre el panel del chat con ESA sesión.
 *
 * El panel es la fuente de verdad en vivo, así que no basta con marcar la sesión en el main:
 * hay que decirle al chrome que la cargue. Y se desarchiva al retomarla — seguir usándola y
 * que siguiera escondida del desplegable sería incoherente.
 */
ipcMain.on('chats:resumeInPanel', (ev, id: string) => {
  const v = vDe(ev)
  archiveSession(String(id), false)
  if (!openSession(String(id))) return
  v.win.webContents.send('chat:openSession', String(id))
})
// "Take over": el usuario retoma el control → aborta el agente.
ipcMain.on('agent:takeOver', () => pararAgente(tr("el usuario retomó el control")))
ipcMain.handle('chat:send', async (ev, messages: ChatMessage[]) => {
  const prepared = prepareActiveProvider()
  if (!prepared.ok) {
    ev.sender.send('chat:error', prepared.error)
    return
  }
  const active = prepared.active
  // Techo de gasto diario: se comprueba ANTES de arrancar, que es el único momento en que
  // sirve de algo. Con el turno en marcha ya se está gastando.
  const tope = limiteDiario()
  if (tope > 0 && gastoDeHoy() >= tope) {
    vDe(ev).win.webContents.send('chat:error', {
      tipo: 'tope',
      titulo: tr("Llegaste a tu límite de gasto de hoy"),
      detalle: tr("Lo pusiste tú en {0} $/día. El agente no va a gastar más hasta mañana, o hasta que subas el tope.", tope.toFixed(2)),
      accion: { label: tr("Abrir Settings"), kind: 'settings' }
    } satisfies ChatFallo)
    return
  }
  chatAbort?.abort()
  agentEvents = [] // limpia eventos viejos al iniciar un turno
  chatAbort = new AbortController()
  setAgentRunning(true)
  const send = (ch: string, payload?: unknown): void => { vActOpt()?.win?.webContents.send(ch, payload) }
  let uso: { inputTokens: number; outputTokens: number; cachedInputTokens?: number; reasoningTokens?: number; steps: number } | null = null
  let salioBien = true
  try {
    // Agente Mastra con herramientas: opera la pestaña activa + gestión de pestañas (anthropic y openai).
    uso = await runMastra({
      provider: active.provider, key: active.key, model: active.model,
      messages, signal: chatAbort.signal, skills: enabledSkills(),
      control: {
        getWc: () => (vDe(ev).tabActiva()?.view.webContents),
        listTabs: () => [...vDe(ev).tabs.entries()].map(([id, t]) => ({ id, title: t.title, url: t.url, active: id === vDe(ev).activeId() })),
        openTab: (url) => { const id = vDe(ev).createTab(url, true, true); setControlledTab(id); return id },
        switchTab: (id) => { if (!vDe(ev).tabs.has(id)) return false; vDe(ev).setActive(id); setControlledTab(id); return true },
        closeTab: (id) => { if (!vDe(ev).tabs.has(id)) return false; vDe(ev).closeTab(id); return true },
        drainEvents: () => { const e = agentEvents; agentEvents = []; return e }
      },
      settings: {
        read: () => ({
          profileName: getProfile().name,
          skills: listSkills().map((s) => ({ id: s.id, name: s.name, enabled: s.enabled }))
        }),
        setProfileName: (name) => { const p = setProfile(name); broadcastProfile(); return p.name },
        setSkill: (id, on) => {
          const s = listSkills().find((x) => x.id === id)
          if (!s) return { ok: false }
          toggleSkill(id, on)
          return { ok: true, name: s.name, enabled: on }
        },
        openSettings: (section) => openSettings(section)
      },
      memoria: {
        list: () => listarMemoria().flatMap(function aplanar(n): { path: string; tipo: string }[] {
          return [{ path: n.path, tipo: n.tipo }, ...(n.hijos ?? []).flatMap(aplanar)]
        }),
        read: (p) => leerMemoria(p),
        write: (p, c) => escribirMemoria(p, c),
        remove: (p) => borrarMemoria(p),
        enabled: () => memoriaHabilitada(),
        contexto: () => contextoDeMemoria()
      },
      emit: {
        token: (tok) => send('chat:token', tok),
        step: (s) => send('chat:step', s),
        stepImage: (d) => send('chat:stepImage', d),
        // El stream también puede traer errores del proveedor a mitad de turno.
        error: (m) => send('chat:error', diagnosticar(m, active.provider.kind))
      }
    })
    send('chat:done')
  } catch (err) {
    salioBien = false
    if (!(err instanceof Error && err.name === 'AbortError')) {
      console.error('[agent] turno falló:', err)
      send('chat:error', diagnosticar(err, active.provider.kind))
    }
  } finally {
    setAgentRunning(false)
    // Se anota aunque el turno falle: los tokens de un turno que reventó a mitad se cobran
    // igual, y no contarlos haría que la pantalla de gasto mintiera justo en los días malos.
    if (uso) {
      anotarTurno({
        kind: active.provider.kind, model: active.model,
        inputTokens: uso.inputTokens, outputTokens: uso.outputTokens,
        cachedInputTokens: uso.cachedInputTokens, reasoningTokens: uso.reasoningTokens,
        steps: uso.steps, ok: salioBien
      })
      broadcastUso()
    }
  }
})

// ---- Consumo y límite de gasto (Settings → Billing / Statistics) ----
function broadcastUso(): void {
  paraPaginas('/settings.html', 'usage:changed', resumenUso())
}
ipcMain.handle('usage:summary', (e, dias: number) =>
  isInternalSender(e.senderFrame?.url) ? resumenUso(Number(dias) || 30) : null)
ipcMain.handle('usage:clear', (e) => {
  if (!isInternalSender(e.senderFrame?.url)) return null
  borrarUso(); broadcastUso()
  return resumenUso()
})
ipcMain.handle('usage:limit', (e, valor?: number) => {
  if (!isInternalSender(e.senderFrame?.url)) return 0
  if (typeof valor === 'number') setLimiteDiario(valor)
  return limiteDiario()
})

// ⌘⌥V cicla los materiales de vibrancy en vivo (ver VIBRANCY_MATERIALS arriba).
ipcMain.on('ui:cycleVibrancy', () => {
  if (!vActOpt()?.win || !isMac) return
  // Cicla solo entre materiales; 'none' se elige desde Settings.
  const i = VIBRANCY_OPTIONS.findIndex((o) => o.id === vibrancyMaterial)
  vibrancyMaterial = VIBRANCY_OPTIONS[(i + 1) % VIBRANCY_OPTIONS.length].id
  applyVibrancy(vibrancyMaterial)
  broadcastAppearance()
  savePanels()
  console.log('[vibrancy]', vibrancyMaterial, '· ⌘⌥V para el siguiente')
})

/**
 * Antes que nada, y en este orden.
 *
 * El lock tiene que pedirse antes de crear nada: si otra instancia ya lo tiene, este proceso
 * debe morir sin tocar los JSON del perfil (dos instancias sobre el mismo `userData` se pisan
 * los marcadores y el vault). Y los listeners de enlaces van antes de `ready` porque en macOS
 * `open-url` se dispara mientras la app todavía arranca.
 */
if (reservarInstanciaUnica()) {
  escucharEnlaces()
}

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock() && app.isPackaged) return // otra instancia manda
  initLanguage((raw) => {
    if (!raw) return false
    try {
      const url = new URL(raw)
      const settings = new URL(internalUrl('settings'))
      return url.protocol === settings.protocol && url.host === settings.host && url.pathname === settings.pathname
    } catch { return false }
  }, () => {
    buildAppMenu()
    app.setAboutPanelOptions({ credits: tr('Un navegador agéntico de escritorio') })
    broadcastAppearance()
  })
  // En dev muestra nuestro icono en el dock (mac) en vez del de Electron.
  if (isMac && app.dock) app.dock.setIcon(appIcon)
  // Panel "Acerca de Titanio" con nuestra info en vez de la de Electron.
  app.setAboutPanelOptions({
    applicationName: 'Titanio',
    applicationVersion: app.getVersion(),
    copyright: '© 2026 Titanio',
    credits: tr("Un navegador agéntico de escritorio")
  })
  /**
   * Lo PRIMERO de todo: decide qué perfil está activo, y de ahí salen las rutas de los ficheros
   * de estado (`rutaDePerfil`). Si `initPermissions`/`initBookmarks`/`initHistory` corrieran
   * antes, abrirían los del perfil por defecto y el usuario vería los datos de otro perfil.
   */
  initProfile()
  buildAppMenu()
  initPermissions()
  configurePasskeys()
  // PiP propio: el de Chromium no abre NINGUNA ventana en Electron (ver src/main/pip.ts).
  initPip(RENDERER_URL ?? null)
  attachPip((wc) => {
    // El id de la pestaña es la clave del Map, no un campo de Tab.
    for (const v of ventanas.values()) {
      for (const [id, t] of v.tabs) {
        if (t.view.webContents === wc) { v.win.show(); v.win.focus(); v.setActive(id); return }
      }
    }
  })
  // Descargas: el gestor es único (en memoria); lo que va por sesión es el enganche.
  initDownloads(broadcastDownloads)
  prepararSesion(PARTICION_NORMAL, false)
  initBookmarks()
  initUsage()
  initFavicons()
  // Control remoto: apagado salvo que el usuario lo dejara encendido (ver remote.ts).
  initRemote({
    activeWc: () => activeWc(),
    wcFor: (id) => vAct().tabs.get(id)?.view.webContents,
    listTabs: () => [...vAct().tabs.entries()].map(([id, t]) => ({ id, url: t.url, title: t.title })),
    activateTab: (id) => vAct().setActive(id),
    // `activate` invertido: para un cliente externo lo normal es NO robar el foco.
    newTab: (url, background) => vAct().createTab(url, !background),
    navigate: (url) => navigateActive(url),
    /**
     * El permiso se pide con un diálogo nativo, no en el DOM: la vista de la página se dibuja
     * encima del chrome, así que un modal HTML podría quedar tapado — justo el sitio donde no
     * puede pasar. Y va con `noLink` y "No permitir" por defecto: ante la duda, que no.
     */
    confirmClient: async (nombre) => {
      const { response } = await dialog.showMessageBox(vActOpt()?.win ?? undefined!, {
        type: 'warning',
        message: tr("«{0}» quiere conducir tu navegador", nombre),
        detail:
          tr("Podrá abrir páginas, leerlas y actuar en los sitios donde tengas la sesión abierta, ") +
          tr("igual que tú. No puede ver tus contraseñas ni usar el vault.\n\n") +
          tr("Solo para esta sesión: al cerrar Titanio se olvida."),
        buttons: [tr("No permitir"), tr("Permitir")],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
      const ok = response === 1
      console.log(`[remote] ${ok ? 'autorizado' : 'RECHAZADO'}: ${nombre}`)
      return ok
    }
  })
  // El indicador del chrome: nunca debe estar encendido sin que se vea.
  onRemoteState((r) => {
    vActOpt()?.win?.webContents.send('remote:state', r)
    if (peekWin && !peekWin.isDestroyed()) peekWin.webContents.send('remote:state', r)
  })
  initMcpClient()
  initChats()
  initHistory()
  // La memoria es del perfil: lo que Titanio sabe de ti en "Trabajo" no es lo de "Personal".
  initMemoria(rutaDePerfil('memory'), rutaDePerfil('memory-settings.json'))
  initSkills()
  initQuickActions()
  initWindowState()
  loadPanels()
  vault.initVault()
  initAI(() => {
    notifyChatContext()
    void refrescarModelos().then(notifyChatContext).catch(() => console.error('[providers] no se pudo actualizar el catálogo'))
  })
  createWindow()
  // Catálogo de modelos al arrancar, con retraso y sin bloquear: es una petición de red y el
  // usuario no está esperándola. Si falla, se sigue con la lista de fábrica.
  setTimeout(() => { void refrescarModelos().then(() => notifyChatContext()) }, 5000).unref?.()
  // Ya hay ventana: se entregan los enlaces que llegaron mientras arrancaba.
  initDefaultBrowser((url) => { vAct().createTab(url, true); vActOpt()?.win?.focus() })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('before-quit', () => saveSessionNow())
app.on('before-quit', () => stopAllMcp())
app.on('window-all-closed', () => { if (!isMac) app.quit() })
