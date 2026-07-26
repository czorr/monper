import { contextBridge, ipcRenderer } from 'electron'
import type { ExtensionsWinApi, ExtensionsData } from '../shared/types'

const api: ExtensionsWinApi = {
  onData: (cb) => {
    const h = (_e: unknown, d: ExtensionsData): void => cb(d)
    ipcRenderer.on('extensions:data', h)
    ipcRenderer.send('extensions:ready') // ya hay quien escuche: mándame los datos
    return () => { ipcRenderer.removeListener('extensions:data', h) }
  },
  reportHeight: (h: number) => ipcRenderer.send('extensions:height', h),
  toggle: (path: string, enabled: boolean) => ipcRenderer.send('extensions:toggle', path, enabled),
  remove: (path: string) => ipcRenderer.send('extensions:remove', path),
  browseStore: () => ipcRenderer.send('extensions:browseStore'),
  installFromStore: () => ipcRenderer.send('extensions:installFromStore'),
  installFromFolder: () => ipcRenderer.send('extensions:installFromFolder'),
  openPopup: (path: string) => ipcRenderer.send('extensions:openPopup', path),
  menu: (path: string) => ipcRenderer.send('extensions:menu', path),
  close: () => ipcRenderer.send('extensions:close')
}

contextBridge.exposeInMainWorld('extensionswin', api)
