import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { app, BrowserWindow, Menu, WebContentsView, clipboard, dialog, ipcMain, nativeImage, net, session } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import type { IpcMainEvent } from 'electron'
import type { BrowserState, Bookmark, ChatMessage, MenuAnchor, ProviderKind } from '../shared/types'
import { initBookmarks, listBookmarks, isBookmarked, addBookmark, removeBookmark, toggleBookmark } from './bookmarks'
import { initAI, listProviders, addProvider, removeProvider, setActive as setActiveProvider, setModel, setEffort, getChatContext, getActiveProvider } from './ai/store'
import { runMastra } from './agent/mastra'
import { initHistory, recordVisit, updateMeta } from './history'
import { initWindowState, initialBounds, shouldMaximize, trackWindow } from './windowState'
import { suggest } from './suggest'
import { initPermissions, attachPermissionHandlers, stateOf, setState, requestedKeys } from './permissions'
import { initSkills, listSkills, getSkill, toggleSkill, enabledSkills } from './skills'
import { initProfile, getProfile, setProfile, setAvatar } from './profile'
import { initDownloads, attachDownloads, listDownloads, activeDownloadCount, cancelDownload, openDownload, showDownload, clearDownloads } from './downloads'
import { initQuickActions, listQuickActions, saveQuickAction, removeQuickAction, getQuickAction, fillTemplate } from './quickactions'
import * as vault from './vault/store'
import type { VaultItemType } from '../shared/vault'
import type { SiteInfoData, PermKey, PermState } from '../shared/types'
import appIcon from '../renderer/src/assets/icon.png?asset'

const SIDEBAR_WIDTH = 240
const CHAT_WIDTH = 380 // panel de chat derecho (debe coincidir con --spacing-panel en CSS)
const TOPBAR_HEIGHT = 52
const CONTENT_RADIUS = 32 // debe coincidir con rounded-t[l/r] en Content.tsx
const PARTITION = 'persist:monper'
const isMac = process.platform === 'darwin'

// Nombre de la app: debe fijarse ANTES de whenReady para que el menú de macOS
// y el dock muestren "Monper" en vez de "Electron" (dev incluido).
app.setName('Monper')

// Páginas internas servidas por nuestro propio renderer (new-tab, settings…).
const RENDERER_URL_EARLY = process.env['ELECTRON_RENDERER_URL']
const INTERNAL_PAGES = ['newtab', 'settings', 'error', 'downloads'] as const
function internalUrl(page: (typeof INTERNAL_PAGES)[number]): string {
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
  return INTERNAL_PAGES.some((p) => url.includes(`/${p}.html`))
}
/** Sólo las páginas internas pueden leer/escribir datos privados vía IPC */
function isInternalSender(url: string | undefined): boolean {
  return !!url && isInternal(url)
}

interface Tab {
  view: WebContentsView
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
  const left = sidebarCollapsed ? 0 : SIDEBAR_WIDTH
  const right = chatOpen ? CHAT_WIDTH : 0
  // Solo si la pestaña activa es la que el agente está controlando, reserva la franja de la leyenda.
  const bottom = controllingActive() ? CONTROLLED_STRIP : 0
  return { x: left, y: TOPBAR_HEIGHT, width: Math.max(0, w - left - right), height: Math.max(0, h - TOPBAR_HEIGHT - bottom) }
}

