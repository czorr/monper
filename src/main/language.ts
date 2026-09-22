import { app, ipcMain, webContents } from 'electron'
import { join } from 'node:path'
import { getLocale, isLocale, resolveLocale, setLocale, t } from '../shared/i18n'
import { readJson, writeJson } from './jsonfile'

export function initLanguage(canChange: (url: string | undefined) => boolean, changed: () => void): void {
  const file = join(app.getPath('userData'), 'language.json')
  const saved = readJson<{ locale?: unknown }>(file, {}, 'idioma')
  setLocale(isLocale(saved?.locale) ? saved.locale : resolveLocale(app.getLocale()))
  ipcMain.on('language:get', (event) => { event.returnValue = getLocale() })
  ipcMain.handle('language:set', (event, value: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || !canChange(event.senderFrame?.url) || !isLocale(value)) {
      throw new Error(t('No permitido.'))
    }
    const result = writeJson(file, { locale: value }, 'idioma')
    if (!result.ok) throw new Error(t('No se pudo guardar el idioma.'))
    setLocale(value)
    changed()
    for (const contents of webContents.getAllWebContents()) {
      if (!contents.isDestroyed()) contents.send('language:changed', value)
    }
  })
}
