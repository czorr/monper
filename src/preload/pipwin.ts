import './language'
import { contextBridge, ipcRenderer } from 'electron'
import type { PipOferta, PipWinApi } from '../shared/types'

const api: PipWinApi = {
  onOferta: (cb: (d: PipOferta) => void) => {
    ipcRenderer.on('pip:oferta', (_e, d: PipOferta) => cb(d))
    // El main no manda la oferta hasta oír esto: si la mandara al crear la ventana, llegaría
    // antes de que React monte y se perdería (la misma carrera que los popovers).
    ipcRenderer.send('pip:listo')
  },
  responder: (sdp: string) => ipcRenderer.send('pip:respuesta', sdp),
  comando: (cmd: 'play' | 'pause' | 'cerrar') => ipcRenderer.send('pip:comando', cmd),
  volver: () => ipcRenderer.send('pip:volver')
}

contextBridge.exposeInMainWorld('pipwin', api)
