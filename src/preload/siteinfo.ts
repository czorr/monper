import { contextBridge, ipcRenderer } from 'electron'
import type { SiteInfoData, SiteInfoWinApi, PermKey, PermState } from '../shared/types'

const api: SiteInfoWinApi = {
  onData: (cb: (data: SiteInfoData) => void) => {
    ipcRenderer.on('siteinfo:data', (_e, d: SiteInfoData) => cb(d))
    ipcRenderer.send('siteinfo:ready') // ya hay quien escuche: mándame los datos
  },
  reportHeight: (h: number) => ipcRenderer.send('siteinfo:height', h),
  toggle: (key: PermKey, state: PermState) => ipcRenderer.send('siteinfo:toggle', key, state),
  clearData: () => ipcRenderer.send('siteinfo:clear'),
  close: () => ipcRenderer.send('siteinfo:close')
}

contextBridge.exposeInMainWorld('siteinfo', api)
