import { app, dialog, Notification, type BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppUpdater } from 'electron-updater'
import { NO_UPDATE, type UpdateState } from '../shared/types'

/**
 * Actualizaciones (electron-updater, origen en electron-builder.yml).
 *
 * La descarga NO es automática a propósito: el usuario la dispara desde el pill. Así no
 * consumimos su ancho de banda por sorpresa y el flujo es visible:
 *   hay versión nueva → click → descargando (%) → lista → click → reinicia e instala.
 *
 * OJO en macOS: instalar EXIGE app firmada. Sin firma la descarga acaba pero
 * `quitAndInstall` falla. Ver docs/distribucion.md.
 *
 * MONPER_FAKE_UPDATE=1 simula el ciclo completo (con progreso real de mentira) para
 * poder ver y ajustar la UI sin publicar una release.
 */

const FAKE = process.env['MONPER_FAKE_UPDATE'] === '1'
/**
 * Origen alternativo para probar el ciclo real (detección + descarga + verificación de
 * sha512) sin publicar nada: `MONPER_UPDATE_FEED=http://localhost:8788`.
 * Ver scripts/fake-update-server.mjs y docs/distribucion.md.
 */
const FEED = process.env['MONPER_UPDATE_FEED']
const EMPTY = NO_UPDATE

let state: UpdateState = { ...EMPTY }
let notify: (s: UpdateState) => void = () => {}
let updater: AppUpdater | null = null
let fakeTimer: NodeJS.Timeout | null = null

export function getUpdateState(): UpdateState { return state }
export function onUpdateState(cb: (s: UpdateState) => void): void { notify = cb }

function set(patch: Partial<UpdateState>): void {
  if (patch.error && patch.error !== state.error) console.error('[update] error:', patch.error)
  state = { ...state, ...patch }
  notify(state)
}

/** El mensaje pelado de electron-updater se queda corto; añade la causa real si la hay. */
function why(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  const cause = e.cause instanceof Error ? ` (${e.cause.message})` : ''
  return `${e.message}${cause}`
}

function readyNotification(version: string | null): void {
  const n = new Notification({
    title: 'Monper está listo para actualizarse',
    body: `Versión ${version ?? ''}. Click para reiniciar e instalar.`
  })
  n.on('click', () => installUpdate())
  n.show()
}

/** Carga electron-updater solo cuando hace falta: en dev no lo tocamos (salvo con FEED). */
async function get(): Promise<AppUpdater | null> {
  if (!app.isPackaged && !FEED) return null
  if (updater) return updater
  try {
    const mod = await import('electron-updater')
    updater = mod.autoUpdater
    if (FEED) {
      // forceDevUpdateConfig permite probar sin empaquetar, pero OJO: al descargar,
      // electron-updater vuelve a leer dev-app-update.yml del disco e ignora el
      // setFeedURL de abajo. Sin escribir el archivo, el check encuentra la versión y la
      // descarga muere con ENOENT. Ya pasó: no quitar esto.
      const cfg = join(app.getAppPath(), 'dev-app-update.yml')
      writeFileSync(cfg, `provider: generic\nurl: ${FEED}\n`)
      updater.forceDevUpdateConfig = true
      updater.setFeedURL({ provider: 'generic', url: FEED })
      console.log('[update] usando feed de prueba:', FEED, '→', cfg)
    }
    updater.autoDownload = false // la dispara el usuario desde el pill
    updater.autoInstallOnAppQuit = true
    updater.on('error', (e) => set({ checking: false, downloading: false, error: why(e) }))
    updater.on('update-available', (i) => set({ checking: false, available: true, version: i.version, error: null }))
    updater.on('update-not-available', () => set({ ...EMPTY }))
    updater.on('download-progress', (p) => set({ downloading: true, percent: Math.round(p.percent) }))
    updater.on('update-downloaded', (i) => {
      set({ downloading: false, percent: 100, downloaded: true, available: true, version: i.version })
      readyNotification(i.version)
    })
    return updater
  } catch (e) {
    set({ error: why(e) })
    return null
  }
}

/** Comprueba si hay actualización. `manual` da feedback aunque no haya nada nuevo. */
export async function checkForUpdates(manual = false, win?: BrowserWindow | null): Promise<void> {
  if (state.checking || state.downloading) return
  if (FAKE) {
    set({ ...EMPTY, available: true, version: '0.2.0-demo' })
    return
  }
  if (!app.isPackaged && !FEED) {
    if (manual && win) {
      dialog.showMessageBox(win, {
        type: 'info', buttons: ['OK'],
        message: 'Sin actualizaciones en desarrollo',
        detail: 'Solo funcionan en la app empaquetada, o con MONPER_UPDATE_FEED apuntando a un feed de prueba.'
      })
    }
    return
  }
  const up = await get()
  if (!up) return
  set({ checking: true, error: null })
  try {
    const r = await up.checkForUpdates()
    const v = r?.updateInfo?.version
    // checkForUpdates no dispara 'update-not-available' si ya estábamos al día.
    if (!v || v === app.getVersion()) set({ ...EMPTY })
    else set({ checking: false })
  } catch (e) {
    set({ checking: false, error: why(e) })
  }
}

/** Empieza la descarga (la dispara el usuario). */
export async function downloadUpdate(): Promise<void> {
  if (state.downloading || state.downloaded) return
  set({ downloading: true, percent: 0, error: null })
  if (FAKE) {
    // Progreso simulado para poder ver la UI de descarga.
    if (fakeTimer) clearInterval(fakeTimer)
    fakeTimer = setInterval(() => {
      const next = Math.min(100, state.percent + 7)
      if (next >= 100) {
        if (fakeTimer) { clearInterval(fakeTimer); fakeTimer = null }
        set({ downloading: false, percent: 100, downloaded: true })
        readyNotification(state.version)
      } else {
        set({ percent: next })
      }
    }, 220)
    return
  }
  const up = await get()
  if (!up) { set({ downloading: false }); return }
  try {
    await up.downloadUpdate()
  } catch (e) {
    set({ downloading: false, error: why(e) })
  }
}

/** Reinicia e instala. Requiere app firmada en macOS. */
export function installUpdate(): void {
  if (FAKE) {
    // No podemos reiniciar de mentira: limpiamos el estado para ver que el pill desaparece.
    if (fakeTimer) { clearInterval(fakeTimer); fakeTimer = null }
    set({ ...EMPTY })
    return
  }
  if (!updater) return
  try { updater.quitAndInstall() } catch (e) { set({ error: why(e) }) }
}

/** Comprobación silenciosa al arrancar + cada 6 h para sesiones largas. */
export async function initUpdater(): Promise<void> {
  if (FAKE) { await checkForUpdates(); return }
  if (!app.isPackaged && !FEED) return
  await checkForUpdates()
  setInterval(() => { void checkForUpdates() }, 6 * 60 * 60 * 1000)
}
