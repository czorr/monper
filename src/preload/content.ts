import { contextBridge, ipcRenderer } from 'electron'
import type { Bookmark, DownloadEntry, MonperTabApi, Suggestion } from '../shared/types'
import { setupSelectionUI } from './selectionUI'
import { setupPasswordCapture } from './passwordCapture'

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
  listQuickActions: () => ipcRenderer.invoke('quickactions:list'),
  saveQuickAction: (a) => ipcRenderer.invoke('quickactions:save', a),
  removeQuickAction: (id) => ipcRenderer.invoke('quickactions:remove', id)
}

contextBridge.exposeInMainWorld('monperTab', api)

// Avisa al chrome cuando se interactúa con la página, para cerrar overlays (menú de perfil).
window.addEventListener('pointerdown', () => ipcRenderer.send('tab:pointerdown'), true)

// Icono/menú flotante de acciones rápidas al seleccionar texto.
setupSelectionUI()
// Ofrecer guardar credenciales al enviar un login.
setupPasswordCapture()
