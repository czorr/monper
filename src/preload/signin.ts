import { contextBridge, ipcRenderer } from 'electron'
import type { SigninWinApi, SigninCredential } from '../shared/types'

const api: SigninWinApi = {
  onCredentials: (cb) => {
    const h = (_e: unknown, list: SigninCredential[]): void => cb(list)
    ipcRenderer.on('signin:credentials', h)
    return () => { ipcRenderer.removeListener('signin:credentials', h) }
  },
  reportHeight: (h: number) => ipcRenderer.send('signin:height', h),
  // Solo manda el id: la contraseña la resuelve e inyecta el main (nunca pasa por aquí).
  fill: (id: string) => ipcRenderer.send('signin:fill', id),
  dismiss: () => ipcRenderer.send('signin:dismiss')
}

contextBridge.exposeInMainWorld('signin', api)