function applyRadius(t: Tab) {
  if (typeof t.view.setBorderRadius === 'function') {
    // Redondea cuando la página "flota" (sidebar izq y/o panel de chat der).
    const rounded = !sidebarCollapsed || chatOpen
    t.view.setBorderRadius(rounded ? CONTENT_RADIUS : 0)
  }
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
const WARM_MAX = 8
const warmOrder: number[] = []
function touchWarm(id: number): void {
  const i = warmOrder.indexOf(id)
  if (i >= 0) warmOrder.splice(i, 1)
  warmOrder.unshift(id)
}

function layoutTabs() {
  if (!win || win.isDestroyed()) return
  const cb = contentBounds()
  const warm = new Set(warmOrder.slice(0, WARM_MAX))
  for (const [id, t] of tabs) {
    // Visible si es la activa o está en el warm set; las demás se ocultan (no renderizan).
    t.view.setVisible(id === activeId || warm.has(id))
    t.view.setBounds(cb)
    applyRadius(t)
  }
  const at = activeId != null ? tabs.get(activeId) : null
  if (at) win.contentView.addChildView(at.view) // activa al frente
}
// Alias: llamadas existentes que solo querían recolocar la vista activa.
function layoutActive() { layoutTabs() }

// Anima los bounds de TODAS las vistas en sync con la transición CSS del content.
const COLLAPSE_MS = 180
let collapseAnim: NodeJS.Timeout | null = null
function animateLayout() {
  if (!win || win.isDestroyed() || tabs.size === 0) return
  for (const t of tabs.values()) applyRadius(t)
  const starts = new Map([...tabs].map(([id, t]) => [id, t.view.getBounds()]))
  const target = contentBounds()
  const t0 = Date.now()
  if (collapseAnim) clearInterval(collapseAnim)
  collapseAnim = setInterval(() => {
    const p = Math.min(1, (Date.now() - t0) / COLLAPSE_MS)
    const e = 1 - Math.pow(1 - p, 3) // easeOutCubic (matchea el cubic-bezier del CSS)
    for (const [id, t] of tabs) {
      const s = starts.get(id)
      if (!s) continue
      t.view.setBounds({
        x: Math.round(s.x + (target.x - s.x) * e),
        y: target.y,
        width: Math.round(s.width + (target.width - s.width) * e),
        height: target.height
      })
    }
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

function pushState() {
  if (!win || win.isDestroyed()) return
  const t = activeId != null ? tabs.get(activeId) : null
  const displayUrl = (u: string) => (isInternal(u) ? '' : u)
  const state: BrowserState = {
    activeId,
    tabs: [...tabs.entries()].map(([id, tb]) => ({
      id, url: tb.errorUrl ?? displayUrl(tb.url), title: tb.title || 'Nueva pestaña', favicon: tb.favicon, loading: tb.loading, recording: tb.recording, muted: tb.muted, audible: tb.audible, agent: tb.agent, bookmarkId: tb.bookmarkId
    })),
    active: t
      ? {
          url: t.errorUrl ?? displayUrl(t.url), title: t.title, canBack: t.canBack, canForward: t.canForward,
          loading: t.loading, pageColor: t.pageBg || t.themeColor, bookmarked: isBookmarked(t.errorUrl ?? t.url),
          muted: t.muted, audible: t.audible
        }
      : null,
    controlling: controllingActive()
  }
  win.webContents.send('state:update', state)
}

// Muestrea el color visible justo debajo del topbar para fundirlo con la página.
function sampleTopColor(t: Tab): void {
  t.view.webContents.executeJavaScript(`(() => {
    const transparent = (c) => !c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
    const bgOf = (el) => { const c = getComputedStyle(el).backgroundColor; return transparent(c) ? null : c; };
    // Muestrea el color en la esquina superior-izquierda (donde está la muesca del
    // redondeado nativo), subiendo hasta un fondo opaco. Así la franja que rellena
    // esa muesca coincide y el borde superior del page view se ve recto.
    const colorAt = (x, y) => { let el = document.elementFromPoint(x, y); while (el) { const c = bgOf(el); if (c) return c; el = el.parentElement; } return null; };
    return colorAt(6, 6) || colorAt(Math.floor(innerWidth / 2), 3)
      || bgOf(document.body) || bgOf(document.documentElement) || '#ffffff';
  })()`, true).then((c: string) => {
    t.pageBg = c
    // Alinea el fondo opaco de la vista con el color real de la página: así el frame en
    // blanco al cambiar de pestaña coincide con la página (sin flash blanco en páginas oscuras).
    const hex = rgbToHex(c)
    if (hex && typeof t.view.setBackgroundColor === 'function') t.view.setBackgroundColor(hex)
    pushState()
  }).catch(() => {})
}

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
  // Fondo opaco: sin esto la vista es transparente y, en el frame en blanco al cambiar
  // de pestaña, se ve el fondo de la ventana (gris/escritorio). Blanco = como la mayoría
  // de páginas; se ajusta al color real de la página cuando lo muestreamos.
  if (typeof view.setBackgroundColor === 'function') view.setBackgroundColor('#ffffff')
  const t: Tab = { view, url, title: '', favicon: null, loading: false, canBack: false, canForward: false, themeColor: null, pageBg: null, recording: false, muted: false, audible: false, agent, bookmarkId: null, errorUrl: null }
  tabs.set(id, t)
  touchWarm(id) // pestaña recién creada: entra al warm set
  win!.contentView.addChildView(view)

  const wc = view.webContents
  const nav = wc.navigationHistory
  const refresh = () => { t.canBack = nav.canGoBack(); t.canForward = nav.canGoForward(); pushState() }
  wc.on('did-start-loading', () => { t.loading = true; pushState() })
  wc.on('did-stop-loading', () => {
    t.loading = false
    sampleTopColor(t)
    refresh()
  })
  wc.on('did-navigate', (_e, u) => { // sólo main-frame
    t.url = u; t.recording = false
    // Al navegar a algo que NO es la página de error, limpiamos el estado de error y registramos la visita.
    if (!isErrorPage(u)) { t.errorUrl = null; if (!isInternal(u)) recordVisit(u, t.title, t.favicon) }
    applyZoom(wc, u) // restaura el zoom recordado para el origen
    refresh()
    scheduleSaveSession()
  })
  wc.on('did-navigate-in-page', (_e, u, isMainFrame) => { if (isMainFrame) { t.url = u; refresh() } })
  wc.on('page-title-updated', (_e, title) => { t.title = title; updateMeta(t.url, title); pushState() })
  wc.on('page-favicon-updated', (_e, icons) => { t.favicon = icons?.[0] || null; updateMeta(t.url, undefined, t.favicon); pushState() })
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
    // Popups reales (OAuth, pagos…): window.open con dimensiones o disposition new-window
    // → abrir una ventana de verdad (mantiene window.opener/postMessage/window.close).
    const isPopup = details.disposition === 'new-window' || details.disposition === 'other' || /\b(width|height|popup)\b/i.test(feats)
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
  activeId = id
  touchWarm(id) // la activa entra/sube en el warm set
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
    const remaining = [...tabs.keys()]
    if (remaining.length) setActive(remaining[remaining.length - 1])
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
  try { writeFileSync(sessionFile(), JSON.stringify(collectSession())) } catch { /* noop */ }
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
    ...initialBounds(1440 + SIDEBAR_WIDTH, 900 + TOPBAR_HEIGHT),
    minWidth: 720,
    minHeight: 480,
    show: false,
    // Fondo transparente en mac para que la vibrancy nativa se vea a través del
    // sidebar (que es HTML transparente). Compatible con el semáforo nativo
    // porque ya no usamos setWindowButtonVisibility(false).
    ...(isMac
      ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const, backgroundColor: '#00000000' }
      : { backgroundColor: '#111114' }),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 15, y: 17 } : undefined,
    ...(isMac ? {} : { icon: appIcon }),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: false }
  })

  if (shouldMaximize()) win.maximize()
  win.once('ready-to-show', () => {
    if (isMac) win!.setVibrancy('under-window')
    win!.show()
  })
  trackWindow(win)

  loadRenderer(win, 'index')
  win.on('resize', () => { layoutActive(); hideOmni() })
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
    ensureSiteWin(); ensurePmWin()
  })
}

