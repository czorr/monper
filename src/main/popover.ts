import { join } from 'path'
import { BrowserWindow, ipcMain, type BrowserWindow as BW } from 'electron'
import type { MenuAnchor } from '../shared/types'

/**
 * Factoría de popovers nativos.
 *
 * Los overlays de Monper TIENEN que ser ventanas nativas porque la vista de la página
 * (WebContentsView) se dibuja encima del DOM. Antes cada uno se creaba a mano y cada uno
 * traía sus propios bugs de foco, hover, posicionamiento y auto-cierre. Esto lo centraliza.
 */

/** Margen del panel dentro de la ventana (debe coincidir con el p-3 de PopoverPanel). */
const PAD = 12

export interface PopoverOptions {
  /** Identificador; define los canales IPC: `<name>:height`. */
  name: string
  /** Ancho del panel (sin contar el margen de la sombra). */
  width: number
  /** Archivo del preload en out/preload y de la página en out/renderer. */
  preload: string
  page: string
  /** Alto inicial mientras el renderer no ha medido. Evita el salto al abrir. */
  height?: number
  /**
   * false = no roba el foco (omnibox: el input del chrome debe seguir enfocado).
   * true (default) = se cierra al perder el foco, como un menú.
   */
  focusable?: boolean
  /** Alineación horizontal respecto al anchor. */
  align?: 'left' | 'center' | 'right'
  /** Ocupa desde el anchor hasta el fondo de la ventana (peek del sidebar). */
  fullHeight?: boolean
  /**
   * El ancho lo manda el anchor, no `width` (la omnibox: el dropdown mide lo que el input).
   */
  widthFromAnchor?: boolean
  /** Desplazamiento vertical respecto al borde inferior del anchor. */
  offsetY?: number
  /**
   * Datos que el popover necesita al abrirse.
   *
   * Se envían al mostrar, en `did-finish-load` y —lo importante— cuando el renderer avisa
   * por `<name>:ready` de que ya se ha suscrito. Los dos primeros pueden llegar antes de que
   * el componente registre su listener; el tercero es el que garantiza que no se pierdan.
   */
  data?: { channel: string; get: () => unknown }
  /** Se llama al esconderlo. Lo usa el menú de perfil para arrastrar consigo su submenú. */
  onHide?: () => void
  /**
   * Si devuelve true, NO se cierra al perder el foco.
   *
   * Lo usa el menú de perfil mientras su submenú está abierto: el submenú tiene que poder
   * tomar el foco (macOS no manda eventos de ratón a ventanas inactivas, así que sin foco no
   * hay hover), y sin esto el padre se cerraría en cuanto el hijo se lo quitara.
   */
  keepOnBlur?: () => boolean
  /**
   * false = se muestra sin activarse, aunque sea focusable.
   *
   * El submenú lo necesita: se abre al pasar el ratón por una fila del menú padre, y si
   * robara el foco ahí, las demás filas del padre dejarían de responder al hover (macOS no
   * manda eventos de ratón a ventanas inactivas). El foco se lo lleva después, cuando el
   * cursor entra de verdad en él.
   */
  activateOnShow?: boolean
}

export interface Popover {
  /** Crea la ventana si no existe (pre-warm para que el primer click sea instantáneo). */
  ensure: () => BW
  /** Posiciona en el anchor y muestra. */
  show: (anchor: MenuAnchor) => void
  hide: () => void
  isVisible: () => boolean
  /** Manda un mensaje al renderer del popover (no falla si no existe). */
  send: (channel: string, payload?: unknown) => void
  /** Reposiciona con el último anchor (resize de la ventana padre). */
  reposition: () => void
  readonly window: BW | null
}

