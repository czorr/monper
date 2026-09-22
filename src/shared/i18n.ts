import { messages } from './locales/messages'

export type Locale = 'en' | 'es'
export type Message = keyof typeof messages
export interface LanguageApi {
  initial: Locale
  set: (locale: Locale) => Promise<void>
  subscribe: (callback: (locale: Locale) => void) => () => void
}

declare global {
  interface Window { titanioLanguage?: LanguageApi }
}

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'es'
}

export function resolveLocale(value: string): Locale {
  return /^es(?:[-_]|$)/i.test(value) ? 'es' : 'en'
}

let locale: Locale = typeof window !== 'undefined' && window.titanioLanguage
  ? window.titanioLanguage.initial : 'es'
const listeners = new Set<() => void>()
export const getLocale = (): Locale => locale
export function setLocale(value: Locale): void {
  if (!isLocale(value) || value === locale) return
  locale = value
  for (const listener of listeners) listener()
}
export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// Solo se sustituyen los parámetros declarados: nunca se vuelve a interpretar su contenido.
export function t(key: Message, ...values: unknown[]): string {
  return messages[key][locale].replace(/\{(\d+)\}/g, (match, index: string) =>
    Number(index) < values.length ? String(values[Number(index)] ?? '') : match)
}

if (typeof window !== 'undefined' && window.titanioLanguage) {
  const titles: Record<string, Message> = {
    newtab: 'Nueva pestaña', settings: 'Settings', downloads: 'Downloads', history: 'History',
    bookmarks: 'Bookmarks', error: 'No se pudo cargar la página', vault: 'Vault',
    extensions: 'Extensions', signin: 'Sign in', siteinfo: 'Site info', profilemenu: 'Perfil',
    profilesubmenu: 'Perfil', permask: 'Permisos', pip: 'Picture in picture',
    downloadspop: 'Downloads', omnibox: 'Address bar', peekbar: 'Tabs'
  }
  const updateDocument = (): void => {
    document.documentElement.lang = locale
    const page = location.pathname.split('/').pop()?.replace(/\.html$/, '') ?? ''
    if (titles[page]) document.title = t(titles[page])
  }
  updateDocument()
  window.titanioLanguage.subscribe((value) => {
    setLocale(value)
    updateDocument()
  })
}