// ---- IPC ----
ipcMain.handle('tabs:new', () => createTab())
ipcMain.on('tabs:reorder', (_e, orderedIds: number[]) => reorderTabs(orderedIds))
ipcMain.handle('tabs:close', (_e, id: number) => closeTab(id))
ipcMain.handle('tabs:select', (_e, id: number) => setActive(id))
ipcMain.handle('nav:go', (_e, raw: string) => {
  const url = normalizeUrl(raw)
  const t = activeId != null ? tabs.get(activeId) : null
  if (url && t) t.view.webContents.loadURL(url)
})
ipcMain.handle('nav:back', () => { const t = activeId != null ? tabs.get(activeId) : null; if (t?.view.webContents.navigationHistory.canGoBack()) t.view.webContents.navigationHistory.goBack() })
ipcMain.handle('nav:forward', () => { const t = activeId != null ? tabs.get(activeId) : null; if (t?.view.webContents.navigationHistory.canGoForward()) t.view.webContents.navigationHistory.goForward() })
ipcMain.handle('nav:reload', () => { const t = activeId != null ? tabs.get(activeId) : null; t?.view.webContents.reload() })
ipcMain.handle('ui:collapse', (_e, collapsed: boolean) => { sidebarCollapsed = !!collapsed; animateLayout() })
ipcMain.handle('ui:chat', (_e, open: boolean) => { chatOpen = !!open; animateLayout() })
// Al editar la URL, oculta la vista nativa (que se dibuja encima del DOM) para que
// el dropdown del omnibox sea visible; se restaura al cerrar el editor.
ipcMain.on('ui:omnibox', (_e, open: boolean) => {
  const t = activeId != null ? tabs.get(activeId) : null
  if (t) t.view.setVisible(!open)
})

