/**
 * Transport: la capa mínima e intercambiable que ejecuta JS y despacha input
 * en un navegador real. Cualquier backend (Electron WebContents, un socket CDP,
 * un iframe…) puede implementarla; `Page`/`Locator` se construyen encima.
 *
 * La idea es la misma que "Asidewright" de Aside: un wrapper opinado y delgado
 * sobre primitivas de bajo nivel, con una API idéntica a Playwright para
 * aprovechar el conocimiento del modelo, pero mucho más barato en tokens.
 */

export type MouseEventType = 'mouseMove' | 'mouseDown' | 'mouseUp' | 'mouseWheel'
export type KeyEventType = 'keyDown' | 'keyUp' | 'char'
export type MouseButton = 'left' | 'right' | 'middle'

export interface MouseOptions {
  button?: MouseButton
  clickCount?: number
  /** Modificadores en forma neutra: 'control' | 'shift' | 'alt' | 'meta'. */
  modifiers?: string[]
  /** Sólo para 'mouseWheel': desplazamiento. */
  deltaX?: number
  deltaY?: number
}

export interface KeyOptions {
  modifiers?: string[]
}

export interface Screenshot {
  /** base64 (sin el prefijo data:) */
  data: string
  mediaType: string
}

export interface Transport {
  /**
   * Evalúa una expresión JS en el contexto de la página y devuelve su valor
   * (JSON-serializable). Si la expresión produce una Promesa, se espera.
   */
  eval<T = unknown>(expression: string): Promise<T>

  /** Despacha un evento de mouse en coordenadas de viewport (px CSS). */
  mouse(type: MouseEventType, x: number, y: number, opts?: MouseOptions): Promise<void>

  /** Despacha un evento de teclado con un keyCode ya traducido al backend. */
  key(type: KeyEventType, keyCode: string, opts?: KeyOptions): Promise<void>

  /** Captura del viewport. Opcional: sin ella, `page.screenshot()` lanza. */
  screenshot?(): Promise<Screenshot>

  /** Navegación con espera de carga. Opcional: si falta, `goto` cae a location.href. */
  goto?(url: string): Promise<void>
}