export function createPopover(getParent: () => BW | null, opts: PopoverOptions, rendererUrl?: string): Popover {
  const focusable = opts.focusable !== false
  let win: BW | null = null
  let anchor: MenuAnchor | null = null
  let height = opts.height ?? 240

  const place = (): void => {
    const parent = getParent()
    if (!win || win.isDestroyed() || !anchor || !parent) return
    const cb = parent.getContentBounds()
    const outerW = (opts.widthFromAnchor ? anchor.width : opts.width) + PAD * 2
    // Alineación horizontal respecto al anchor, con el margen de la sombra descontado.
    const rawX =
      opts.align === 'center' ? cb.x + anchor.x + anchor.width / 2 - outerW / 2
        : opts.align === 'right' ? cb.x + anchor.x + anchor.width - outerW + PAD
          : cb.x + anchor.x - PAD
    // No dejar que se salga de la ventana padre.
    const x = Math.round(Math.min(Math.max(rawX, cb.x), cb.x + cb.width - outerW))
    const y = Math.round(cb.y + anchor.y + anchor.height + (opts.offsetY ?? -4))
    const h = opts.fullHeight ? Math.max(1, cb.y + cb.height - y) : Math.max(1, Math.round(height))
    win.setBounds({ x, y, width: outerW, height: h })
  }

  const ensure = (): BW => {
    if (win && !win.isDestroyed()) return win
    const parent = getParent()
    win = new BrowserWindow({
      parent: parent ?? undefined,
      width: opts.width + PAD * 2,
      height: height,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: false, // la sombra la dibuja el CSS del panel
      skipTaskbar: true,
      backgroundColor: '#00000000',
      focusable,
      acceptFirstMouse: true, // el primer click funciona sin activar la ventana
      webPreferences: {
        preload: join(__dirname, `../preload/${opts.preload}.js`),
        contextIsolation: true,
        sandbox: false
      }
    })
    // Un menú se cierra al perder el foco; un overlay no-focusable no tiene ese evento.
    if (focusable) win.on('blur', () => { if (!opts.keepOnBlur?.()) hide() })
    /**
     * `did-finish-load` NO basta: dispara cuando la página termina de cargar, pero el
     * componente registra su listener DESPUÉS (en su efecto), así que el mensaje se perdía y
     * el popover salía vacío la primera vez. Se deja como cinturón, pero lo que de verdad
     * cierra la carrera es `<name>:ready`, que manda el preload en cuanto alguien se suscribe.
     */
    if (opts.data) {
      const { channel, get } = opts.data
      win.webContents.on('did-finish-load', () => {
        if (win && !win.isDestroyed()) win.webContents.send(channel, get())
      })
    }
    win.once('ready-to-show', () => { pintado = true })
    if (rendererUrl) win.loadURL(`${rendererUrl}/${opts.page}.html`)
    else win.loadFile(join(__dirname, `../renderer/${opts.page}.html`))
    return win
  }

  /**
   * ¿Ya pintó su primer frame? Antes de eso la ventana existe pero está EN BLANCO.
   *
   * Mostrarla igualmente era el "tarda una barbaridad" del menú de perfil: medido, la ventana
   * salía a los 59 ms y el contenido a los 291 ms — casi un cuarto de segundo de panel vacío en
   * pantalla. Las siguientes aperturas van a 13 ms porque el renderer ya está vivo.
   */
  let pintado = false
  /** Cambia en cada `show`/`hide`: un `ready-to-show` que llega tarde no debe abrir nada. */
  let turno = 0

  const hide = (): void => {
    turno++
    if (win && !win.isDestroyed() && win.isVisible()) win.hide()
    opts.onHide?.()
  }

  // Canales comunes: el renderer reporta el alto de su panel y puede cerrarse solo.
  ipcMain.on(`${opts.name}:height`, (_e, h: number) => {
    height = Math.round(h) + PAD * 2
    place()
  })
  ipcMain.on(`${opts.name}:close`, () => hide())
  // "ya estoy escuchando": el renderer lo manda al suscribirse y aquí se le contesta con los
  // datos. Es lo único que garantiza que no se pierdan por llegar antes de tiempo.
  ipcMain.on(`${opts.name}:ready`, () => {
    if (opts.data && win && !win.isDestroyed()) win.webContents.send(opts.data.channel, opts.data.get())
  })

  return {
    ensure,
    show: (a: MenuAnchor) => {
      anchor = a
      const w = ensure()
      if (opts.data) w.webContents.send(opts.data.channel, opts.data.get())
      const mio = ++turno
      const aparecer = (): void => {
        // Si mientras cargaba se pidió cerrar (o abrir otro), este `show` ya no toca.
        if (mio !== turno || !win || win.isDestroyed()) return
        place() // posicionar ANTES de mostrar evita el flash en la esquina
        if (focusable && opts.activateOnShow !== false) { win.show(); win.focus() } else win.showInactive()
      }
      if (pintado) aparecer()
      else w.once('ready-to-show', aparecer)
    },
    hide,
    isVisible: () => !!win && !win.isDestroyed() && win.isVisible(),
    send: (channel, payload) => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
    },
    reposition: place,
    get window() { return win && !win.isDestroyed() ? win : null }
  }
}
