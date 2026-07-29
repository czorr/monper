import { contextBridge, ipcRenderer } from 'electron'
import type { PermAskData, PermAskWinApi } from '../shared/types'

const api: PermAskWinApi = {
  onData: (cb: (data: PermAskData) => void) => {
    ipcRenderer.on('permask:data', (_e, d: PermAskData) => cb(d))
    ipcRenderer.send('permask:ready') // ya hay quien escuche: mándame los datos
  },
  reportHeight: (h: number) => ipcRenderer.send('permask:height', h),
  answer: (granted: boolean) => ipcRenderer.send('permask:answer', granted)
}

contextBridge.exposeInMainWorld('permask', api)
