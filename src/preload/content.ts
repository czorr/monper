import { contextBridge, ipcRenderer } from 'electron'
import type { Bookmark, DownloadEntry, MonperTabApi, Suggestion } from '../shared/types'
import { setupSelectionUI } from './selectionUI'
import { setupPasswordCapture } from './passwordCapture'
import { setupTopColor } from './topColor'
import { setupStoreInstall } from './storeInstall'

const api: MonperTabApi = {
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
  vaultList: () => ipcRenderer.invoke('vault:list'),
  vaultAdd: (type, label, data, secret) => ipcRenderer.invoke('vault:add', type, label, data, secret),
  vaultRemove: (id) => ipcRenderer.invoke('vault:remove', id),
  suggest: (query) => ipcRenderer.invoke('omni:suggest', query) as Promise<Suggestion[]>,
  openSettings: () => ipcRenderer.send('ui:settings'),
  openChat: () => ipcRenderer.send('ui:openChat'),
  skillsList: () => ipcRenderer.invoke('skills:list'),
  skillsGet: (id) => ipcRenderer.invoke('skills:get', id),
  skillsToggle: (id, enabled) => ipcRenderer.invoke('skills:toggle', id, enabled),
  openSkillsFolder: () => ipcRenderer.send('skills:openFolder'),
  getProfile: () => ipcRenderer.invoke('profile:get'),
  setProfile: (name) => ipcRenderer.invoke('profile:set', name),
  setAvatar: (dataUrl) => ipcRenderer.invoke('profile:setAvatar', dataUrl),
  getAppearance: () => ipcRenderer.invoke('ui:appearance'),
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

contextBridge.exposeInMainWorld('monperTab', api)

// Avisa al chrome cuando se interactúa con la página, para cerrar overlays (menú de perfil).
window.addEventListener('pointerdown', () => ipcRenderer.send('tab:pointerdown'), true)

// Cada módulo se aísla: si uno falla en algún sitio raro, los demás siguen vivos.
// (Antes, un throw en el primero dejaba sin ejecutar todos los siguientes.)
function safeSetup(name: string, fn: () => void): void {
  try { fn() } catch (e) { console.warn(`[monper] fallo al iniciar ${name}:`, e) }
}

safeSetup('selection', setupSelectionUI)      // acciones rápidas sobre texto seleccionado
safeSetup('passwordCapture', setupPasswordCapture) // ofrecer guardar credenciales
safeSetup('topColor', setupTopColor)          // color bajo el topbar al hacer scroll
safeSetup('storeInstall', setupStoreInstall)  // botón "Install to Monper" en la Store
