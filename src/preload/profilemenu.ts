import { contextBridge, ipcRenderer } from 'electron'
import type { ProfileMenuWinApi, DatosMenuPerfil } from '../shared/types'

const api: ProfileMenuWinApi = {
  onProfile: (cb: (d: DatosMenuPerfil) => void) => {
    ipcRenderer.on('profilemenu:profile', (_e, d: DatosMenuPerfil) => cb(d))
    // Avisa de que ya hay quien escuche: el main contesta con el perfil. Sin esto, el envío
    // del main llegaba antes de que React se suscribiera y el menú salía vacío.
    ipcRenderer.send('profilemenu:ready')
  },
  cambiarPerfil: (id: string) => ipcRenderer.send('profilemenu:switchProfile', id),
  crearPerfil: (nombre: string) => ipcRenderer.send('profilemenu:createProfile', nombre),
  borrarPerfil: (id: string) => ipcRenderer.send('profilemenu:deleteProfile', id),
  reportHeight: (h: number) => ipcRenderer.send('profilemenu:height', h),
  action: (name: string) => ipcRenderer.send('profilemenu:action', name),
  submenu: (section, rect) => ipcRenderer.send('profilemenu:submenu', section, rect),
  submenuMaybeClose: () => ipcRenderer.send('profilemenu:submenuClose'),
  close: () => ipcRenderer.send('profilemenu:close')
}

contextBridge.exposeInMainWorld('profilemenu', api)
