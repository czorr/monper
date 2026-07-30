import { join } from 'path'
import { app, BrowserWindow, ipcMain, screen, type WebContents } from 'electron'
import { readJson, writeJson } from './jsonfile'

/**
 * Picture-in-Picture propio.
 *
 * El de Chromium no existe en Electron (ver `preload/pipSource.ts`), así que la ventana la
 * ponemos nosotros — lo que además permite que tenga la cara de Monper: esquinas redondeadas,
 * el vídeo limpio en reposo y los controles y el sitio de origen solo al pasar por encima.
 *
 * Aquí solo se hace de intermediario: el vídeo NUNCA pasa por el main. Va directo de la
 * pestaña a la ventana por WebRTC; por IPC solo cruzan el SDP y los comandos de los botones.
 */

interface PipState { enabled: boolean }
const POR_DEFECTO: PipState = { enabled: true }

let file = ''
let estado: PipState = POR_DEFECTO
let win: BrowserWindow | null = null
/** La pestaña que está echando el vídeo: a ella vuelven los comandos de los controles. */
let fuente: WebContents | null = null
let rendererUrl: string | null = null

const ANCHO = 400
const ALTO = 225 // 16:9

export function initPip(rendererURL: string | null): void {
  file = join(app.getPath('userData'), 'pip.json')
  estado = readJson<PipState>(file, POR_DEFECTO, 'la configuración del PiP')
  rendererUrl = rendererURL
}

export function pipState(): PipState {
  return { ...estado }
}

export function setPipEnabled(on: boolean): void {
  estado = { enabled: on }
  writeJson(file, estado, 'la configuración del PiP', false)
  if (!on) cerrarPip()
}

export function cerrarPip(): void {
  if (win && !win.isDestroyed()) win.destroy()
  win = null
  // Que la pestaña suelte su RTCPeerConnection: si no, sigue codificando vídeo para nadie.
  if (fuente && !fuente.isDestroyed()) fuente.send('pip:comando', 'cerrar')
  fuente = null
}

/**
 * Esquina inferior derecha de la pantalla donde está el cursor, como cualquier PiP.
 * `workArea` y no `bounds`: hay que respetar el Dock y la barra de menú.
 */
function posicionInicial(): { x: number; y: number } {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  return { x: workArea.x + workArea.width - ANCHO - 24, y: workArea.y + workArea.height - ALTO - 24 }
}

function crearVentana(): BrowserWindow {
  const { x, y } = posicionInicial()
  const w = new BrowserWindow({
    x, y, width: ANCHO, height: ALTO,
    minWidth: 240, minHeight: 135,
    // Sin marco y transparente para que manden las esquinas redondeadas del CSS: con marco,
    // macOS pinta su propio fondo cuadrado por debajo y se ven las cuatro puntas.
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    hasShadow: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // El sentido del PiP es seguir viéndolo mientras haces otra cosa, también fuera de Monper.
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/pipwin.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  // 'floating' se queda POR DEBAJO de una app en pantalla completa, que es justo cuando más
  // falta hace ver el vídeo. Este nivel sí sobrevive a los espacios de macOS.
  w.setAlwaysOnTop(true, 'screen-saver')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  w.setAspectRatio(16 / 9)

  if (rendererUrl) void w.loadURL(`${rendererUrl}/pip.html`)
  else void w.loadFile(join(__dirname, '../renderer/pip.html'))

  w.on('closed', () => {
    win = null
    if (fuente && !fuente.isDestroyed()) fuente.send('pip:comando', 'cerrar')
    fuente = null
  })
  return w
}

/**
 * Trae al frente la ventana que contiene una pestaña. Lo rellena `index.ts`: aquí no se sabe
 * qué `Ventana` tiene qué vista — `BrowserWindow.fromWebContents` devuelve null para un
 * `WebContentsView`, que es lo que son las pestañas.
 */
let traerAlFrente: ((wc: WebContents) => void) | null = null

export function attachPip(alFrente: (wc: WebContents) => void): void {
  traerAlFrente = alFrente
  /**
   * La pestaña abre el PiP: manda su oferta SDP y espera la respuesta de la ventana.
   *
   * Devolver `null` es un "no" legítimo (el usuario lo tiene desactivado), y el origen lo
   * trata como tal soltando su conexión. No es un fallo que haya que gritar.
   */
  ipcMain.handle('pip:abrir', async (e, datos: { sdp: string; origen: string; titulo: string; pausado: boolean }) => {
    if (!estado.enabled) return null

    cerrarPip() // uno cada vez: dos vídeos flotando es ruido, no una función
    fuente = e.sender
    win = crearVentana()

    // La ventana avisa cuando su renderer está listo; sin esperar, el `send` de abajo llegaría
    // antes de que React monte y nadie lo escucharía (la carrera de siempre con los popovers).
    const respuesta = await new Promise<string | null>((resolve) => {
      const alTerminar = (_ev: unknown, sdp: string): void => resolve(sdp)
      ipcMain.once('pip:respuesta', alTerminar)
      const listo = (): void => {
        win?.webContents.send('pip:oferta', datos)
      }
      ipcMain.once('pip:listo', listo)
      // Si la ventana no contesta, no dejamos a la pestaña esperando para siempre.
      setTimeout(() => { ipcMain.removeListener('pip:respuesta', alTerminar); resolve(null) }, 8000)
    })

    if (!respuesta) {
      console.error('[pip] la ventana no devolvió la respuesta SDP: se cierra')
      cerrarPip()
      return null
    }
    win?.showInactive() // aparece sin robarle el foco a lo que estés haciendo
    return respuesta
  })

  ipcMain.on('pip:comando', (_e, cmd: string) => {
    if (cmd === 'cerrar') { cerrarPip(); return }
    if (fuente && !fuente.isDestroyed()) fuente.send('pip:comando', cmd)
  })

  ipcMain.on('pip:cerrar', () => cerrarPip())

  /** "Volver a la pestaña": trae al frente la ventana del navegador y cierra el PiP. */
  ipcMain.on('pip:volver', () => {
    const wc = fuente
    cerrarPip()
    if (wc && !wc.isDestroyed()) traerAlFrente?.(wc)
  })
}
