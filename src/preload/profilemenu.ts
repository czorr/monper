import { contextBridge, ipcRenderer } from 'electron'
import type { ProfileMenuWinApi, Profile } from '../shared/types'

const api: ProfileMenuWinApi = {
  onProfile: (cb: (p: Profile) => void) => {
    ipcRenderer.on('profilemenu:profile', (_e, p: Profile) => cb(p))
    // Avisa de que ya hay quien escuche: el main contesta con el perfil. Sin esto, el envío
    // del main llegaba antes de que React se suscribiera y el menú salía vacío.
    ipcRenderer.send('profilemenu:ready')
  },
  reportHeight: (h: number) => ipcRenderer.send('profilemenu:height', h),
  action: (name: string) => ipcRenderer.send('profilemenu:action', name),
  submenu: (section, rect) => ipcRenderer.send('profilemenu:submenu', section, rect),
  submenuMaybeClose: () => ipcRenderer.send('profilemenu:submenuClose'),
  close: () => ipcRenderer.send('profilemenu:close')
}

contextBridge.exposeInMainWorld('profilemenu', api)
