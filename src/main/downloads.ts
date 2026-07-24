import { shell, type Session, type DownloadItem } from 'electron'
import type { DownloadEntry } from '../shared/types'

// Descargas rastreadas (más recientes al frente de la lista).
const items = new Map<string, { item: DownloadItem; entry: DownloadEntry }>()
let counter = 0
let notify: () => void = () => {}

export function initDownloads(onChange: () => void): void {
  notify = onChange
}

/** Engancha el rastreo de descargas a la sesión del partition. */
export function attachDownloads(ses: Session): void {
  ses.on('will-download', (_e, item) => {
    const id = `d${++counter}`
    const entry: DownloadEntry = {
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      savePath: '',
      state: 'progressing',
      received: 0,
      total: item.getTotalBytes(),
      paused: false
    }
    items.set(id, { item, entry })
    notify()
    item.on('updated', (_e2, state) => {
      entry.received = item.getReceivedBytes()
      entry.total = item.getTotalBytes()
      entry.paused = item.isPaused()
      entry.state = state === 'interrupted' ? 'interrupted' : 'progressing'
      entry.savePath = item.getSavePath()
      notify()
    })
    item.once('done', (_e2, state) => {
      entry.state = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted'
      entry.received = item.getReceivedBytes()
      entry.savePath = item.getSavePath()
      notify()
    })
  })
}

export function listDownloads(): DownloadEntry[] {
  return [...items.values()].map((v) => ({ ...v.entry })).reverse()
}
export function activeDownloadCount(): number {
  return [...items.values()].filter((v) => v.entry.state === 'progressing').length
}
export function cancelDownload(id: string): void {
  items.get(id)?.item.cancel()
}
export function openDownload(id: string): void {
  const p = items.get(id)?.entry.savePath
  if (p) shell.openPath(p)
}
export function showDownload(id: string): void {
  const p = items.get(id)?.entry.savePath
  if (p) shell.showItemInFolder(p)
}
export function clearDownloads(): void {
  for (const [id, v] of items) if (v.entry.state !== 'progressing') items.delete(id)
  notify()
}
