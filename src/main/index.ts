import { join } from 'path'
import { readFileSync } from 'fs'
import { app, BrowserWindow, Menu, Notification, WebContentsView, clipboard, dialog, ipcMain, nativeImage, net, screen, session, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import type { IpcMainEvent } from 'electron'
import type { BrowserState, Bookmark, ChatMessage, MenuAnchor, ProviderKind, InternalPage, SubmenuData, SubmenuSection } from '../shared/types'
import { internalPageOf } from '../shared/types'
import { initBookmarks, listBookmarks, isBookmarked, addBookmark, removeBookmark, toggleBookmark } from './bookmarks'
import { initAI, listProviders, addProvider, removeProvider, setActive as setActiveProvider, setModel, setEffort, getChatContext, getActiveProvider } from './ai/store'
import { runMastra, errText } from './agent/mastra'
import { initHistory, recordVisit, updateMeta, recent as historyRecent } from './history'
import { initWindowState, initialBounds, shouldMaximize, trackWindow } from './windowState'
import { suggest } from './suggest'
import {
  initPermissions, attachPermissionHandlers, stateOf, setState, requestedKeys,
  allSites, clearOrigin, clearAllOrigins
} from './permissions'
import { initSkills, listSkills, getSkill, toggleSkill, enabledSkills, skillsDir } from './skills'
import { initProfile, getProfile, setProfile, setAvatar } from './profile'
import { initDownloads, attachDownloads, listDownloads, activeDownloadCount, cancelDownload, openDownload, showDownload, clearDownloads } from './downloads'
import { credentialsFor, fillFromVault } from './autofill'
import { initExtensions, listExtensions, addExtension, setExtensionEnabled, removeExtension as removeExt, installFromStore, extensionUi } from './extensions'
import { extensionIdFrom } from './crx'
import { createPopover } from './popover'
import { initRemote, remoteState, setRemoteEnabled, onRemoteState } from './remote'
import { initFavicons, rememberFavicon, faviconFor, resolveFavicon } from './favicons'
import { initChats, listSessions, resumeOrNew, startSession, openSession, sessionForNextMessage, saveSession, removeSession as removeChatSession } from './chats'
import { writeJson } from './jsonfile'
import { initRoutines, listRoutines, createWatchRoutine, setRoutineEnabled, removeRoutine as removeRoutineEntry, runRoutine } from './routines'
import { initUpdater, checkForUpdates, downloadUpdate, installUpdate, getUpdateState, onUpdateState } from './updater'
import { initQuickActions, listQuickActions, saveQuickAction, removeQuickAction, getQuickAction, fillTemplate } from './quickactions'
import * as vault from './vault/store'
import type { VaultItemType } from '../shared/vault'
import type { SiteInfoData, PermKey, PermState } from '../shared/types'
import appIcon from '../renderer/src/assets/icon.png?asset'

// Anchos redimensionables por el usuario (el renderer los aplica a --spacing-sidebar/panel).
const SIDEBAR_DEFAULT = 300
const CHAT_DEFAULT = 380
const PANEL_LIMITS = { sidebarMin: 180, sidebarMax: 420, chatMin: 300, chatMax: 640 }
let sidebarWidth = SIDEBAR_DEFAULT
let chatWidth = CHAT_DEFAULT
const TOPBAR_HEIGHT = 52
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
const NO_VIBRANCY = process.env['MONPER_NO_VIBRANCY'] === '1'
const APP_BG = '#111114' // igual que --color-bg en styles.css
const PARTITION = 'persist:monper'
const isMac = process.platform === 'darwin'

// Nombre de la app: debe fijarse ANTES de whenReady para que el menú de macOS
// y el dock muestren "Monper" en vez de "Electron" (dev incluido).
app.setName('Monper')

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
  pageBg: string | null
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

// Alto de la franja inferior reservada para la leyenda "Monper is controlling this tab".
const CONTROLLED_STRIP = 40

let win: BrowserWindow | null = null
const tabs = new Map<number, Tab>()
let activeId: number | null = null
let nextId = 1
let sidebarCollapsed = false
let chatOpen = false

// Rutas de los renderers (dev usa el server de Vite, prod los archivos build)
const RENDERER_URL = process.env['ELECTRON_RENDERER_URL']
function loadRenderer(target: BrowserWindow, page: 'index' | 'menu') {
  if (RENDERER_URL) target.loadURL(`${RENDERER_URL}/${page}.html`)
  else target.loadFile(join(__dirname, `../renderer/${page}.html`))
}

function contentBounds() {
  const [w, h] = win!.getContentSize()
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
  const r = !sidebarCollapsed || chatOpen ? CONTENT_RADIUS : SIN_REDONDEO
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
    activeId,
    tabs: [...tabs.entries()].map(([id, tb]) => ({
      id, url: tb.errorUrl ?? displayUrl(tb.url), title: tb.title || 'Nueva pestaña', favicon: tb.favicon, loading: tb.loading, recording: tb.recording, muted: tb.muted, audible: tb.audible, agent: tb.agent, bookmarkId: tb.bookmarkId, internal: internalPageOf(tb.url)
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
    controlling: controllingActive()
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
  // "Monper": las pestañas son WebContentsView aparte, así que el título del chrome nunca
  // cambiaba solo.
  win.setTitle(t?.title ? `${t.title} — Monper` : 'Monper')
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
  t.view.setBackgroundColor(esTranslucida(t) ? '#00000000' : (rgbToHex(t.pageBg ?? '') ?? APP_BG))
}

function applyTopColor(t: Tab, c: string): void {
  if (esTranslucida(t)) return
  if (!c || t.pageBg === c) return
  t.pageBg = c
  // Alinea el fondo opaco de la vista con el color real de la página: así el frame en
  // blanco al cambiar de pestaña coincide con la página (sin flash blanco en páginas oscuras).
  const hex = rgbToHex(c)
  if (hex && typeof t.view.setBackgroundColor === 'function') t.view.setBackgroundColor(hex)
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
  const view = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, '../preload/content.js')
    }
  })
  const t: Tab = { view, radius: null, radiusW: null, url, title: '', favicon: null, loading: false, canBack: false, canForward: false, themeColor: null, pageBg: null, recording: false, muted: false, audible: false, agent, bookmarkId: null, errorUrl: null }
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
  const refresh = () => { t.canBack = nav.canGoBack(); t.canForward = nav.canGoForward(); pushState() }
  wc.on('did-start-loading', () => { t.loading = true; pushState() })
  wc.on('did-stop-loading', () => {
    t.loading = false
    scheduleTopSample(t) // color del topbar: se remuestrea también en cada scroll
    refresh()
  })
  wc.on('did-navigate', (_e, u) => { // sólo main-frame
    t.url = u; t.recording = false
    // Una pestaña cruza la frontera en los dos sentidos (newtab → web → newtab), así que el
    // fondo se decide en cada navegación, no al crear la vista. Y hay que rehacer el layout:
    // volverse translúcida cambia QUÉ otras vistas pueden quedar visibles detrás (ver
    // `soloActiva` en layoutTabs). Solo si es la activa: el resto ya no se ve.
    applyBackdrop(t)
    if (id === activeId) layoutTabs()
    // Al navegar a algo que NO es la página de error, limpiamos el estado de error y registramos la visita.
    if (!isErrorPage(u)) { t.errorUrl = null; if (!isInternal(u)) recordVisit(u, t.title, t.favicon) }
    applyZoom(wc, u) // restaura el zoom recordado para el origen
    refresh()
    scheduleSaveSession()
  })
  wc.on('did-navigate-in-page', (_e, u, isMainFrame) => { if (isMainFrame) { t.url = u; refresh() } })
  wc.on('page-title-updated', (_e, title) => { t.title = title; updateMeta(t.url, title); pushState() })
  wc.on('page-favicon-updated', (_e, icons) => {
    t.favicon = icons?.[0] || null
    // Se recuerda por host: es el icono de verdad del sitio, y sirve para los marcadores sin
    // icono propio en vez de pedírselo a un tercero.
    rememberFavicon(t.url, t.favicon)
    updateMeta(t.url, undefined, t.favicon)
    pushState()
  })
  wc.on('did-change-theme-color', (_e, color) => { t.themeColor = color; pushState() })
  wc.on('audio-state-changed', (e) => { t.audible = e.audible; pushState() })
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
  wc.on('context-menu', (_e, params) => showPageContextMenu(wc, params))
  wc.on('found-in-page', (_e, r) => win?.webContents.send('find:result', { matches: r.matches, active: r.activeMatchOrdinal }))
  wc.setWindowOpenHandler((details) => {
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
      pushAgentEvent(`Se abrió una ventana emergente: ${details.url}`)
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500, height: 640, resizable: true, minimizable: true, maximizable: false,
          fullscreenable: false, autoHideMenuBar: true, title: 'Monper',
          webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true }
        }
      }
    }
    // Links normales (target=_blank) → nueva pestaña.
    pushAgentEvent(`Se abrió una pestaña nueva: ${details.url}`)
    createTab(details.url)
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
    if (isDevtools) { e.preventDefault(); toggleDevtools(); return }
    // ⌘1..9 para saltar de pestaña (funciona con el foco en la página).
    if ((input.meta || input.control) && !input.alt && !input.shift && /^[1-9]$/.test(input.key)) {
      e.preventDefault(); selectTabByIndex(Number(input.key))
    }
  })

  wc.loadURL(url)
  if (activate) setActive(id)
  else { layoutTabs(); pushState() } // dimensiona la nueva (queda detrás de la activa)
  return id
}

