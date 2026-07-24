// Reusa el preload del chrome: expone window.monper completo, así el peek puede
// renderizar EL MISMO componente <Sidebar/> (close, context menus, drag, etc.).
import './index'
import { contextBridge, ipcRenderer } from 'electron'
import type { PeekWinApi } from '../shared/types'

const api: PeekWinApi = {
  onShown: (cb) => {
    const h = (): void => cb()
    ipcRenderer.on('peek:shown', h)
    return () => { ipcRenderer.removeListener('peek:shown', h) }
  },
  hide: () => ipcRenderer.send('peek:hide')
}

contextBridge.exposeInMainWorld('peekbar', api)
