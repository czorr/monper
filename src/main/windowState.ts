import { join } from 'path'
import { existsSync } from 'fs'
import { readJson, writeJson } from './jsonfile'
import { app, screen, type BrowserWindow, type Rectangle } from 'electron'

export interface WindowState {
  bounds?: Rectangle // bounds "normales" (no maximizados)
  maximized?: boolean
}

let file = ''
let state: WindowState = {}
let saveTimer: NodeJS.Timeout | null = null

export function initWindowState(): void {
  file = join(app.getPath('userData'), 'window-state.json')
  if (existsSync(file)) {
    state = readJson(file, {} as typeof state, 'el tamaño de la ventana')
  }
}

// ¿Los bounds guardados siguen visibles en algún monitor conectado?
function isVisible(b: Rectangle): boolean {
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea
    return b.x < wa.x + wa.width && b.x + b.width > wa.x && b.y < wa.y + wa.height && b.y + b.height > wa.y
  })
}

/** Opciones de tamaño/posición para el BrowserWindow (bounds guardados o default centrado). */
export function initialBounds(defaultW: number, defaultH: number): Partial<Rectangle> {
  if (state.bounds && isVisible(state.bounds)) return state.bounds
  return { width: defaultW, height: defaultH }
}

/** true si la ventana debe abrir maximizada (sesión previa maximizada o primer arranque). */
export function shouldMaximize(): boolean {
  // Sin estado previo (primer arranque) → maximiza. Con estado → respeta la última sesión.
  return state.bounds ? !!state.maximized : true
}

/** Engancha los listeners que persisten tamaño/posición/maximizado de la ventana. */
export function trackWindow(win: BrowserWindow): void {
  const persistSoon = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      writeJson(file, state, 'el tamaño de la ventana', false)
    }, 400)
  }
  const capture = (): void => {
    state.maximized = win.isMaximized()
    // getNormalBounds da los bounds de restauración aunque esté maximizada.
    if (!win.isMinimized()) state.bounds = win.getNormalBounds()
    persistSoon()
  }
  win.on('resize', capture)
  win.on('move', capture)
  win.on('maximize', capture)
  win.on('unmaximize', capture)
  win.on('close', capture)
}