function setActive(id: number) {
  if (!tabs.has(id)) return
  if (signinTabId != null && signinTabId !== id) hideSignin() // el prompt era de otra pestaña
  activeId = id
  touchWarm(id) // la activa entra/sube en el warm set
  const at = tabs.get(id)
  if (at) scheduleTopSample(at) // recolorea el topbar con la pestaña recién activada
  layoutTabs()
  pushState()
  scheduleSaveSession()
}

// Pila de URLs de pestañas cerradas recientemente (para ⌘⇧T).
const closedStack: string[] = []

function closeTab(id: number) {
  const t = tabs.get(id)
  if (!t) return
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
function showPageContextMenu(wc: Electron.WebContents, p: Electron.ContextMenuParams): void {
  if (!win) return
  const nav = wc.navigationHistory
  const items: MenuItemConstructorOptions[] = []
  if (p.linkURL) {
    items.push(
      { label: 'Abrir enlace en pestaña nueva', click: () => createTab(p.linkURL) },
      { label: 'Copiar dirección del enlace', click: () => clipboard.writeText(p.linkURL) },
      { type: 'separator' }
    )
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: 'Abrir imagen en pestaña nueva', click: () => createTab(p.srcURL) },
      { label: 'Copiar dirección de la imagen', click: () => clipboard.writeText(p.srcURL) },
      { label: 'Guardar imagen', click: () => wc.downloadURL(p.srcURL) },
      { type: 'separator' }
    )
  }
  if (p.isEditable) {
    items.push(
      { role: 'cut', enabled: p.editFlags.canCut },
      { role: 'copy', enabled: p.editFlags.canCopy },
      { role: 'paste', enabled: p.editFlags.canPaste },
      { role: 'selectAll' },
      { type: 'separator' }
    )
  } else if (p.selectionText) {
    const sel = p.selectionText.trim().slice(0, 40)
    items.push(
      { role: 'copy' },
      { label: `Buscar "${sel}" en Google`, click: () => createTab('https://www.google.com/search?q=' + encodeURIComponent(p.selectionText)) },
      { type: 'separator' }
    )
  }
  items.push(
    { label: 'Atrás', enabled: nav.canGoBack(), click: () => nav.goBack() },
    { label: 'Adelante', enabled: nav.canGoForward(), click: () => nav.goForward() },
    { label: 'Recargar', click: () => wc.reload() },
    { type: 'separator' },
    { label: 'Copiar dirección de la página', click: () => clipboard.writeText(wc.getURL()) },
    { label: 'Inspeccionar elemento', click: () => wc.inspectElement(p.x, p.y) }
  )
  Menu.buildFromTemplate(items).popup({ window: win })
}

// ---- Restauración de sesión: persistir las pestañas abiertas y reabrirlas al arrancar ----
function sessionFile(): string { return join(app.getPath('userData'), 'session.json') }
let saveSessionTimer: NodeJS.Timeout | null = null

function collectSession(): { urls: string[]; activeIndex: number } {
  const urls: string[] = []
  let activeIndex = 0
  for (const [id, t] of tabs) {
    if (t.agent) continue // las pestañas del agente no se persisten
    const u = t.errorUrl ?? t.url
    if (!/^https?:\/\//i.test(u)) continue // solo http(s); las internas se re-crean como new tab
    if (id === activeId) activeIndex = urls.length
    urls.push(u)
  }
  return { urls, activeIndex }
}
function saveSessionNow(): void {
  writeJson(sessionFile(), collectSession(), 'la sesión (pestañas abiertas)', false)
}
function scheduleSaveSession(): void {
  if (saveSessionTimer) clearTimeout(saveSessionTimer)
  saveSessionTimer = setTimeout(saveSessionNow, 800)
}
function restoreSession(): boolean {
  let data: { urls: string[]; activeIndex: number }
  try { data = JSON.parse(readFileSync(sessionFile(), 'utf-8')) } catch { return false }
  if (!Array.isArray(data.urls) || data.urls.length === 0) return false
  for (const u of data.urls) createTab(u, false)
  const ids = [...tabs.keys()]
  const target = ids[Math.min(Math.max(0, data.activeIndex ?? 0), ids.length - 1)]
  if (target != null) setActive(target)
  return true
}

function normalizeUrl(raw: string): string | null {
  const url = String(raw || '').trim()
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(url) || url === 'localhost' || url.startsWith('localhost:')) return 'https://' + url
  return 'https://www.google.com/search?q=' + encodeURIComponent(url)
}

// WebContents de la pestaña activa (para acciones de navegación del menú).
function activeWc() {
  return activeId != null ? tabs.get(activeId)?.view.webContents : undefined
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
  const t = activeId != null ? tabs.get(activeId) : null
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
  win?.webContents.send('menu:action', action)
}

