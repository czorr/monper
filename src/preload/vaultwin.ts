import { contextBridge, ipcRenderer } from 'electron'
import type { VaultWinApi } from '../shared/types'
import type { VaultItemMeta } from '../shared/vault'

const api: VaultWinApi = {
  onItems: (cb: (items: VaultItemMeta[], favicons: Record<string, string>) => void) => {
    ipcRenderer.on('vault:items', (_e, items: VaultItemMeta[], favicons: Record<string, string>) =>
      cb(items, favicons ?? {})
    )
  },
  close: () => ipcRenderer.send('vault:closeWindow'),
  manage: () => ipcRenderer.send('vault:manage')
}

contextBridge.exposeInMainWorld('vaultwin', api)
