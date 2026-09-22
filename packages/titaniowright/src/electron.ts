import type { WebContents } from 'electron'
import type { Transport, MouseEventType, KeyEventType, MouseOptions, KeyOptions, Screenshot } from './transport'
import { Page, type PageOptions } from './page'

/**
 * Adaptador para Electron: implementa el Transport sobre un `WebContents`,
 * reusando `executeJavaScript` + `sendInputEvent` + `capturePage`. Es el mismo
 * mecanismo probado del agente de Titanio, ahora detrás de la API Playwright-like.
 */
export function createElectronTransport(wc: WebContents): Transport {
  return {
    eval<T>(expression: string): Promise<T> {
      // userGesture=true: permite acciones que requieren interacción del usuario.
      return wc.executeJavaScript(expression, true) as Promise<T>
    },

    async mouse(type: MouseEventType, x: number, y: number, opts: MouseOptions = {}): Promise<void> {
      if (type === 'mouseWheel') {
        wc.sendInputEvent({
          type: 'mouseWheel',
          x,
          y,
          deltaX: opts.deltaX ?? 0,
          deltaY: opts.deltaY ?? 0
        } as Parameters<WebContents['sendInputEvent']>[0])
        return
      }
      wc.sendInputEvent({
        type,
        x,
        y,
        button: opts.button ?? 'left',
        clickCount: opts.clickCount ?? 1,
        modifiers: opts.modifiers
      } as Parameters<WebContents['sendInputEvent']>[0])
    },

    async key(type: KeyEventType, keyCode: string, opts: KeyOptions = {}): Promise<void> {
      wc.sendInputEvent({
        type,
        keyCode,
        modifiers: opts.modifiers
      } as Parameters<WebContents['sendInputEvent']>[0])
    },

    async screenshot(): Promise<Screenshot> {
      const img = await wc.capturePage()
      return { data: img.toPNG().toString('base64'), mediaType: 'image/png' }
    },

    async goto(url: string): Promise<void> {
      await wc.loadURL(url)
    }
  }
}

/** Crea una `Page` automatizable a partir de un `WebContents` de Electron. */
export function pageFromWebContents(wc: WebContents, opts?: PageOptions): Page {
  return new Page(createElectronTransport(wc), opts)
}