function buildAppMenu(): void {
  const appMenu: MenuItemConstructorOptions = {
    label: 'Monper',
    submenu: [
      { role: 'about', label: 'Acerca de Monper' },
      { label: 'Buscar actualizaciones…', click: () => void checkForUpdates(true, win) },
      { type: 'separator' },
      { label: 'Ajustes…', accelerator: 'CmdOrCtrl+,', click: () => openSettings() },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', label: 'Ocultar Monper' },
      { role: 'hideOthers', label: 'Ocultar otros' },
      { role: 'unhide', label: 'Mostrar todo' },
      { type: 'separator' },
      { role: 'quit', label: 'Salir de Monper' }
    ]
  }

  const fileMenu: MenuItemConstructorOptions = {
    label: 'Archivo',
    submenu: [
      { label: 'Nueva pestaña', accelerator: 'CmdOrCtrl+T', click: () => createTab() },
      { label: 'Reabrir pestaña cerrada', accelerator: 'CmdOrCtrl+Shift+T', click: () => reopenClosedTab() },
      { label: 'Cerrar pestaña', accelerator: 'CmdOrCtrl+W', click: () => { if (activeId != null) closeTab(activeId) } },
      { type: 'separator' },
      { label: 'Editar URL', accelerator: 'CmdOrCtrl+L', click: () => menuAction('edit-url') }
    ]
  }

  const editMenu: MenuItemConstructorOptions = {
    label: 'Editar',
    submenu: [
      { role: 'undo', label: 'Deshacer' },
      { role: 'redo', label: 'Rehacer' },
      { type: 'separator' },
      { role: 'cut', label: 'Cortar' },
      { role: 'copy', label: 'Copiar' },
      { role: 'paste', label: 'Pegar' },
      { role: 'selectAll', label: 'Seleccionar todo' },
      { type: 'separator' },
      { label: 'Buscar en la página', accelerator: 'CmdOrCtrl+F', click: () => menuAction('find') }
    ]
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: 'Ver',
    submenu: [
      { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => activeWc()?.reload() },
      { label: 'Atrás', accelerator: 'CmdOrCtrl+[', click: () => { const wc = activeWc(); if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack() } },
      { label: 'Adelante', accelerator: 'CmdOrCtrl+]', click: () => { const wc = activeWc(); if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward() } },
      { type: 'separator' },
      { label: 'Acercar', accelerator: 'CmdOrCtrl+Plus', click: () => changeZoom(1) },
      { label: 'Acercar', accelerator: 'CmdOrCtrl+=', visible: false, click: () => changeZoom(1) },
      { label: 'Alejar', accelerator: 'CmdOrCtrl+-', click: () => changeZoom(-1) },
      { label: 'Zoom normal', accelerator: 'CmdOrCtrl+0', click: () => changeZoom('reset') },
      { type: 'separator' },
      { label: 'Mostrar/ocultar sidebar', accelerator: 'CmdOrCtrl+S', click: () => menuAction('toggle-sidebar') },
      { label: 'Ask Monper', accelerator: 'CmdOrCtrl+J', click: () => menuAction('toggle-chat') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Pantalla completa' },
      { label: 'Herramientas de desarrollo', accelerator: 'F12', click: () => toggleDevtools() }
    ]
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: 'Ventana',
    role: 'windowMenu'
  }

  const template: MenuItemConstructorOptions[] = isMac
    ? [appMenu, fileMenu, editMenu, viewMenu, windowMenu]
    : [fileMenu, editMenu, viewMenu, windowMenu]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
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
    trafficLightPosition: isMac ? { x: 15, y: 20 } : undefined,
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
  trackWindow(win)

  loadRenderer(win, 'index')
  win.on('resize', () => { layoutActive(); hideOmni(); if (peekWin && !peekWin.isDestroyed() && peekWin.isVisible()) placePeekWin() })
  win.on('move', hideOmni)
  // ⌘1..9 cuando el foco está en el chrome (no en una página).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.meta || input.control) && !input.alt && !input.shift && /^[1-9]$/.test(input.key)) {
      e.preventDefault(); selectTabByIndex(Number(input.key))
    }
  })
  win.webContents.on('did-finish-load', () => {
    if (tabs.size === 0) { if (!restoreSession()) createTab() } else pushState()
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
    initRoutines(win!, broadcastRoutines) // scheduler de rutinas (necesita la ventana)
    onUpdateState(broadcastUpdateState)
    void initUpdater() // comprobación silenciosa de actualizaciones
  })
}

// ---- IPC ----
ipcMain.handle('tabs:new', () => { hidePeek(); return createTab() })
ipcMain.on('tabs:reorder', (_e, orderedIds: number[]) => reorderTabs(orderedIds))
ipcMain.handle('tabs:close', (_e, id: number) => closeTab(id))
ipcMain.handle('tabs:select', (_e, id: number) => { hidePeek(); setActive(id) })
ipcMain.handle('nav:go', (_e, raw: string) => {
  const url = normalizeUrl(raw)
  const t = activeId != null ? tabs.get(activeId) : null
  if (url && t) t.view.webContents.loadURL(url)
})
ipcMain.handle('nav:back', () => { const t = activeId != null ? tabs.get(activeId) : null; if (t?.view.webContents.navigationHistory.canGoBack()) t.view.webContents.navigationHistory.goBack() })
ipcMain.handle('nav:forward', () => { const t = activeId != null ? tabs.get(activeId) : null; if (t?.view.webContents.navigationHistory.canGoForward()) t.view.webContents.navigationHistory.goForward() })
ipcMain.handle('nav:reload', () => { const t = activeId != null ? tabs.get(activeId) : null; t?.view.webContents.reload() })
// ---- Anchos de los paneles (redimensionables, persistidos) ----
function panelsFile(): string { return join(app.getPath('userData'), 'panels.json') }
function loadPanels(): void {
  try {
    const d = JSON.parse(readFileSync(panelsFile(), 'utf-8')) as { sidebar?: number; chat?: number; vibrancy?: string }
    const L = PANEL_LIMITS
    if (d.sidebar) sidebarWidth = Math.min(L.sidebarMax, Math.max(L.sidebarMin, Math.round(d.sidebar)))
    if (d.chat) chatWidth = Math.min(L.chatMax, Math.max(L.chatMin, Math.round(d.chat)))
    // Solo aceptamos un valor conocido: el JSON lo puede editar el usuario.
    const v = d.vibrancy as VibrancySetting
    if (v === 'none' || VIBRANCY_MATERIALS.includes(v as VibrancyMaterial)) vibrancyMaterial = v
  } catch { /* valores por defecto */ }
}
let savePanelsTimer: NodeJS.Timeout | null = null
function savePanels(): void {
  if (savePanelsTimer) clearTimeout(savePanelsTimer)
  savePanelsTimer = setTimeout(() => {
    writeJson(panelsFile(), { sidebar: sidebarWidth, chat: chatWidth, vibrancy: vibrancyMaterial }, 'el tamaño de los paneles', false)
  }, 400)
}
ipcMain.handle('state:get', () => buildState())
ipcMain.handle('ui:panels', () => ({ sidebar: sidebarWidth, chat: chatWidth, limits: PANEL_LIMITS }))

