import { join } from 'path'
import { app, BrowserWindow, WebContentsView, ipcMain, session } from 'electron'
import type { IpcMainEvent } from 'electron'
import type { BrowserState, MenuAnchor, Bookmark } from '../shared/types'
import { initBookmarks, listBookmarks, isBookmarked, addBookmark, removeBookmark, toggleBookmark } from './bookmarks'

const SIDEBAR_WIDTH = 240
const TOPBAR_HEIGHT = 52
const CONTENT_RADIUS = 11 // debe coincidir con #content.expanded en styles.css
const PARTITION = 'persist:monper'
const isMac = process.platform === 'darwin'

// La new-tab page es una página interna servida por nuestro propio renderer.
const RENDERER_URL_EARLY = process.env['ELECTRON_RENDERER_URL']
function newtabUrl(): string {
  return RENDERER_URL_EARLY ? `${RENDERER_URL_EARLY}/newtab.html` : `file://${join(__dirname, '../renderer/newtab.html')}`
}
function isNewtab(url: string): boolean {
  return url.includes('/newtab.html')
}
/** Sólo las páginas internas pueden leer/escribir bookmarks vía IPC */
function isInternalSender(url: string | undefined): boolean {
  return !!url && isNewtab(url)
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
}

let win: BrowserWindow | null = null
const tabs = new Map<number, Tab>()
let activeId: number | null = null
let nextId = 1
let sidebarCollapsed = false

// Rutas de los renderers (dev usa el server de Vite, prod los archivos build)
const RENDERER_URL = process.env['ELECTRON_RENDERER_URL']
function loadRenderer(target: BrowserWindow, page: 'index' | 'menu') {
  if (RENDERER_URL) target.loadURL(`${RENDERER_URL}/${page}.html`)
  else target.loadFile(join(__dirname, `../renderer/${page}.html`))
}

function contentBounds() {
  const [w, h] = win!.getContentSize()
  const left = sidebarCollapsed ? 0 : SIDEBAR_WIDTH
  return { x: left, y: TOPBAR_HEIGHT, width: Math.max(0, w - left), height: Math.max(0, h - TOPBAR_HEIGHT) }
}

function layoutActive() {
  const t = activeId != null ? tabs.get(activeId) : null
  if (!t) return
  t.view.setBounds(contentBounds())
  // Redondea las esquinas de la página nativa cuando el sidebar está expandido.
  if (typeof t.view.setBorderRadius === 'function') {
    t.view.setBorderRadius(sidebarCollapsed ? 0 : CONTENT_RADIUS)
  }
}

function pushState() {
  if (!win || win.isDestroyed()) return
  const t = activeId != null ? tabs.get(activeId) : null
  const displayUrl = (u: string) => (isNewtab(u) ? '' : u)
  const state: BrowserState = {
    activeId,
    tabs: [...tabs.entries()].map(([id, tb]) => ({
      id, url: displayUrl(tb.url), title: tb.title || 'Nueva pestaña', favicon: tb.favicon, loading: tb.loading
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
    // color del elemento en el borde superior-centro, subiendo hasta un fondo opaco
    let el = document.elementFromPoint(Math.floor(innerWidth / 2), 3);
    while (el) { const c = bgOf(el); if (c) return c; el = el.parentElement; }
    return bgOf(document.body) || bgOf(document.documentElement) || '#ffffff';
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
  const t: Tab = { view, url, title: '', favicon: null, loading: false, canBack: false, canForward: false, themeColor: null, pageBg: null }
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
  wc.on('did-navigate', (_e, u) => { t.url = u; refresh() }) // sólo main-frame
  wc.on('did-navigate-in-page', (_e, u, isMainFrame) => { if (isMainFrame) { t.url = u; refresh() } })
  wc.on('page-title-updated', (_e, title) => { t.title = title; pushState() })
  wc.on('page-favicon-updated', (_e, icons) => { t.favicon = icons?.[0] || null; pushState() })
  wc.on('did-change-theme-color', (_e, color) => { t.themeColor = color; pushState() })
  wc.setWindowOpenHandler(({ url: u }) => { createTab(u); return { action: 'deny' } })

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

function createWindow() {
  win = new BrowserWindow({
    width: 1440 + SIDEBAR_WIDTH,
    height: 900 + TOPBAR_HEIGHT,
    // En mac NO ponemos fondo transparente: rompe el render del semáforo nativo.
    // La vibrancy se ve igual porque el HTML del sidebar es transparente.
    ...(isMac
      ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const }
      : { backgroundColor: '#111114' }),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 15, y: 17 } : undefined,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: false }
  })

  if (isMac) {
    win.once('ready-to-show', () => win!.setVibrancy('sidebar'))
  }

  loadRenderer(win, 'index')
  win.on('resize', layoutActive)
  win.webContents.on('did-finish-load', () => { if (tabs.size === 0) createTab(); else pushState() })
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
ipcMain.handle('ui:collapse', (_e, collapsed: boolean) => { sidebarCollapsed = !!collapsed; layoutActive() })

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

// ---- Menú de perfil (ventana hija con vibrancy nativa) ----
let menuWin: BrowserWindow | null = null
const MENU_W = 300
function openProfileMenu(anchor: MenuAnchor) {
  if (menuWin && !menuWin.isDestroyed()) { menuWin.close(); return }
  const cb = win!.getContentBounds()
  const x = Math.round(cb.x + (anchor?.x ?? 8))
  const y = Math.round(cb.y + (anchor?.y ?? 40) + (anchor?.height ?? 24) + 6)
  menuWin = new BrowserWindow({
    parent: win!, x, y, width: MENU_W, height: 420,
    frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, hasShadow: true, roundedCorners: true, show: false,
    backgroundColor: '#00000000',
    ...(isMac ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const } : {}),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: false }
  })
  loadRenderer(menuWin, 'menu')
  menuWin.once('ready-to-show', () => { menuWin!.show(); if (isMac) menuWin!.setVibrancy('sidebar') })
  menuWin.on('blur', () => { if (menuWin && !menuWin.isDestroyed()) menuWin.close() })
  menuWin.on('closed', () => { menuWin = null })
}
ipcMain.handle('menu:open', (_e, anchor: MenuAnchor) => openProfileMenu(anchor))
ipcMain.on('menu:close', () => { if (menuWin && !menuWin.isDestroyed()) menuWin.close() })
ipcMain.on('menu:resize', (_e, height: number) => {
  if (menuWin && !menuWin.isDestroyed()) menuWin.setContentSize(MENU_W, Math.max(80, Math.round(height)))
})
ipcMain.on('menu:action', (_e, action: string) => {
  if (menuWin && !menuWin.isDestroyed()) menuWin.close()
  if (action === 'new-tab' || action === 'bookmarks') createTab()
})

app.whenReady().then(() => {
  session.fromPartition(PARTITION)
  initBookmarks()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (!isMac) app.quit() })
