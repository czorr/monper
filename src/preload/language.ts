import { contextBridge, ipcRenderer } from 'electron'
import { getLocale, isLocale, setLocale, type LanguageApi, type Locale } from '../shared/i18n'

// El primer render y los módulos con etiquetas estáticas necesitan el idioma antes de cargar.
const initial: Locale = ipcRenderer.sendSync('language:get')
if (isLocale(initial)) setLocale(initial)
ipcRenderer.on('language:changed', (_event, value: unknown) => {
  if (isLocale(value)) setLocale(value)
})

const api: LanguageApi = {
  initial,
  set: (locale) => ipcRenderer.invoke('language:set', locale),
  subscribe: (callback) => {
    const handler = (_event: unknown, value: unknown): void => { if (isLocale(value)) callback(value) }
    ipcRenderer.on('language:changed', handler)
    callback(getLocale())
    return () => { ipcRenderer.removeListener('language:changed', handler) }
  }
}

// El preload de contenido también vive en sitios externos; allí no se expone la preferencia.
const internal = /\/(?:index|newtab|settings|error|downloads|history|bookmarks|vault|omnibox|siteinfo|permask|pip|profilemenu|profilesubmenu|peekbar|signin|extensions|downloadspop)\.html$/.test(location.pathname) &&
  (location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
if (internal) contextBridge.exposeInMainWorld('titanioLanguage', api)
