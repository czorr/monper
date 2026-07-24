import { join } from 'path'
import { app, BrowserWindow, Menu, WebContentsView, ipcMain, session, shell } from 'electron'
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
const INTERNAL_PAGES = ['newtab', 'settings'] as const
function internalUrl(page: (typeof INTERNAL_PAGES)[number]): string {
  return RENDERER_URL_EARLY
    ? `${RENDERER_URL_EARLY}/${page}.html`
    : `file://${join(__dirname, `../renderer/${page}.html`)}`
}
function newtabUrl(): string {
  return internalUrl('newtab')
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
}

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
  return { x: left, y: TOPBAR_HEIGHT, width: Math.max(0, w - left - right), height: Math.max(0, h - TOPBAR_HEIGHT) }
}

function applyRadius(t: Tab) {
  if (typeof t.view.setBorderRadius === 'function') {
    // Redondea cuando la página está "flotando" (hay sidebar izq y/o panel de chat der).
    const rounded = !sidebarCollapsed || chatOpen
    t.view.setBorderRadius(rounded ? CONTENT_RADIUS : 0)
  }
}

// Reposiciona la vista activa instantáneamente (resize, cambio de pestaña).
function layoutActive() {
  const t = activeId != null ? tabs.get(activeId) : null
  if (!t) return
  t.view.setBounds(contentBounds())
  applyRadius(t)
}

// Anima los bounds de la vista nativa en sync con la transición CSS del content
// (mismo duration/easing) para que topbar y página deslicen como una sola.
const COLLAPSE_MS = 180
let collapseAnim: NodeJS.Timeout | null = null
function animateLayout() {
  const t = activeId != null ? tabs.get(activeId) : null
  if (!t) return
  applyRadius(t)
  const start = t.view.getBounds()
  const target = contentBounds()
  const t0 = Date.now()
  if (collapseAnim) clearInterval(collapseAnim)
  collapseAnim = setInterval(() => {
    const p = Math.min(1, (Date.now() - t0) / COLLAPSE_MS)
    const e = 1 - Math.pow(1 - p, 3) // easeOutCubic (matchea el cubic-bezier del CSS)
    t.view.setBounds({
      x: Math.round(start.x + (target.x - start.x) * e),
      y: target.y,
      width: Math.round(start.width + (target.width - start.width) * e),
      height: target.height
    })
    if (p >= 1 && collapseAnim) { clearInterval(collapseAnim); collapseAnim = null }
  }, 1000 / 60)
}

