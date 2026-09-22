import './language'
import { contextBridge, ipcRenderer } from 'electron'
import type { OmniData, OmniWinApi } from '../shared/types'

const api: OmniWinApi = {
  onData: (cb: (data: OmniData) => void) => {
    ipcRenderer.on('omni:data', (_e, d: OmniData) => cb(d))
    ipcRenderer.send('omni:ready')
  },
  reportHeight: (h: number) => ipcRenderer.send('omni:height', h),
  choose: (index: number) => ipcRenderer.send('omni:choose', index),
  hover: (index: number) => ipcRenderer.send('omni:hover', index)
}

contextBridge.exposeInMainWorld('omniwin', api)