// ---- Apariencia: nivel de transparencia del chrome (sidebar y panel de chat) ----
/** Materiales expuestos en Settings, con nombre humano en vez del término de macOS. */
const VIBRANCY_OPTIONS: { id: VibrancySetting; label: string; desc: string }[] = [
  { id: 'hud', label: 'Máxima', desc: 'El chrome deja pasar casi todo el fondo' },
  { id: 'popover', label: 'Alta', desc: 'Translúcido, con algo más de cuerpo' },
  { id: 'menu', label: 'Media', desc: 'Equilibrio entre fondo y legibilidad' },
  { id: 'sidebar', label: 'Baja', desc: 'Apenas se intuye lo que hay detrás' },
  { id: 'under-window', label: 'Mínima', desc: 'Casi opaco' },
  { id: 'none', label: 'Sin transparencia', desc: 'Fondo sólido, sin efecto de material' }
]
/** Aplica el ajuste en vivo. 'none' quita la vibrancy y pone fondo opaco. */
function applyVibrancy(v: VibrancySetting): void {
  if (!win || win.isDestroyed() || !isMac) return
  if (v === 'none') {
    win.setVibrancy(null)
    win.setBackgroundColor(APP_BG)
  } else {
    win.setBackgroundColor('#00000000') // necesario para que el material se vea
    win.setVibrancy(v)
  }
}
// ---- Actualizaciones: estado compartido con el chrome (pill) y con Settings ----
function broadcastUpdateState(s: ReturnType<typeof getUpdateState>): void {
  win?.webContents.send('update:state', s)
  for (const t of tabs.values()) {
    if (t.url.includes('/settings.html')) t.view.webContents.send('update:state', s)
  }
}
ipcMain.handle('update:state', () => getUpdateState())
ipcMain.handle('remote:get', () => { const r = remoteState(); return { enabled: r.enabled, port: r.port } })
ipcMain.on('remote:set', (_e, on: boolean) => setRemoteEnabled(!!on))
/**
 * El mismo interruptor, para Settings → MCPs.
 *
 * Va por un canal aparte y con `isInternalSender` porque `monperTab` es el preload de
 * CONTENIDO: existe también en cualquier web que cargues. Sin ese filtro, una página podría
 * encender el puente y quedarse conduciendo tu navegador con tus sesiones. No es teórico: es
 * el mismo agujero que ya tapamos en los permisos de sitios.
 */
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
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.on('update:check', () => void checkForUpdates(true, win))
ipcMain.on('update:download', () => void downloadUpdate())
ipcMain.on('update:install', () => installUpdate())

ipcMain.handle('ui:appearance', () => ({ vibrancy: vibrancyMaterial, options: VIBRANCY_OPTIONS }))
ipcMain.on('ui:setVibrancy', (e, v: VibrancySetting) => {
  if (!isInternalSender(e.senderFrame?.url)) return
  if (!VIBRANCY_OPTIONS.some((o) => o.id === v)) return
  vibrancyMaterial = v
  applyVibrancy(v)
  savePanels()
})
ipcMain.on('ui:setPanel', (_e, which: 'sidebar' | 'chat', width: number) => {
  const L = PANEL_LIMITS
  const w = Math.round(width)
  if (which === 'sidebar') sidebarWidth = Math.min(L.sidebarMax, Math.max(L.sidebarMin, w))
  else chatWidth = Math.min(L.chatMax, Math.max(L.chatMin, w))
  // Solo la activa: esto llega a 60fps mientras arrastras, y redimensionar ahí las vistas
  // ocultas (sin superficie de GPU) es lo que rompía el compositor.
  layoutTabs(true)
  savePanels()
})

ipcMain.handle('ui:collapse', (_e, collapsed: boolean) => {
  sidebarCollapsed = !!collapsed
  lastCollapseAt = Date.now() // suprime el hover falso del botón que aparece bajo el cursor
  hidePeek()
  animateLayout()
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
  if (sidebarCollapsed) ensurePeekWin()
})
ipcMain.handle('ui:chat', (_e, open: boolean) => { chatOpen = !!open; animateLayout() })
// Al editar la URL, oculta la vista nativa (que se dibuja encima del DOM) para que
// el dropdown del omnibox sea visible; se restaura al cerrar el editor.
ipcMain.on('ui:omnibox', (_e, open: boolean) => {
  const t = activeId != null ? tabs.get(activeId) : null
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
  for (const t of tabs.values()) {
    if (isNewtab(t.url)) t.view.webContents.send('bookmarks:changed', list)
  }
  win?.webContents.send('bookmarks:changed', list) // sidebar del chrome
  if (peekWin && !peekWin.isDestroyed()) peekWin.webContents.send('bookmarks:changed', list)
  pushState() // refresca el estado "bookmarked" del chrome
}
function navigateActive(raw: string): void {
  const url = normalizeUrl(raw)
  const t = activeId != null ? tabs.get(activeId) : null
  if (url && t) t.view.webContents.loadURL(url)
}

ipcMain.handle('bookmarks:list', () => conFavicon(listBookmarks()))
ipcMain.on('bookmarks:add', (e: IpcMainEvent, b: Omit<Bookmark, 'id'>) => {
  if (!isInternalSender(e.senderFrame?.url)) return
  addBookmark(b); broadcastBookmarks()
})
ipcMain.on('bookmarks:remove', (e: IpcMainEvent, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return
  removeBookmark(id); broadcastBookmarks()
})
ipcMain.on('tab:navigate', (_e: IpcMainEvent, url: string) => navigateActive(url))
function abrirBookmark(id: string): void {
  const b = listBookmarks().find((x) => x.id === id)
  if (!b) return
  hidePeek()
  // Si ya hay una pestaña viva para este bookmark, actívala; si no, crea una ligada a su slot.
  for (const [tid, t] of tabs) if (t.bookmarkId === id) { setActive(tid); return }
  const tabId = createTab(b.url, true)
  const t = tabs.get(tabId)
  if (t) { t.bookmarkId = id; pushState() }
}
ipcMain.on('bookmarks:open', (_e: IpcMainEvent, id: string) => abrirBookmark(id))

function setTabMuted(id: number, muted: boolean): void {
  const t = tabs.get(id)
  if (!t) return
  t.view.webContents.setAudioMuted(muted)
  t.muted = muted
  pushState()
}
ipcMain.on('tab:toggleMute', (_e: IpcMainEvent, id?: number) => {
  const tid = id ?? activeId
  if (tid == null) return
  const t = tabs.get(tid)
  if (t) setTabMuted(tid, !t.muted)
})

// Menú contextual nativo de un bookmark (click derecho en el BookmarkRow).
ipcMain.on('bookmark:contextMenu', (_e: IpcMainEvent, id: string) => {
  const b = listBookmarks().find((x) => x.id === id)
  if (!b || !win) return
  const template: MenuItemConstructorOptions[] = [
    { label: 'Abrir', click: () => { for (const [tid, t] of tabs) { if (t.bookmarkId === id) { setActive(tid); return } } const nid = createTab(b.url, true); const nt = tabs.get(nid); if (nt) { nt.bookmarkId = id; pushState() } } },
    { label: 'Abrir en pestaña nueva', click: () => createTab(b.url) },
    { label: 'Copiar enlace', click: () => clipboard.writeText(b.url) },
    { type: 'separator' },
    { label: 'Quitar de bookmarks', click: () => { removeBookmark(id); broadcastBookmarks() } }
  ]
  Menu.buildFromTemplate(template).popup({ window: win })
})

// Menú contextual nativo de una pestaña (click derecho en el TabRow).
ipcMain.on('tab:contextMenu', (_e: IpcMainEvent, id: number) => {
  const t = tabs.get(id)
  if (!t || !win) return
  const wc = t.view.webContents
  const ids = [...tabs.keys()]
  const below = ids.slice(ids.indexOf(id) + 1)
  const others = ids.filter((x) => x !== id)
  const internal = isInternal(t.url)
  const template: MenuItemConstructorOptions[] = [
    { label: 'Nueva pestaña', click: () => createTab() },
    { label: 'Duplicar', enabled: !internal, click: () => createTab(t.url) },
    { type: 'separator' },
    { label: 'Recargar', click: () => wc.reload() },
    {
      label: isBookmarked(t.url) ? 'Quitar de bookmarks' : 'Agregar a bookmarks',
      enabled: !internal,
      click: () => { toggleBookmark(t.url, t.title || t.url, t.favicon); broadcastBookmarks() }
    },
    { label: t.muted ? 'Reactivar sonido' : 'Silenciar sitio', click: () => setTabMuted(id, !t.muted) },
    { label: 'Copiar enlace', enabled: !internal, click: () => clipboard.writeText(t.url) },
    { type: 'separator' },
    { label: 'Cerrar', click: () => closeTab(id) },
    { label: 'Cerrar otras', enabled: others.length > 0, click: () => others.forEach(closeTab) },
    { label: 'Cerrar las de abajo', enabled: below.length > 0, click: () => below.forEach(closeTab) }
  ]
  Menu.buildFromTemplate(template).popup({ window: win })
})
ipcMain.on('bookmarks:toggle', () => {
  const t = activeId != null ? tabs.get(activeId) : null
  if (!t || isNewtab(t.url)) return
  toggleBookmark(t.url, t.title || t.url, t.favicon)
  broadcastBookmarks()
})

// Reenvía la interacción con la página al chrome, para cerrar el menú de perfil.
ipcMain.on('tab:pointerdown', () => { if (win && !win.isDestroyed()) win.webContents.send('page:pointerdown') })

// Acciones del menú de perfil
ipcMain.on('ui:devtools', () => toggleDevtools())
// ---- Descargas ----
function broadcastDownloads(): void {
  const list = listDownloads()
  for (const t of tabs.values()) if (t.url.includes('/downloads.html')) t.view.webContents.send('downloads:changed', list)
  win?.webContents.send('downloads:summary', { active: activeDownloadCount(), total: list.length })
}
function openDownloads(): void {
  for (const [id, t] of tabs) if (t.url.includes('/downloads.html')) { setActive(id); return }
  createTab(internalUrl('downloads'))
}
ipcMain.handle('downloads:list', () => listDownloads())
ipcMain.handle('downloads:summary', () => ({ active: activeDownloadCount(), total: listDownloads().length }))
ipcMain.on('downloads:cancel', (_e, id: string) => cancelDownload(id))
ipcMain.on('downloads:open', (_e, id: string) => openDownload(id))
ipcMain.on('downloads:show', (_e, id: string) => showDownload(id))
ipcMain.on('downloads:clear', () => clearDownloads())
ipcMain.on('ui:downloads', () => openDownloads())

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
  win?.webContents.send('chat:prefill', prompt)
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
  for (const [id, t] of tabs) if (t.url.includes('/settings.html')) {
    setActive(id)
    if (section) t.view.webContents.loadURL(internalUrl('settings') + hash)
    return
  }
  createTab(internalUrl('settings') + hash)
}
ipcMain.on('ui:settings', () => openSettings())
ipcMain.on('ui:openChat', () => win?.webContents.send('menu:action', 'toggle-chat'))

