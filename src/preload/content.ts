import { contextBridge, ipcRenderer } from 'electron'
import type { Bookmark, DownloadEntry, TitanioTabApi, Suggestion } from '../shared/types'
import { setupSelectionUI } from './selectionUI'
import { setupPasswordCapture } from './passwordCapture'
import { setupTopColor } from './topColor'
import { setupStoreInstall } from './storeInstall'
import { setupChromeIdentity } from './chromeIdentity'
import { setupPipSource } from './pipSource'

const api: TitanioTabApi = {
  navigate: (url) => ipcRenderer.send('tab:navigate', url),
  listDownloads: () => ipcRenderer.invoke('downloads:list'),
  onDownloads: (cb: (list: DownloadEntry[]) => void) => {
    const handler = (_e: unknown, list: DownloadEntry[]) => cb(list)
    ipcRenderer.on('downloads:changed', handler)
    return () => { ipcRenderer.removeListener('downloads:changed', handler) }
  },
  cancelDownload: (id) => ipcRenderer.send('downloads:cancel', id),
  openDownload: (id) => ipcRenderer.send('downloads:open', id),
  showDownload: (id) => ipcRenderer.send('downloads:show', id),
  clearDownloads: () => ipcRenderer.send('downloads:clear'),
  getBookmarks: () => ipcRenderer.invoke('bookmarks:list'),
  addBookmark: (b) => ipcRenderer.send('bookmarks:add', b),
  removeBookmark: (id) => ipcRenderer.send('bookmarks:remove', id),
  onBookmarks: (cb: (bookmarks: Bookmark[]) => void) => {
    const handler = (_e: unknown, list: Bookmark[]) => cb(list)
    ipcRenderer.on('bookmarks:changed', handler)
    return () => { ipcRenderer.removeListener('bookmarks:changed', handler) }
  },
  clearBrowsingData: () => ipcRenderer.invoke('ui:clearData'),
  listProviders: () => ipcRenderer.invoke('providers:list'),
  addProvider: (input, apiKey) => ipcRenderer.invoke('providers:add', input, apiKey),
  removeProvider: (id) => ipcRenderer.invoke('providers:remove', id),
  setActiveProvider: (id) => ipcRenderer.invoke('providers:setActive', id),
  refreshModels: () => ipcRenderer.invoke('providers:models'),
  vaultList: () => ipcRenderer.invoke('vault:list'),
  vaultAdd: (type, label, data, secret) => ipcRenderer.invoke('vault:add', type, label, data, secret),
  vaultRemove: (id) => ipcRenderer.invoke('vault:remove', id),
  vaultUpdate: (id, patch) => ipcRenderer.invoke('vault:update', id, patch),
  vaultAvailable: () => ipcRenderer.invoke('vault:available'),
  vaultCopy: (id) => ipcRenderer.invoke('vault:copy', id),
  vaultReveal: (id) => ipcRenderer.invoke('vault:reveal', id),
  vaultFavicons: () => ipcRenderer.invoke('vault:favicons'),
  chatsSearch: (q, incluirArchivadas) => ipcRenderer.invoke('chats:search', q, incluirArchivadas),
  chatsArchive: (id, archived) => ipcRenderer.invoke('chats:archive', id, archived),
  chatsRename: (id, title) => ipcRenderer.invoke('chats:rename', id, title),
  chatsDelete: (id) => ipcRenderer.invoke('chats:delete', id),
  chatsResume: (id) => ipcRenderer.send('chats:resumeInPanel', id),
  usageSummary: (dias) => ipcRenderer.invoke('usage:summary', dias),
  usageClear: () => ipcRenderer.invoke('usage:clear'),
  usageLimit: (valor) => ipcRenderer.invoke('usage:limit', valor),
  onUsageChanged: (cb) => {
    const h = (_e: unknown, r: unknown): void => cb(r as never)
    ipcRenderer.on('usage:changed', h)
    return () => { ipcRenderer.removeListener('usage:changed', h) }
  },
  onVaultChanged: (cb) => {
    const h = (_e: unknown, list: unknown): void => cb(list as never)
    ipcRenderer.on('vault:changed', h)
    return () => { ipcRenderer.removeListener('vault:changed', h) }
  },
  suggest: (query) => ipcRenderer.invoke('omni:suggest', query) as Promise<Suggestion[]>,
  openSettings: () => ipcRenderer.send('ui:settings'),
  openChat: () => ipcRenderer.send('ui:openChat'),
  skillsList: (resolve) => ipcRenderer.invoke('skills:list', resolve),
  skillsGet: (id) => ipcRenderer.invoke('skills:get', id),
  skillsToggle: (id, enabled) => ipcRenderer.invoke('skills:toggle', id, enabled),
  openSkillsFolder: () => ipcRenderer.send('skills:openFolder'),
  getProfile: () => ipcRenderer.invoke('profile:get'),
  setProfile: (name) => ipcRenderer.invoke('profile:set', name),
  setAvatar: (dataUrl) => ipcRenderer.invoke('profile:setAvatar', dataUrl),
  getAppearance: () => ipcRenderer.invoke('ui:appearance'),
  setTint: (color) => ipcRenderer.invoke('ui:setTint', color),
  onAppearance: (cb) => {
    const handler = (_e: unknown, data: import('../shared/types').AppearanceData): void => cb(data)
    ipcRenderer.on('ui:appearanceChanged', handler)
    return () => { ipcRenderer.removeListener('ui:appearanceChanged', handler) }
  },
  updateBookmark: (id, cambios) => ipcRenderer.invoke('bookmarks:update', id, cambios),
  newBookmarkFolder: (title) => ipcRenderer.invoke('bookmarks:newFolder', title),
  moveBookmark: (id, parentId) => ipcRenderer.send('bookmarks:move', id, parentId),
  browseHistory: (query, offset, limit) => ipcRenderer.invoke('history:browse', query, offset, limit),
  memoryList: () => ipcRenderer.invoke('memory:list'),
  memoryRead: (path) => ipcRenderer.invoke('memory:read', path),
  memoryWrite: (path, contenido) => ipcRenderer.invoke('memory:write', path, contenido),
  memoryDelete: (path) => ipcRenderer.invoke('memory:delete', path),
  memoryEnabled: (on) => ipcRenderer.invoke('memory:enabled', on),
  memoryOpenFolder: () => ipcRenderer.send('memory:openFolder'),
  removeHistoryEntry: (url) => ipcRenderer.invoke('history:remove', url),
  clearHistory: (desde) => ipcRenderer.invoke('history:clear', desde),
  listImportBrowsers: () => ipcRenderer.invoke('import:browsers'),
  runImport: (id, que) => ipcRenderer.invoke('import:run', id, que),
  getDefaultBrowser: () => ipcRenderer.invoke('browser:default'),
  makeDefaultBrowser: () => ipcRenderer.invoke('browser:makeDefault'),
  dismissDefaultBrowser: () => ipcRenderer.send('browser:dismissDefault'),
  getMcpState: () => ipcRenderer.invoke('mcp:state'),
  listMcpServers: () => ipcRenderer.invoke('mcp:servers'),
  reloadMcpServers: () => ipcRenderer.invoke('mcp:reload'),
  probeMcpServers: () => ipcRenderer.invoke('mcp:probe'),
  openMcpConfig: () => ipcRenderer.send('mcp:openConfig'),
  setMcpEnabled: (on) => ipcRenderer.invoke('mcp:enable', on),
  getAdblockState: () => ipcRenderer.invoke('adblock:state'),
  setAdblockEnabled: (on) => ipcRenderer.invoke('adblock:enable', on),
  setAdblockAllowed: (hostname, permitir) => ipcRenderer.invoke('adblock:allow', hostname, permitir),
  getPipState: () => ipcRenderer.invoke('pip:state'),
  setPipEnabled: (on) => ipcRenderer.invoke('pip:enable', on),
  listSitePermissions: (resolve) => ipcRenderer.invoke('perms:list', resolve),
  setSitePermission: (origin, key, state) => ipcRenderer.invoke('perms:set', origin, key, state),
  clearSitePermissions: (origin) => ipcRenderer.invoke('perms:clear', origin),
  setVibrancy: (id) => ipcRenderer.send('ui:setVibrancy', id),
  getUpdateState: () => ipcRenderer.invoke('update:state'),
  onUpdateState: (cb) => {
    const h = (_e: unknown, s: unknown): void => cb(s as never)
    ipcRenderer.on('update:state', h)
    return () => { ipcRenderer.removeListener('update:state', h) }
  },
  checkUpdates: () => ipcRenderer.send('update:check'),
  downloadUpdate: () => ipcRenderer.send('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  listRoutines: () => ipcRenderer.invoke('routines:list'),
  onRoutines: (cb) => {
    const h = (_e: unknown, list: unknown): void => cb(list as never)
    ipcRenderer.on('routines:changed', h)
    return () => { ipcRenderer.removeListener('routines:changed', h) }
  },
  createRoutine: (input) => ipcRenderer.invoke('routines:create', input),
  toggleRoutine: (id, enabled) => ipcRenderer.send('routines:toggle', id, enabled),
  removeRoutine: (id) => ipcRenderer.send('routines:remove', id),
  runRoutine: (id) => ipcRenderer.send('routines:run', id),
  listQuickActions: () => ipcRenderer.invoke('quickactions:list'),
  saveQuickAction: (a) => ipcRenderer.invoke('quickactions:save', a),
  removeQuickAction: (id) => ipcRenderer.invoke('quickactions:remove', id)
}

contextBridge.exposeInMainWorld('titanioTab', api)

// Avisa al chrome cuando se interactúa con la página, para cerrar overlays (menú de perfil).
window.addEventListener('pointerdown', () => ipcRenderer.send('tab:pointerdown'), true)

// Cada módulo se aísla: si uno falla en algún sitio raro, los demás siguen vivos.
// (Antes, un throw en el primero dejaba sin ejecutar todos los siguientes.)
function safeSetup(name: string, fn: () => void): void {
  try { fn() } catch (e) { console.warn(`[titanio] fallo al iniciar ${name}:`, e) }
}

// El primero: si la página lee la identidad antes de que la alineemos, ya la vio mal.
safeSetup('chromeIdentity', setupChromeIdentity) // Sec-CH-UA coherente en JS (ver shared/chrome.ts)
safeSetup('pip', setupPipSource)                // picture-in-picture propio (ver main/pip.ts)
safeSetup('selection', setupSelectionUI)      // acciones rápidas sobre texto seleccionado
safeSetup('passwordCapture', setupPasswordCapture) // ofrecer guardar credenciales
safeSetup('topColor', setupTopColor)          // color bajo el topbar al hacer scroll
safeSetup('storeInstall', setupStoreInstall)  // botón "Install to Titanio" en la Store
