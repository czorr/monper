import { contextBridge, ipcRenderer } from 'electron'
import type { Bookmark, MonperTabApi } from '../shared/types'

const api: MonperTabApi = {
  navigate: (url) => ipcRenderer.send('tab:navigate', url),
  getBookmarks: () => ipcRenderer.invoke('bookmarks:list'),
  addBookmark: (b) => ipcRenderer.send('bookmarks:add', b),
  removeBookmark: (id) => ipcRenderer.send('bookmarks:remove', id),
  onBookmarks: (cb: (bookmarks: Bookmark[]) => void) => {
    const handler = (_e: unknown, list: Bookmark[]) => cb(list)
    ipcRenderer.on('bookmarks:changed', handler)
    return () => { ipcRenderer.removeListener('bookmarks:changed', handler) }
  }
}

contextBridge.exposeInMainWorld('monperTab', api)
