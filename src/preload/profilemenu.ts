import { contextBridge, ipcRenderer } from 'electron'
import type { ProfileMenuWinApi } from '../shared/types'

const api: ProfileMenuWinApi = {
  reportHeight: (h: number) => ipcRenderer.send('profilemenu:height', h),
  action: (name: string) => ipcRenderer.send('profilemenu:action', name),
  close: () => ipcRenderer.send('profilemenu:close')
}

contextBridge.exposeInMainWorld('profilemenu', api)
