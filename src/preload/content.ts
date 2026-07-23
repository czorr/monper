import { contextBridge, ipcRenderer } from 'electron'
import type { Bookmark, MonperTabApi, Suggestion } from '../shared/types'

const api: MonperTabApi = {
  navigate: (url) => ipcRenderer.send('tab:navigate', url),
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
  suggest: (query) => ipcRenderer.invoke('omni:suggest', query) as Promise<Suggestion[]>
}

contextBridge.exposeInMainWorld('monperTab', api)

// Avisa al chrome cuando se interactúa con la página, para cerrar overlays (menú de perfil).
window.addEventListener('pointerdown', () => ipcRenderer.send('tab:pointerdown'), true)
