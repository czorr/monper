import { contextBridge, ipcRenderer } from 'electron'
import type { ChatContext, BrowserState, ChatMessage, MonperApi } from '../shared/types'

function sub(channel: string, cb: (...a: unknown[]) => void): () => void {
  const handler = (_e: unknown, ...args: unknown[]): void => cb(...args)
  ipcRenderer.on(channel, handler)
  return () => { ipcRenderer.removeListener(channel, handler) }
}

const api: MonperApi = {
  platform: process.platform,
  newTab: () => ipcRenderer.invoke('tabs:new'),
  closeTab: (id) => ipcRenderer.invoke('tabs:close', id),
  selectTab: (id) => ipcRenderer.invoke('tabs:select', id),
  go: (url) => ipcRenderer.invoke('nav:go', url),
  back: () => ipcRenderer.invoke('nav:back'),
  forward: () => ipcRenderer.invoke('nav:forward'),
  reload: () => ipcRenderer.invoke('nav:reload'),
  setCollapsed: (v) => ipcRenderer.invoke('ui:collapse', v),
  setChat: (open) => ipcRenderer.invoke('ui:chat', open),
  onState: (cb: (state: BrowserState) => void) => {
    const handler = (_e: unknown, state: BrowserState) => cb(state)
    ipcRenderer.on('state:update', handler)
    return () => { ipcRenderer.removeListener('state:update', handler) }
  },
  toggleBookmark: () => ipcRenderer.send('bookmarks:toggle'),
  openDevtools: () => ipcRenderer.send('ui:devtools'),
  openDownloads: () => ipcRenderer.send('ui:downloads'),
  openSettings: () => ipcRenderer.send('ui:settings'),
  cycleVibrancy: () => ipcRenderer.send('ui:cycleVibrancy'),
  onPagePointerDown: (cb: () => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('page:pointerdown', handler)
    return () => { ipcRenderer.removeListener('page:pointerdown', handler) }
  },
  getChatContext: () => ipcRenderer.invoke('chat:context') as Promise<ChatContext>,
  onChatContext: (cb: (ctx: ChatContext) => void) => sub('chat:contextChanged', (c) => cb(c as ChatContext)),
  setModel: (id: string) => ipcRenderer.send('chat:setModel', id),
  setEffort: (e) => ipcRenderer.send('chat:setEffort', e),
  chatSend: (messages: ChatMessage[]) => { ipcRenderer.invoke('chat:send', messages) },
  chatCancel: () => ipcRenderer.send('chat:cancel'),
  onChatToken: (cb: (text: string) => void) => sub('chat:token', (t) => cb(t as string)),
  onChatDone: (cb: () => void) => sub('chat:done', () => cb()),
  onChatError: (cb: (m: string) => void) => sub('chat:error', (m) => cb(m as string))
}

contextBridge.exposeInMainWorld('monper', api)
