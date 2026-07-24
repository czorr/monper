import { contextBridge, ipcRenderer } from 'electron'
import type { PeekWinApi } from '../shared/types'

const api: PeekWinApi = {
  onState: (cb) => {
    const h = (_e: unknown, s: unknown): void => cb(s as never)
    ipcRenderer.on('peek:state', h)
    return () => { ipcRenderer.removeListener('peek:state', h) }
  },
  onShown: (cb) => {
    const h = (): void => cb()
    ipcRenderer.on('peek:shown', h)
    return () => { ipcRenderer.removeListener('peek:shown', h) }
  },
  hover: (on: boolean) => ipcRenderer.send('peek:hover', on),
  selectTab: (id: number) => ipcRenderer.send('peek:select', id),
  newTab: () => ipcRenderer.send('peek:new'),
  openBookmark: (id: string) => ipcRenderer.send('peek:openBookmark', id)
}

contextBridge.exposeInMainWorld('peekbar', api)
