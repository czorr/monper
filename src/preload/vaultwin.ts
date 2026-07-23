import { contextBridge, ipcRenderer } from 'electron'
import type { VaultWinApi } from '../shared/types'
import type { VaultItemMeta } from '../shared/vault'

const api: VaultWinApi = {
  onItems: (cb: (items: VaultItemMeta[]) => void) => {
    ipcRenderer.on('vault:items', (_e, items: VaultItemMeta[]) => cb(items))
  },
  close: () => ipcRenderer.send('vault:closeWindow'),
  manage: () => ipcRenderer.send('vault:manage')
}

contextBridge.exposeInMainWorld('vaultwin', api)
