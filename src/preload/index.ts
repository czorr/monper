import { contextBridge, ipcRenderer } from 'electron'
import type { BrowserState, MonperApi } from '../shared/types'

const api: MonperApi = {
  platform: process.platform,
  newTab: () => ipcRenderer.invoke('tabs:new'),
  closeTab: (id) => ipcRenderer.invoke('tabs:close', id),
  selectTab: (id) => ipcRenderer.invoke('tabs:select', id),
  go: (url) => ipcRenderer.invoke('nav:go', url),
  back: () => ipcRenderer.invoke('nav:back'),
  forward: () => ipcRenderer.invoke('nav:forward'),
  reload: () => ipcRenderer.invoke('nav:reload'),
  setCollapsed: (v) => ipcRenderer.invoke('ui:collapse', v),
  onState: (cb: (state: BrowserState) => void) => {
    const handler = (_e: unknown, state: BrowserState) => cb(state)
    ipcRenderer.on('state:update', handler)
    return () => { ipcRenderer.removeListener('state:update', handler) }
  },
  toggleBookmark: () => ipcRenderer.send('bookmarks:toggle'),
  onPagePointerDown: (cb: () => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('page:pointerdown', handler)
    return () => { ipcRenderer.removeListener('page:pointerdown', handler) }
  }
}

contextBridge.exposeInMainWorld('monper', api)
