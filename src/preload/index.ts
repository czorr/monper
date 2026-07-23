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
  setChat: (open) => ipcRenderer.invoke('ui:chat', open),
  onState: (cb: (state: BrowserState) => void) => {
    const handler = (_e: unknown, state: BrowserState) => cb(state)
    ipcRenderer.on('state:update', handler)
    return () => { ipcRenderer.removeListener('state:update', handler) }
  },
  toggleBookmark: () => ipcRenderer.send('bookmarks:toggle'),
  openDevtools: () => ipcRenderer.send('ui:devtools'),
  openDownloads: () => ipcRenderer.send('ui:downloads'),
  openSettings: () => ipcRenderer.send('ui:settings'),
  cycleVibrancy: () => ipcRenderer.send('ui:cycleVibrancy'),
  onPagePointerDown: (cb: () => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('page:pointerdown', handler)
    return () => { ipcRenderer.removeListener('page:pointerdown', handler) }
  }
}

contextBridge.exposeInMainWorld('monper', api)
