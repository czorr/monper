import './language'
import { contextBridge, ipcRenderer } from 'electron'
import type { SubmenuWinApi, SubmenuData } from '../shared/types'

const api: SubmenuWinApi = {
  onData: (cb: (d: SubmenuData) => void) => {
    ipcRenderer.on('profilesubmenu:data', (_e, d: SubmenuData) => cb(d))
    ipcRenderer.send('profilesubmenu:ready') // ya hay quien escuche: mándame los datos
  },
  reportHeight: (h: number) => ipcRenderer.send('profilesubmenu:height', h),
  action: (action: string) => ipcRenderer.send('profilesubmenu:action', action)
}

contextBridge.exposeInMainWorld('profilesubmenu', api)
