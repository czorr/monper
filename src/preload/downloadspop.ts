import './language'
import { contextBridge, ipcRenderer } from 'electron'
import type { DownloadEntry, DownloadsPopApi } from '../shared/types'

const api: DownloadsPopApi = {
  onData: (cb: (list: DownloadEntry[]) => void) => {
    ipcRenderer.on('downloadspop:data', (_e, l: DownloadEntry[]) => cb(l))
    // Ya hay quien escuche: mándame la lista. `did-finish-load` no basta — se dispara antes
    // de que corra el efecto de React, así que el primer envío se perdería y el panel saldría
    // vacío la primera vez que se abre.
    ipcRenderer.send('downloadspop:ready')
  },
  reportHeight: (h: number) => ipcRenderer.send('downloadspop:height', h),
  open: (id: string) => ipcRenderer.send('downloadspop:open-file', id),
  reveal: (id: string) => ipcRenderer.send('downloadspop:reveal', id),
  cancel: (id: string) => ipcRenderer.send('downloadspop:cancel', id),
  clear: () => ipcRenderer.send('downloadspop:clear'),
  seeAll: () => ipcRenderer.send('downloadspop:all')
}

contextBridge.exposeInMainWorld('downloadspop', api)
