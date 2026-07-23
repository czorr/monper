import { contextBridge, ipcRenderer } from 'electron'
import type { BrowserState, MenuAnchor, MenuActionName, MonperApi } from '../shared/types'

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
  openMenu: (anchor: MenuAnchor) => ipcRenderer.invoke('menu:open', anchor),
  menuAction: (action: MenuActionName) => ipcRenderer.send('menu:action', action),
  closeMenu: () => ipcRenderer.send('menu:close'),
  resizeMenu: (height) => ipcRenderer.send('menu:resize', height),
  toggleBookmark: () => ipcRenderer.send('bookmarks:toggle')
}

contextBridge.exposeInMainWorld('monper', api)
