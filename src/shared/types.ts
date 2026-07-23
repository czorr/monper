export interface TabInfo {
  id: number
  url: string
  title: string
  favicon: string | null
  loading: boolean
}

export interface ActiveInfo {
  url: string
  title: string
  canBack: boolean
  canForward: boolean
  loading: boolean
  pageColor: string | null
  bookmarked: boolean
}

export interface Bookmark {
  id: string
  title: string
  url: string
  favicon?: string | null
}

export interface BrowserState {
  activeId: number | null
  tabs: TabInfo[]
  active: ActiveInfo | null
}

export interface MenuAnchor {
  x: number
  y: number
  width: number
  height: number
}

export type MenuActionName =
  | 'switch-profile' | 'new-profile' | 'bookmarks' | 'downloads'
  | 'extensions' | 'history' | 'developers' | 'settings'
  | 'new-tab' | 'incognito'

export interface MonperApi {
  platform: NodeJS.Platform
  newTab: () => void
  closeTab: (id: number) => void
  selectTab: (id: number) => void
  go: (url: string) => void
  back: () => void
  forward: () => void
  reload: () => void
  setCollapsed: (v: boolean) => void
  onState: (cb: (state: BrowserState) => void) => () => void
  toggleBookmark: () => void
  openDevtools: () => void
  openDownloads: () => void
  openSettings: () => void
  /** DEV: cicla materiales de vibrancy en vivo (⌘⌥V) */
  cycleVibrancy: () => void
  /** Notifica cuando el usuario interactúa con la página (para cerrar overlays) */
  onPagePointerDown: (cb: () => void) => () => void
}

/** API expuesta a las páginas internas de contenido (new-tab page) */
export interface MonperTabApi {
  navigate: (url: string) => void
  getBookmarks: () => Promise<Bookmark[]>
  addBookmark: (b: Omit<Bookmark, 'id'>) => void
  removeBookmark: (id: string) => void
  onBookmarks: (cb: (bookmarks: Bookmark[]) => void) => () => void
  /** Borra datos de navegación (cookies, storage, cache) del perfil */
  clearBrowsingData: () => Promise<boolean>
}

declare global {
  interface Window {
    monper: MonperApi
    monperTab: MonperTabApi
  }
}
