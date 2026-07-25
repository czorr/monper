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
    const outerW = opts.width + PAD * 2
    // Alineación horizontal respecto al anchor, con el margen de la sombra descontado.
    const rawX =
      opts.align === 'center' ? cb.x + anchor.x + anchor.width / 2 - outerW / 2
        : opts.align === 'right' ? cb.x + anchor.x + anchor.width - outerW + PAD
          : cb.x + anchor.x - PAD
    // No dejar que se salga de la ventana padre.
    const x = Math.round(Math.min(Math.max(rawX, cb.x), cb.x + cb.width - outerW))
    const y = Math.round(cb.y + anchor.y + anchor.height - 4)
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
    if (focusable) win.on('blur', () => hide())
    if (rendererUrl) win.loadURL(`${rendererUrl}/${opts.page}.html`)
    else win.loadFile(join(__dirname, `../renderer/${opts.page}.html`))
    return win
  }

  const hide = (): void => {
    if (win && !win.isDestroyed() && win.isVisible()) win.hide()
  }

  // Canal único de medición: el renderer reporta el alto de su panel.
  ipcMain.on(`${opts.name}:height`, (_e, h: number) => {
    height = Math.round(h) + PAD * 2
    place()
  })

  return {
    ensure,
    show: (a: MenuAnchor) => {
      anchor = a
      const w = ensure()
      place() // posicionar ANTES de mostrar evita el flash en la esquina
      if (focusable) { w.show(); w.focus() } else w.showInactive()
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
