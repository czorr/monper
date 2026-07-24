import { contextBridge, ipcRenderer } from 'electron'
import type { ProfileMenuWinApi, Profile } from '../shared/types'

const api: ProfileMenuWinApi = {
  onProfile: (cb: (p: Profile) => void) => { ipcRenderer.on('profilemenu:profile', (_e, p: Profile) => cb(p)) },
  reportHeight: (h: number) => ipcRenderer.send('profilemenu:height', h),
  action: (name: string) => ipcRenderer.send('profilemenu:action', name),
  close: () => ipcRenderer.send('profilemenu:close')
}

contextBridge.exposeInMainWorld('profilemenu', api)