// ---- Bookmarks ----
function broadcastBookmarks(): void {
  const list = listBookmarks()
  for (const t of tabs.values()) {
    if (isNewtab(t.url)) t.view.webContents.send('bookmarks:changed', list)
  }
  win?.webContents.send('bookmarks:changed', list) // sidebar del chrome
  pushState() // refresca el estado "bookmarked" del chrome
}
function navigateActive(raw: string): void {
  const url = normalizeUrl(raw)
  const t = activeId != null ? tabs.get(activeId) : null
  if (url && t) t.view.webContents.loadURL(url)
}

ipcMain.handle('bookmarks:list', () => listBookmarks())
ipcMain.on('bookmarks:add', (e: IpcMainEvent, b: Omit<Bookmark, 'id'>) => {
  if (!isInternalSender(e.senderFrame?.url)) return
  addBookmark(b); broadcastBookmarks()
})
ipcMain.on('bookmarks:remove', (e: IpcMainEvent, id: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return
  removeBookmark(id); broadcastBookmarks()
})
ipcMain.on('tab:navigate', (_e: IpcMainEvent, url: string) => navigateActive(url))
ipcMain.on('bookmarks:open', (_e: IpcMainEvent, id: string) => {
  const b = listBookmarks().find((x) => x.id === id)
  if (!b) return
  // Si ya hay una pestaña viva para este bookmark, actívala; si no, crea una ligada a su slot.
  for (const [tid, t] of tabs) if (t.bookmarkId === id) { setActive(tid); return }
  const tabId = createTab(b.url, true)
  const t = tabs.get(tabId)
  if (t) { t.bookmarkId = id; pushState() }
})

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

