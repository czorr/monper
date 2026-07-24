import { contextBridge, ipcRenderer } from 'electron'
import type { ChatContext, BrowserState, ChatMessage, MonperApi, Suggestion } from '../shared/types'

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
  setOmnibox: (open) => ipcRenderer.send('ui:omnibox', open),
  omniShow: (rect, data) => ipcRenderer.send('omni:show', rect, data),
  omniUpdate: (data) => ipcRenderer.send('omni:update', data),
  omniHide: () => ipcRenderer.send('omni:hide'),
  onOmniChosen: (cb: (i: number) => void) => sub('omni:chosen', (i) => cb(i as number)),
  onOmniHovered: (cb: (i: number) => void) => sub('omni:hovered', (i) => cb(i as number)),
  openSiteInfo: (anchor) => ipcRenderer.send('siteinfo:open', anchor),
  openProfileMenu: (anchor) => ipcRenderer.send('profilemenu:open', anchor),
  getProfile: () => ipcRenderer.invoke('profile:get') as Promise<import('../shared/types').Profile>,
  onProfile: (cb) => sub('profile:changed', (p) => cb(p as never)),
  onState: (cb: (state: BrowserState) => void) => {
    const handler = (_e: unknown, state: BrowserState) => cb(state)
    ipcRenderer.on('state:update', handler)
    return () => { ipcRenderer.removeListener('state:update', handler) }
  },
  toggleBookmark: () => ipcRenderer.send('bookmarks:toggle'),
  getBookmarks: () => ipcRenderer.invoke('bookmarks:list') as Promise<import('../shared/types').Bookmark[]>,
  onBookmarks: (cb) => sub('bookmarks:changed', (l) => cb(l as never)),
  removeBookmark: (id: string) => ipcRenderer.send('bookmarks:remove', id),
  openBookmark: (id: string) => ipcRenderer.send('bookmarks:open', id),
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
  takeOver: () => ipcRenderer.send('agent:takeOver'),
  onChatToken: (cb: (text: string) => void) => sub('chat:token', (t) => cb(t as string)),
  onChatStep: (cb) => sub('chat:step', (s) => cb(s as never)),
  onChatStepImage: (cb: (dataUrl: string) => void) => sub('chat:stepImage', (d) => cb(d as string)),
  onChatDone: (cb: () => void) => sub('chat:done', () => cb()),
  onChatError: (cb: (m: string) => void) => sub('chat:error', (m) => cb(m as string)),
  openVault: (anchor) => ipcRenderer.send('vault:open', anchor),
  onMenuAction: (cb: (action: string) => void) => sub('menu:action', (a) => cb(a as string)),
  suggest: (query: string) => ipcRenderer.invoke('omni:suggest', query) as Promise<Suggestion[]>
}

contextBridge.exposeInMainWorld('monper', api)