// ---- Skills del agente (gestión desde Settings) ----
ipcMain.handle('skills:list', (e) => (isInternalSender(e.senderFrame?.url) ? listSkills() : []))
ipcMain.handle('skills:get', (e, id: string) => (isInternalSender(e.senderFrame?.url) ? getSkill(id) : null))
ipcMain.handle('skills:toggle', (e, id: string, on: boolean) => (isInternalSender(e.senderFrame?.url) ? toggleSkill(id, on) : listSkills()))
ipcMain.on('skills:openFolder', (e) => { if (isInternalSender(e.senderFrame?.url)) shell.openPath(skillsDir()) })

// ---- Perfil ----
function broadcastProfile(): void {
  const p = getProfile()
  win?.webContents.send('profile:changed', p)
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
  const ses = session.fromPartition(PARTITION)
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
const VAULT_W = 320
const VAULT_H = 380
function ensureVaultWin(): BrowserWindow {
  if (vaultWin && !vaultWin.isDestroyed()) return vaultWin
  vaultWin = new BrowserWindow({
    parent: win!, width: VAULT_W, height: VAULT_H, show: false,
    frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, hasShadow: true, roundedCorners: true, backgroundColor: '#1b1b1f',
    webPreferences: { preload: join(__dirname, '../preload/vaultwin.js'), contextIsolation: true, sandbox: false }
  })
  if (RENDERER_URL) vaultWin.loadURL(`${RENDERER_URL}/vault.html`)
  else vaultWin.loadFile(join(__dirname, '../renderer/vault.html'))
  vaultWin.on('blur', () => { if (vaultWin && !vaultWin.isDestroyed()) vaultWin.hide() })
  return vaultWin
}

function notifyVault(): void {
  win?.webContents.send('vault:changed', vault.list())
  if (vaultWin && !vaultWin.isDestroyed() && vaultWin.isVisible()) vaultWin.webContents.send('vault:items', vault.list())
}

/**
 * Un fallo del vault se le DICE al usuario. Es la diferencia entre "tu contraseña no se
 * guardó" y creer que sí y descubrirlo dos semanas después sin poder entrar a un sitio.
 */
function reportVaultError(e: unknown): void {
  const detail = e instanceof Error ? e.message : String(e)
  console.error('[vault]', detail)
  dialog.showMessageBox(win ?? undefined!, {
    type: 'error', buttons: ['OK'], message: 'No se pudo guardar en el Vault', detail
  })
}

ipcMain.handle('vault:list', () => vault.list())
ipcMain.handle('vault:add', (e, type: VaultItemType, label: string, data: Record<string, string>, secret: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return vault.list()
  try { vault.add(type, label, data, secret) } catch (err) { reportVaultError(err) }
  notifyVault(); notifyChatContext()
  return vault.list()
})
ipcMain.handle('vault:remove', (e, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return vault.list()
  vault.remove(id); notifyVault(); notifyChatContext()
  return vault.list()
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
ipcMain.on('vault:capture', async (e, cred: { username: string; password: string }) => {
  const origin = ((): string => { try { return new URL(e.senderFrame?.url || '').origin } catch { return '' } })()
  if (!origin || !/^https?:/.test(origin) || !cred?.password) return
  const host = origin.replace(/^https?:\/\//, '').replace(/^www\./, '')
  const existing = vault.findCredential(origin)
  // Ya guardada con la misma contraseña → no molestar.
  if (existing && vault.getSecret(existing.id) === cred.password) return
  const t = [...tabs.values()].find((tb) => tb.view.webContents === e.sender)
  const icon = await faviconImage(t?.favicon ?? null)
  const update = !!existing
  const { response } = await dialog.showMessageBox(win ?? undefined!, {
    type: 'question',
    icon,
    message: update ? `¿Actualizar la contraseña de ${host}?` : `¿Guardar la contraseña de ${host} en tu Vault?`,
    detail: cred.username ? `Usuario: ${cred.username}` : 'Monper la guardará cifrada.',
    buttons: ['Ahora no', update ? 'Actualizar' : 'Guardar'],
    defaultId: 1,
    cancelId: 0,
    noLink: true
  })
  if (response !== 1) return
  try {
    if (existing) vault.update(existing.id, { data: { ...existing.data, username: cred.username || existing.data.username || '' }, secret: cred.password })
    else vault.add('web-credential', host, { origin, username: cred.username || '' }, cred.password)
  } catch (err) { reportVaultError(err); return }
  notifyVault()
})
ipcMain.on('vault:open', (_e, anchor: MenuAnchor) => {
  const w = ensureVaultWin()
  const cb = win!.getContentBounds()
  const x = Math.round(cb.x + (anchor?.x ?? 0) + (anchor?.width ?? 0) - VAULT_W)
  const y = Math.round(cb.y + (anchor?.y ?? 0) + (anchor?.height ?? 0) + 6)
  w.setBounds({ x: Math.max(cb.x + 8, x), y, width: VAULT_W, height: VAULT_H })
  w.webContents.send('vault:items', vault.list())
  w.show(); w.focus()
})
ipcMain.on('vault:closeWindow', () => { if (vaultWin && !vaultWin.isDestroyed()) vaultWin.hide() })
ipcMain.on('vault:manage', () => {
  if (vaultWin && !vaultWin.isDestroyed()) vaultWin.hide()
  for (const [id, t] of tabs) if (t.url.includes('/settings.html')) { setActive(id); return }
  createTab(internalUrl('settings'))
})

// ---- Omnibox: ventana nativa del dropdown de sugerencias (flota sobre la página) ----
// focusable:false → clicks no le roban el foco al input del chrome; la página no se toca.
let lastOmniData: unknown = null
const omniPopover = createPopover(() => win, {
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
ipcMain.on('omni:choose', (_e, i: number) => win?.webContents.send('omni:chosen', i))
ipcMain.on('omni:hover', (_e, i: number) => win?.webContents.send('omni:hovered', i))

// ---- Site info: popup nativo de info/permisos del sitio (anclado al pill del dominio) ----
function activeUrl(): string {
  const t = activeId != null ? tabs.get(activeId) : null
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
  return { url, origin, domain, secure, internal, permissions }
}
const sitePopover = createPopover(() => win, {
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
ipcMain.on('siteinfo:clear', async () => {
  // "Borrar datos del sitio" es una acción de privacidad: si no se borró, hay que decirlo.
  // Callarlo es dejar al usuario creyendo que sus datos ya no están.
  try {
    await session.fromPartition(PARTITION).clearStorageData({ origin: new URL(activeUrl()).origin })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error('[siteinfo] no se pudieron borrar los datos de', activeUrl(), detail)
    dialog.showMessageBox(win ?? undefined!, {
      type: 'error', buttons: ['OK'],
      message: 'No se pudieron borrar los datos del sitio', detail
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

// ---- Menú de perfil: ventana nativa (flota sobre la página) ----
const pmPopover = createPopover(() => win, {
  name: 'profilemenu', width: 264, height: 380,
  preload: 'profilemenu', page: 'profilemenu',
  data: { channel: 'profilemenu:profile', get: getProfile },
  // El submenú es una ventana aparte: si el menú se va, se va con él.
  onHide: () => submenuPopover.hide(),
  // Mientras el submenú esté abierto, perder el foco NO cierra el menú: se lo ha llevado él.
  keepOnBlur: () => submenuPopover.isVisible()
}, RENDERER_URL)
ipcMain.on('profilemenu:open', (_e, anchor: MenuAnchor) => pmPopover.show(anchor))

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
    parent: win!, width: PEEK_W, height: 200, show: false, frame: false, transparent: true,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, hasShadow: false, skipTaskbar: true, backgroundColor: '#00000000',
    acceptFirstMouse: true, // clicks funcionan sin activar la ventana (no roba foco)
    webPreferences: { preload: join(__dirname, '../preload/peekbar.js'), contextIsolation: true, sandbox: false }
  })
  if (RENDERER_URL) peekWin.loadURL(`${RENDERER_URL}/peekbar.html`)
  else peekWin.loadFile(join(__dirname, '../renderer/peekbar.html'))
  return peekWin
}
function placePeekWin(): void {
  if (!peekWin || peekWin.isDestroyed() || !win) return
  const cb = win.getContentBounds()
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
    if (hadFocus) win?.focus() // devuelve el foco al navegador
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
// Sondea la posición del cursor (fiable entre 2 ventanas) — coyote time al salir.
function startPeekPoll(): void {
  peekLastInside = Date.now()
  if (peekPoll) clearInterval(peekPoll)
  peekPoll = setInterval(() => {
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
  pushState() // refresca el <Sidebar/> del peek con el estado actual
  placePeekWin()
  w.showInactive() // NO roba el foco: el botón de expandir sigue clickeable y sin resaltar items
  w.webContents.send('peek:shown') // dispara la animación de entrada
  startPeekPoll()
}
ipcMain.on('peek:show', (_e, anchor: MenuAnchor) => {
  if (!sidebarCollapsed) return // solo tiene sentido con el sidebar colapsado
  // Al colapsar, el botón de expandir aparece justo debajo del cursor y dispara un
  // mouseenter falso: ignoramos el hover inmediatamente después de colapsar.
  if (Date.now() - lastCollapseAt < 600) return
  const cb = win!.getContentBounds()
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
    if (!r || !sidebarCollapsed) return
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
const BUNDLE_ID = 'com.monper.app'
function configurePasskeys(): void {
  if (!isMac || typeof app.configureWebAuthn !== 'function') return
  const teamId = process.env['MONPER_TEAM_ID'] // Apple Developer Team ID
  if (!teamId) {
    console.log('[passkeys] MONPER_TEAM_ID no definido: passkeys deshabilitados (requiere firma con entitlement).')
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
  for (const t of tabs.values()) {
    if (t.url.includes('/settings.html')) t.view.webContents.send('routines:changed', list)
  }
}
ipcMain.handle('routines:list', (e) => (isInternalSender(e.senderFrame?.url) ? listRoutines() : []))
ipcMain.handle('routines:create', async (e, input: { url: string; request: string; minutes: number }) => {
  if (!isInternalSender(e.senderFrame?.url)) return { ok: false, error: 'No permitido.' }
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
  const url = activeId != null ? tabs.get(activeId)?.url ?? '' : ''
  const isStore = /chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(url)
  const id = isStore ? extensionIdFrom(url) : null
  return {
    items,
    storeCandidate: id ? { id, installed: items.some((e) => e.path.endsWith(id)) } : null,
    installing: extInstalling
  }
}
const extPopover = createPopover(() => win, {
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
  const cb = win!.getContentBounds()
  extPopupWin = new BrowserWindow({
    parent: win!, width: 400, height: 600, show: false, frame: false,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, roundedCorners: true, backgroundColor: '#ffffff',
    x: Math.round(cb.x + cb.width - 420), y: Math.round(cb.y + TOPBAR_HEIGHT),
    webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: false }
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
ipcMain.on('extensions:menu', (_e, path: string) => {
  const ui = extensionUi(path)
  const items: MenuItemConstructorOptions[] = [
    { label: 'Abrir', enabled: !!ui?.popup, click: () => { extPopover.hide(); openExtensionPopup(path) } },
    { label: 'Opciones', enabled: !!ui?.options, click: () => { extPopover.hide(); if (ui?.options) createTab(ui.options) } },
    { type: 'separator' },
    { label: 'Quitar de Monper', click: () => { removeExt(path); sendExtensions() } }
  ]
  Menu.buildFromTemplate(items).popup({ window: extPopover.window ?? win! })
})
ipcMain.on('extensions:browseStore', () => {
  createTab('https://chromewebstore.google.com/category/extensions')
  extPopover.hide()
})
ipcMain.on('extensions:installFromStore', async (e) => {
  // La petición puede venir del popup del puzzle o del botón inyectado en la Store.
  const fromTab = [...tabs.values()].find((t) => t.view.webContents === e.sender)
  const url = fromTab?.url || (activeId != null ? tabs.get(activeId)?.url ?? '' : '')
  extInstalling = true; sendExtensions()
  const r = await installFromStore(url)
  extInstalling = false; sendExtensions()
  // Avisa al botón de la página (si de ahí vino) para que muestre el resultado.
  if (fromTab && !fromTab.view.webContents.isDestroyed()) {
    fromTab.view.webContents.send('extensions:installResult', r)
  }
  if (!r.ok && r.error) {
    const parent = extPopover.isVisible() ? extPopover.window : win
    dialog.showMessageBox(parent!, {
      type: 'error', buttons: ['OK'],
      message: 'No se pudo añadir la extensión',
      detail: r.error
    })
  } else if (r.ok) {
    new Notification({ title: 'Extensión añadida', body: r.name ?? 'Listo' }).show()
  }
})
async function importarExtensionDesdeCarpeta(): Promise<void> {
  const parent = extPopover.window ?? win
  const res = await dialog.showOpenDialog(parent!, {
    title: 'Elige la carpeta de la extensión',
    properties: ['openDirectory']
  })
  const dir = res.filePaths?.[0]
  if (!dir) return
  const r = await addExtension(dir)
  sendExtensions()
  if (!r.ok && r.error) {
    dialog.showMessageBox(parent!, { type: 'error', message: 'No se pudo añadir la extensión', detail: r.error, buttons: ['OK'] })
  }
}
ipcMain.on('extensions:installFromFolder', () => void importarExtensionDesdeCarpeta())

// ---- Quick sign-in: "Sign in with…" al detectar un login con credenciales guardadas ----
const SIGNIN_W = 360
let signinTabId: number | null = null
let signinCreds: unknown = null
const signinDismissed = new Set<string>() // orígenes descartados en esta sesión
const signinPopover = createPopover(() => win, {
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
  const cb = contentBounds()
  signinPopover.show({ x: cb.x + 16 + 12, y: cb.y + 12, width: 0, height: 0 })
}
function hideSignin(): void { signinTabId = null; signinPopover.hide() }
ipcMain.on('autofill:loginForm', (e, hasForm: boolean) => {
  const entry = [...tabs.entries()].find(([, t]) => t.view.webContents === e.sender)
  if (!entry) return
  const [id, t] = entry
  if (!hasForm) { if (signinTabId === id) hideSignin(); return }
  if (id !== activeId) return
  const origin = ((): string => { try { return new URL(t.url).origin } catch { return '' } })()
  if (!origin || signinDismissed.has(origin)) return
  const creds = credentialsFor(origin)
  if (!creds.length) return
  signinTabId = id
  signinCreds = creds
  showSignin()
})
ipcMain.on('signin:fill', async (_e, itemId: string) => {
  const t = signinTabId != null ? tabs.get(signinTabId) : null
  hideSignin()
  if (t) await fillFromVault(t.view.webContents, itemId) // el secreto nunca sale del main
})
ipcMain.on('signin:dismiss', () => {
  const t = signinTabId != null ? tabs.get(signinTabId) : null
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
          { id: 'all', label: 'Show all downloads', icon: 'download', action: 'downloads:all', primary: true },
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
          { id: 'manage', label: 'Manage all extensions', icon: 'puzzle', action: 'extensions:manage', primary: true },
          { id: 'import', label: 'Import extensions', icon: 'download', action: 'extensions:import', primary: true },
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
        rows: items.slice(0, 12).map((b) => ({
          id: b.id,
          label: b.title || b.url,
          image: b.favicon ?? null,
          icon: 'bookmark' as const,
          action: `bookmarks:open:${b.id}`
        }))
      }
    }
    case 'history': {
      return {
        section: 'history',
        rows: historyRecent(10).map((h) => ({
          id: h.url,
          label: h.title || h.url,
          sub: (() => { try { return new URL(h.url).hostname.replace(/^www\./, '') } catch { return '' } })(),
          image: h.favicon ?? null,
          icon: 'history' as const,
          action: `history:open:${h.url}`
        }))
      }
    }
    case 'developers': {
      const r = remoteState()
      return {
        section: 'developers',
        listLabel: 'Advanced',
        rows: [
          { id: 'devtools', label: 'Developer tools', icon: 'code', meta: '⌥⌘I', action: 'dev:devtools', primary: true },
          { id: 'reload', label: 'Recargar sin caché', icon: 'gauge', meta: '⇧⌘R', action: 'dev:hardReload', primary: true },
          {
            id: 'remote',
            label: 'Remote debugging',
            sub: r.enabled ? `Escuchando en 127.0.0.1:${r.port}` : 'Deja que una IA externa controle el navegador',
            toggle: true,
            on: r.enabled,
            action: 'dev:remote'
          },
          ...(r.enabled
            ? [{ id: 'token', label: 'Copiar token de acceso', icon: 'code' as const, action: 'dev:copyToken' }]
            : [])
        ]
      }
    }
  }
}

const submenuPopover = createPopover(() => win, {
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
  const cb = win?.getContentBounds()
  extPopover.show({ x: Math.round((cb?.width ?? 800) / 2) - 20, y: TOPBAR_HEIGHT - 8, width: 40, height: 28 })
}

ipcMain.on('profilemenu:submenu', (_e, section: SubmenuSection, rect: { top: number; height: number }) => {
  const pm = pmPopover.window
  if (!pm || !win) return
  submenuSección = section
  const pmb = pm.getBounds()
  const cb = win.getContentBounds()
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
ipcMain.on('profilesubmenu:action', (_e, action: string) => {
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
    case 'history:open': createTab(arg); break
    case 'dev:devtools': toggleDevtools(); break
    case 'dev:hardReload': activeWc()?.reloadIgnoringCache(); break
    case 'dev:copyToken': clipboard.writeText(remoteState().token); break
  }
})

ipcMain.on('profilemenu:action', (_e, name: string) => {
  pmPopover.hide()
  switch (name) {
    case 'new-tab':
    case 'bookmarks': createTab(); break
    case 'settings': openSettings(); break
    case 'downloads': openDownloads(); break
    case 'developers': toggleDevtools(); break
    // TODO: new-profile, switch-profile, extensions, history, incognito
  }
})

// ---- Proveedores de IA (gestión desde la página de Settings, sender-validada) ----
function notifyChatContext(): void { win?.webContents.send('chat:contextChanged', getChatContext()) }
ipcMain.handle('providers:list', (e) => (isInternalSender(e.senderFrame?.url) ? listProviders() : []))
ipcMain.handle('providers:add', (e, input: { label: string; kind: ProviderKind; baseUrl?: string }, apiKey: string) => {
  if (!isInternalSender(e.senderFrame?.url)) { console.warn('[providers:add] denegado, sender:', e.senderFrame?.url); return listProviders() }
  try { addProvider(input, apiKey) } catch (err) { reportVaultError(err) }
  notifyChatContext(); notifyVault()
  return listProviders()
})
ipcMain.handle('providers:remove', (e, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return []
  removeProvider(id)
  notifyChatContext(); notifyVault()
  return listProviders()
})
ipcMain.handle('providers:setActive', (e, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return []
  setActiveProvider(id)
  notifyChatContext(); notifyVault()
  return listProviders()
})
// El chrome (composer) pide el contexto del chat: proveedor activo + modelos + modelo elegido
ipcMain.handle('chat:context', () => getChatContext())
ipcMain.on('chat:setModel', (_e, id: string) => setModel(id))
ipcMain.on('chat:setEffort', (_e, e: 'low' | 'medium' | 'high') => setEffort(e))

// ---- Chat en streaming (desde el ChatPanel del chrome) ----
let chatAbort: AbortController | null = null
// El agente está operando el navegador; `controlledTabId` es la pestaña concreta que controla.
let agentRunning = false
let controlledTabId: number | null = null
// La leyenda de control solo se muestra en la pestaña que el agente controla de verdad.
function controllingActive(): boolean {
  return agentRunning && activeId != null && activeId === controlledTabId
}
function setAgentRunning(on: boolean): void {
  if (agentRunning === on) return
  agentRunning = on
  controlledTabId = on ? activeId : null // arranca controlando la pestaña activa
  layoutActive() // ajusta la franja inferior de la vista nativa
  pushState()
}
// El agente movió su foco a otra pestaña (open_tab/switch_tab): sigue la leyenda.
function setControlledTab(id: number): void {
  if (!agentRunning) return
  controlledTabId = id
  layoutActive()
  pushState()
}
// Cola de eventos asíncronos del navegador (popups, descargas) para steering del agente.
let agentEvents: string[] = []
function pushAgentEvent(msg: string): void { if (agentEvents.length < 20) agentEvents.push(msg) }
ipcMain.on('chat:cancel', () => { chatAbort?.abort() })
// El historial de chats vive en el chrome como el propio chat, así que estos canales no
// llevan la guarda de `isInternalSender` — igual que `chat:send`.
ipcMain.handle('chats:list', () => listSessions())
ipcMain.handle('chats:resume', () => resumeOrNew())
ipcMain.handle('chats:new', () => startSession())
ipcMain.handle('chats:open', (_e, id: string) => openSession(id))
ipcMain.handle('chats:forNext', (_e, id: string) => sessionForNextMessage(id))
ipcMain.on('chats:save', (_e, id: string, messages) => saveSession(id, messages))
ipcMain.on('chats:remove', (_e, id: string) => removeChatSession(id))
// "Take over": el usuario retoma el control → aborta el agente.
ipcMain.on('agent:takeOver', () => { chatAbort?.abort() })
ipcMain.handle('chat:send', async (_e, messages: ChatMessage[]) => {
  const active = getActiveProvider()
  if (!active) { win?.webContents.send('chat:error', 'No hay proveedor de IA conectado. Conéctalo en Settings.'); return }
  chatAbort?.abort()
  agentEvents = [] // limpia eventos viejos al iniciar un turno
  chatAbort = new AbortController()
  setAgentRunning(true)
  const send = (ch: string, payload?: unknown): void => { win?.webContents.send(ch, payload) }
  try {
    // Agente Mastra con herramientas: opera la pestaña activa + gestión de pestañas (anthropic y openai).
    await runMastra({
      provider: active.provider, key: active.key, model: active.model,
      messages, signal: chatAbort.signal, skills: enabledSkills(),
      control: {
        getWc: () => (activeId != null ? tabs.get(activeId)?.view.webContents : undefined),
        listTabs: () => [...tabs.entries()].map(([id, t]) => ({ id, title: t.title, url: t.url, active: id === activeId })),
        openTab: (url) => { const id = createTab(url, true, true); setControlledTab(id); return id },
        switchTab: (id) => { if (!tabs.has(id)) return false; setActive(id); setControlledTab(id); return true },
        closeTab: (id) => { if (!tabs.has(id)) return false; closeTab(id); return true },
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
      emit: {
        token: (tok) => send('chat:token', tok),
        step: (s) => send('chat:step', s),
        stepImage: (d) => send('chat:stepImage', d),
        error: (m) => send('chat:error', m)
      }
    })
    send('chat:done')
  } catch (err) {
    if (!(err instanceof Error && err.name === 'AbortError')) {
      console.error('[agent] turno falló:', err)
      send('chat:error', errText(err))
    }
  } finally {
    setAgentRunning(false)
  }
})

// ⌘⌥V cicla los materiales de vibrancy en vivo (ver VIBRANCY_MATERIALS arriba).
ipcMain.on('ui:cycleVibrancy', () => {
  if (!win || !isMac) return
  // Cicla solo entre materiales; 'none' se elige desde Settings.
  const i = VIBRANCY_MATERIALS.indexOf(vibrancyMaterial as VibrancyMaterial)
  vibrancyMaterial = VIBRANCY_MATERIALS[(i + 1) % VIBRANCY_MATERIALS.length]
  applyVibrancy(vibrancyMaterial)
  savePanels()
  console.log('[vibrancy]', vibrancyMaterial, '· ⌘⌥V para el siguiente')
})

app.whenReady().then(() => {
  // En dev muestra nuestro icono en el dock (mac) en vez del de Electron.
  if (isMac && app.dock) app.dock.setIcon(appIcon)
  // Panel "Acerca de Monper" con nuestra info en vez de la de Electron.
  app.setAboutPanelOptions({
    applicationName: 'Monper',
    applicationVersion: app.getVersion(),
    copyright: '© 2026 Monper',
    credits: 'Un navegador agéntico de escritorio'
  })
  buildAppMenu()
  initPermissions()
  const ses = session.fromPartition(PARTITION)
  // UA de Chrome limpia (sin "Electron"/"monper"): apps como Figma rompen y Google
  // bloquea el login si detectan un navegador embebido.
  const platformUA = isMac
    ? 'Macintosh; Intel Mac OS X 10_15_7'
    : process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64'
  ses.setUserAgent(`Mozilla/5.0 (${platformUA}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`)
  configurePasskeys()
  attachPermissionHandlers(ses, {
    getWindow: () => win,
    onMedia: (wc, active) => {
      for (const tb of tabs.values()) {
        if (tb.view.webContents === wc) { tb.recording = active; pushState(); break }
      }
    }
  })
  // Descargas: rastreo para el gestor + aviso al agente como steering.
  initDownloads(broadcastDownloads)
  attachDownloads(ses)
  // Electron no persiste extensiones entre arranques: se recargan aquí.
  void initExtensions(ses)
  ses.on('will-download', (_e, item) => {
    pushAgentEvent(`Descarga iniciada: ${item.getFilename()} (${item.getURL()})`)
  })
  initBookmarks()
  initFavicons()
  // Control remoto: apagado salvo que el usuario lo dejara encendido (ver remote.ts).
  initRemote({
    activeWc: () => activeWc(),
    wcFor: (id) => tabs.get(id)?.view.webContents,
    listTabs: () => [...tabs.entries()].map(([id, t]) => ({ id, url: t.url, title: t.title })),
    activateTab: (id) => setActive(id),
    // `activate` invertido: para un cliente externo lo normal es NO robar el foco.
    newTab: (url, background) => createTab(url, !background),
    navigate: (url) => navigateActive(url),
    /**
     * El permiso se pide con un diálogo nativo, no en el DOM: la vista de la página se dibuja
     * encima del chrome, así que un modal HTML podría quedar tapado — justo el sitio donde no
     * puede pasar. Y va con `noLink` y "No permitir" por defecto: ante la duda, que no.
     */
    confirmClient: async (nombre) => {
      const { response } = await dialog.showMessageBox(win ?? undefined!, {
        type: 'warning',
        message: `«${nombre}» quiere conducir tu navegador`,
        detail:
          'Podrá abrir páginas, leerlas y actuar en los sitios donde tengas la sesión abierta, ' +
          'igual que tú. No puede ver tus contraseñas ni usar el vault.\n\n' +
          'Solo para esta sesión: al cerrar Monper se olvida.',
        buttons: ['No permitir', 'Permitir'],
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
    win?.webContents.send('remote:state', r)
    if (peekWin && !peekWin.isDestroyed()) peekWin.webContents.send('remote:state', r)
  })
  initChats()
  initHistory()
  initSkills()
  initQuickActions()
  initProfile()
  initWindowState()
  loadPanels()
  vault.initVault()
  initAI()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('before-quit', () => saveSessionNow())
app.on('window-all-closed', () => { if (!isMac) app.quit() })