// ---- Perfil ----
function broadcastProfile(): void {
  const p = getProfile()
  win?.webContents.send('profile:changed', p)
  if (pmWin && !pmWin.isDestroyed()) pmWin.webContents.send('profilemenu:profile', p)
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
let suggestAbort: AbortController | null = null
ipcMain.handle('omni:suggest', async (_e, query: string) => {
  suggestAbort?.abort()
  suggestAbort = new AbortController()
  try { return await suggest(query, suggestAbort.signal) } catch { return [] }
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

ipcMain.handle('vault:list', () => vault.list())
ipcMain.handle('vault:add', (e, type: VaultItemType, label: string, data: Record<string, string>, secret: string) => {
  if (!isInternalSender(e.senderFrame?.url)) return vault.list()
  vault.add(type, label, data, secret); notifyVault(); notifyChatContext()
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
  if (existing) vault.update(existing.id, { data: { ...existing.data, username: cred.username || existing.data.username || '' }, secret: cred.password })
  else vault.add('web-credential', host, { origin, username: cred.username || '' }, cred.password)
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
let omniWin: BrowserWindow | null = null
const OMNI_PAD = 12 // padding (p-3) del contenido, para el borde/sombra
let omniRect: { x: number; y: number; width: number; height: number } | null = null
let lastOmniData: unknown = null
function ensureOmniWin(): BrowserWindow {
  if (omniWin && !omniWin.isDestroyed()) return omniWin
  omniWin = new BrowserWindow({
    parent: win!, show: false, frame: false, transparent: true, focusable: false,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, hasShadow: false, skipTaskbar: true, backgroundColor: '#00000000',
    webPreferences: { preload: join(__dirname, '../preload/omnibox.js'), contextIsolation: true, sandbox: false }
  })
  // Reenvía los datos actuales cuando el renderer terminó de cargar (primer show).
  omniWin.webContents.on('did-finish-load', () => {
    if (lastOmniData && omniWin && !omniWin.isDestroyed()) omniWin.webContents.send('omni:data', lastOmniData)
  })
  if (RENDERER_URL) omniWin.loadURL(`${RENDERER_URL}/omnibox.html`)
  else omniWin.loadFile(join(__dirname, '../renderer/omnibox.html'))
  return omniWin
}
function placeOmni(winHeight: number): void {
  if (!omniWin || omniWin.isDestroyed() || !omniRect || !win) return
  const cb = win.getContentBounds()
  omniWin.setBounds({
    x: Math.round(cb.x + omniRect.x - OMNI_PAD),
    y: Math.round(cb.y + omniRect.y + omniRect.height - 2),
    width: Math.round(omniRect.width + OMNI_PAD * 2),
    height: Math.max(1, Math.round(winHeight))
  })
}
function hideOmni(): void { if (omniWin && !omniWin.isDestroyed()) omniWin.hide() }
ipcMain.on('omni:show', (_e, rect: typeof omniRect, data) => {
  omniRect = rect
  lastOmniData = data
  const w = ensureOmniWin()
  w.webContents.send('omni:data', data)
  if (!w.isVisible()) w.showInactive()
})
ipcMain.on('omni:update', (_e, data) => { lastOmniData = data; if (omniWin && !omniWin.isDestroyed()) omniWin.webContents.send('omni:data', data) })
ipcMain.on('omni:height', (_e, h: number) => placeOmni(h + OMNI_PAD * 2))
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
  try { const u = new URL(url); origin = u.origin; domain = u.hostname.replace(/^www\./, '') } catch { /* noop */ }
  const internal = isInternal(url) || !origin
  const secure = /^https:\/\//i.test(url)
  const permissions = internal ? [] : requestedKeys(origin).map((key) => ({ key, state: stateOf(origin, key) }))
  return { url, origin, domain, secure, internal, permissions }
}
let siteWin: BrowserWindow | null = null
const SITE_W = 340
const SITE_PAD = 12
let siteAnchor: MenuAnchor | null = null
let lastSiteHeight = 200
function ensureSiteWin(): BrowserWindow {
  if (siteWin && !siteWin.isDestroyed()) return siteWin
  siteWin = new BrowserWindow({
    parent: win!, width: SITE_W, height: 240, show: false, frame: false, transparent: true,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, hasShadow: false, skipTaskbar: true, backgroundColor: '#00000000',
    webPreferences: { preload: join(__dirname, '../preload/siteinfo.js'), contextIsolation: true, sandbox: false }
  })
  siteWin.on('blur', () => { if (siteWin && !siteWin.isDestroyed()) siteWin.hide() })
  siteWin.webContents.on('did-finish-load', () => { if (siteWin && !siteWin.isDestroyed()) siteWin.webContents.send('siteinfo:data', buildSiteInfo()) })
  if (RENDERER_URL) siteWin.loadURL(`${RENDERER_URL}/siteinfo.html`)
  else siteWin.loadFile(join(__dirname, '../renderer/siteinfo.html'))
  return siteWin
}
function placeSiteWin(height: number): void {
  if (!siteWin || siteWin.isDestroyed() || !siteAnchor || !win) return
  const cb = win.getContentBounds()
  siteWin.setBounds({
    x: Math.max(cb.x + 4, Math.round(cb.x + siteAnchor.x - SITE_PAD)),
    y: Math.round(cb.y + siteAnchor.y + siteAnchor.height - 4),
    width: SITE_W,
    height: Math.max(1, Math.round(height))
  })
}
ipcMain.on('siteinfo:open', (_e, anchor: MenuAnchor) => {
  siteAnchor = anchor
  const w = ensureSiteWin()
  w.webContents.send('siteinfo:data', buildSiteInfo())
  placeSiteWin(lastSiteHeight) // posiciona en el anchor antes de mostrar (evita el flash)
  w.show(); w.focus()
})
ipcMain.on('siteinfo:height', (_e, h: number) => { lastSiteHeight = h + SITE_PAD * 2; placeSiteWin(lastSiteHeight) })
ipcMain.on('siteinfo:toggle', (_e, key: PermKey, state: PermState) => {
  try { setState(new URL(activeUrl()).origin, key, state) } catch { /* noop */ }
  if (siteWin && !siteWin.isDestroyed()) siteWin.webContents.send('siteinfo:data', buildSiteInfo())
})
ipcMain.on('siteinfo:clear', async () => {
  try { await session.fromPartition(PARTITION).clearStorageData({ origin: new URL(activeUrl()).origin }) } catch { /* noop */ }
  if (siteWin && !siteWin.isDestroyed()) siteWin.hide()
})
ipcMain.on('siteinfo:close', () => { if (siteWin && !siteWin.isDestroyed()) siteWin.hide() })

// ---- Menú de perfil: ventana nativa (flota sobre la página) ----
let pmWin: BrowserWindow | null = null
const PM_W = 264
const PM_PAD = 12
let pmAnchor: MenuAnchor | null = null
let lastPmHeight = 380
function ensurePmWin(): BrowserWindow {
  if (pmWin && !pmWin.isDestroyed()) return pmWin
  pmWin = new BrowserWindow({
    parent: win!, width: PM_W, height: 200, show: false, frame: false, transparent: true,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, hasShadow: false, skipTaskbar: true, backgroundColor: '#00000000',
    webPreferences: { preload: join(__dirname, '../preload/profilemenu.js'), contextIsolation: true, sandbox: false }
  })
  pmWin.on('blur', () => { if (pmWin && !pmWin.isDestroyed()) pmWin.hide() })
  pmWin.webContents.on('did-finish-load', () => { if (pmWin && !pmWin.isDestroyed()) pmWin.webContents.send('profilemenu:profile', getProfile()) })
  if (RENDERER_URL) pmWin.loadURL(`${RENDERER_URL}/profilemenu.html`)
  else pmWin.loadFile(join(__dirname, '../renderer/profilemenu.html'))
  return pmWin
}
function placePmWin(height: number): void {
  if (!pmWin || pmWin.isDestroyed() || !pmAnchor || !win) return
  const cb = win.getContentBounds()
  pmWin.setBounds({
    x: Math.max(cb.x + 4, Math.round(cb.x + pmAnchor.x - PM_PAD)),
    y: Math.round(cb.y + pmAnchor.y + pmAnchor.height - 4),
    width: PM_W, height: Math.max(1, Math.round(height))
  })
}
ipcMain.on('profilemenu:open', (_e, anchor: MenuAnchor) => {
  pmAnchor = anchor
  const w = ensurePmWin()
  w.webContents.send('profilemenu:profile', getProfile())
  placePmWin(lastPmHeight) // posiciona en el anchor antes de mostrar
  w.show(); w.focus()
})
ipcMain.on('profilemenu:height', (_e, h: number) => { lastPmHeight = h + PM_PAD * 2; placePmWin(lastPmHeight) })
ipcMain.on('profilemenu:close', () => { if (pmWin && !pmWin.isDestroyed()) pmWin.hide() })
ipcMain.on('profilemenu:action', (_e, name: string) => {
  if (pmWin && !pmWin.isDestroyed()) pmWin.hide()
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
  try { addProvider(input, apiKey) } catch (err) { console.error('[providers:add] falló:', err) }
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
      send('chat:error', err instanceof Error ? err.message : String(err))
    }
  } finally {
    setAgentRunning(false)
  }
})

// DEV: cicla materiales de vibrancy en vivo (⌘⌥V) para calibrar en tu macOS.
const VIBRANCY_MATERIALS = ['under-window', 'sidebar', 'hud', 'fullscreen-ui', 'menu', 'popover', 'content', 'header', 'window', 'selection'] as const
let vibrancyIdx = 0
ipcMain.on('ui:cycleVibrancy', () => {
  if (!win || !isMac) return
  vibrancyIdx = (vibrancyIdx + 1) % VIBRANCY_MATERIALS.length
  const mat = VIBRANCY_MATERIALS[vibrancyIdx]
  win.setVibrancy(mat)
  console.log('[vibrancy]', mat)
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
  ses.on('will-download', (_e, item) => {
    pushAgentEvent(`Descarga iniciada: ${item.getFilename()} (${item.getURL()})`)
  })
  initBookmarks()
  initHistory()
  initSkills()
  initQuickActions()
  initProfile()
  initWindowState()
  vault.initVault()
  initAI()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('before-quit', () => saveSessionNow())
app.on('window-all-closed', () => { if (!isMac) app.quit() })