function pushState() {
  if (!win || win.isDestroyed()) return
  const t = activeId != null ? tabs.get(activeId) : null
  const displayUrl = (u: string) => (isInternal(u) ? '' : u)
  const state: BrowserState = {
    activeId,
    tabs: [...tabs.entries()].map(([id, tb]) => ({
      id, url: displayUrl(tb.url), title: tb.title || 'Nueva pestaña', favicon: tb.favicon, loading: tb.loading, recording: tb.recording
    })),
    active: t
      ? {
          url: displayUrl(t.url), title: t.title, canBack: t.canBack, canForward: t.canForward,
          loading: t.loading, pageColor: t.pageBg || t.themeColor, bookmarked: isBookmarked(t.url)
        }
      : null
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
  })()`, true).then((c: string) => { t.pageBg = c; pushState() }).catch(() => {})
}

function createTab(url = newtabUrl(), activate = true): number {
  const id = nextId++
  const view = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, '../preload/content.js')
    }
  })
  const t: Tab = { view, url, title: '', favicon: null, loading: false, canBack: false, canForward: false, themeColor: null, pageBg: null, recording: false }
  tabs.set(id, t)
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
  wc.on('did-navigate', (_e, u) => { t.url = u; t.recording = false; recordVisit(u, t.title, t.favicon); refresh() }) // sólo main-frame
  wc.on('did-navigate-in-page', (_e, u, isMainFrame) => { if (isMainFrame) { t.url = u; refresh() } })
  wc.on('page-title-updated', (_e, title) => { t.title = title; updateMeta(t.url, title); pushState() })
  wc.on('page-favicon-updated', (_e, icons) => { t.favicon = icons?.[0] || null; updateMeta(t.url, undefined, t.favicon); pushState() })
  wc.on('did-change-theme-color', (_e, color) => { t.themeColor = color; pushState() })
  wc.setWindowOpenHandler((details) => {
    const feats = details.features || ''
    // Popups reales (OAuth, pagos…): window.open con dimensiones o disposition new-window
    // → abrir una ventana de verdad (mantiene window.opener/postMessage/window.close).
    const isPopup = details.disposition === 'new-window' || details.disposition === 'other' || /\b(width|height|popup)\b/i.test(feats)
    if (isPopup) {
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
    createTab(details.url)
    return { action: 'deny' }
  })

  wc.loadURL(url)
  if (activate) setActive(id)
  else pushState()
  return id
}

function setActive(id: number) {
  if (!tabs.has(id)) return
  activeId = id
  for (const [tid, t] of tabs) t.view.setVisible(tid === id)
  layoutActive()
  pushState()
}

function closeTab(id: number) {
  const t = tabs.get(id)
  if (!t) return
  win!.contentView.removeChildView(t.view)
  t.view.webContents.close()
  tabs.delete(id)
  if (activeId === id) {
    const remaining = [...tabs.keys()]
    if (remaining.length) setActive(remaining[remaining.length - 1])
    else createTab()
  } else {
    pushState()
  }
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
      { role: 'selectAll', label: 'Seleccionar todo' }
    ]
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: 'Ver',
    submenu: [
      { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => activeWc()?.reload() },
      { label: 'Atrás', accelerator: 'CmdOrCtrl+[', click: () => { const wc = activeWc(); if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack() } },
      { label: 'Adelante', accelerator: 'CmdOrCtrl+]', click: () => { const wc = activeWc(); if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward() } },
      { type: 'separator' },
      { label: 'Mostrar/ocultar sidebar', accelerator: 'CmdOrCtrl+S', click: () => menuAction('toggle-sidebar') },
      { label: 'Ask Monper', accelerator: 'CmdOrCtrl+J', click: () => menuAction('toggle-chat') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Pantalla completa' },
      { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }
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
  win.webContents.on('did-finish-load', () => {
    if (tabs.size === 0) createTab(); else pushState()
    // Pre-carga las ventanas nativas de popups (site-info, menú de perfil) para que
    // abran instantáneo — crearlas en el primer click era lento (2-3 clicks).
    ensureSiteWin(); ensurePmWin()
  })
}

// ---- IPC ----
ipcMain.handle('tabs:new', () => createTab())
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
ipcMain.on('bookmarks:toggle', () => {
  const t = activeId != null ? tabs.get(activeId) : null
  if (!t || isNewtab(t.url)) return
  toggleBookmark(t.url, t.title || t.url, t.favicon)
  broadcastBookmarks()
})

// Reenvía la interacción con la página al chrome, para cerrar el menú de perfil.
ipcMain.on('tab:pointerdown', () => { if (win && !win.isDestroyed()) win.webContents.send('page:pointerdown') })

// Acciones del menú de perfil
ipcMain.on('ui:devtools', () => {
  const t = activeId != null ? tabs.get(activeId) : null
  const wc = t?.view.webContents
  if (wc) wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools({ mode: 'detach' })
})
ipcMain.on('ui:downloads', () => { shell.openPath(app.getPath('downloads')) })
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
    case 'downloads': shell.openPath(app.getPath('downloads')); break
    case 'developers': {
      const wc = activeId != null ? tabs.get(activeId)?.view.webContents : undefined
      if (wc) wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools({ mode: 'detach' })
      break
    }
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
ipcMain.on('chat:cancel', () => { chatAbort?.abort() })
ipcMain.handle('chat:send', async (_e, messages: ChatMessage[]) => {
  const active = getActiveProvider()
  if (!active) { win?.webContents.send('chat:error', 'No hay proveedor de IA conectado. Conéctalo en Settings.'); return }
  chatAbort?.abort()
  chatAbort = new AbortController()
  const send = (ch: string, payload?: unknown): void => { win?.webContents.send(ch, payload) }
  try {
    // Agente Mastra con herramientas: opera la pestaña activa + gestión de pestañas (anthropic y openai).
    await runMastra({
      provider: active.provider, key: active.key, model: active.model,
      messages, signal: chatAbort.signal, skills: enabledSkills(),
      control: {
        getWc: () => (activeId != null ? tabs.get(activeId)?.view.webContents : undefined),
        listTabs: () => [...tabs.entries()].map(([id, t]) => ({ id, title: t.title, url: t.url, active: id === activeId })),
        openTab: (url) => createTab(url, true),
        switchTab: (id) => { if (!tabs.has(id)) return false; setActive(id); return true },
        closeTab: (id) => { if (!tabs.has(id)) return false; closeTab(id); return true }
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
  attachPermissionHandlers(ses, (wc, active) => {
    for (const tb of tabs.values()) {
      if (tb.view.webContents === wc) { tb.recording = active; pushState(); break }
    }
  })
  initBookmarks()
  initHistory()
  initSkills()
  initProfile()
  initWindowState()
  vault.initVault()
  initAI()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (!isMac) app.quit() })
