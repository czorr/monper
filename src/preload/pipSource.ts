import { t as tr } from '../shared/i18n'
import { contextBridge, ipcRenderer } from 'electron'

/**
 * Lado ORIGEN del Picture-in-Picture: la pestaña que reproduce el vídeo.
 *
 * Por qué existe: el PiP de Chromium **no funciona en Electron**. Medido — la promesa de
 * `requestPictureInPicture()` resuelve, `document.pictureInPictureElement` queda puesto… y no
 * se crea ninguna ventana (0 ventanas nuevas, y la de `documentPictureInPicture` mide 0x0).
 * La ventana la dibuja la capa de navegador de Chrome, que Electron no compila. Resultado para
 * el usuario: el vídeo desaparece del reproductor y no aparece en ninguna parte.
 *
 * Así que el PiP es nuestro. El vídeo viaja a una ventana propia por **WebRTC en local**:
 * `captureStream()` del `<video>` y una `RTCPeerConnection` contra la ventana del PiP. No se
 * mueve el elemento de sitio — moverlo es lo que rompe a los reproductores que reposicionan su
 * DOM (YouTube el primero) —, así que la página sigue creyendo que su vídeo está donde estaba.
 *
 * El reparto entre mundos no es capricho:
 * - El **parche** de `requestPictureInPicture` va en el mundo PRINCIPAL, porque es donde la
 *   página lo llama.
 * - El **WebRTC** va en el mundo AISLADO (aquí), que es el único con `ipcRenderer`. Puede
 *   hacerlo porque el DOM sí es común a los dos mundos: lo único aislado es el JS.
 * - Se comunican con un atributo en el elemento y un evento, que es lo que sí cruza.
 */

const MARCA = 'data-titanio-pip'

let pc: RTCPeerConnection | null = null
let videoActual: HTMLVideoElement | null = null

function limpiar(): void {
  if (pc) { try { pc.close() } catch { /* ya cerrada */ } }
  pc = null
  if (videoActual) videoActual.removeAttribute(MARCA)
  videoActual = null
}

/** Arranca la conexión y devuelve la oferta SDP para la ventana del PiP. */
async function abrir(video: HTMLVideoElement): Promise<void> {
  limpiar()
  videoActual = video

  // `captureStream` no está en el tipo estándar de HTMLVideoElement.
  const cap = (video as unknown as { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream })
  const stream = cap.captureStream?.() ?? cap.mozCaptureStream?.()
  if (!stream) {
    console.error('[pip] este vídeo no deja capturar su stream; no se puede abrir el PiP')
    return
  }

  pc = new RTCPeerConnection()
  for (const track of stream.getTracks()) pc.addTrack(track, stream)

  const oferta = await pc.createOffer()
  await pc.setLocalDescription(oferta)
  // Sin esperar al ICE completo la oferta viaja sin candidatos y la conexión no llega a
  // establecerse. En local termina en milisegundos.
  await new Promise<void>((resolve) => {
    if (pc?.iceGatheringState === 'complete') return resolve()
    const p = pc
    if (!p) return resolve()
    p.addEventListener('icegatheringstatechange', () => {
      if (p.iceGatheringState === 'complete') resolve()
    })
    setTimeout(resolve, 1500) // techo: mejor una oferta incompleta que colgarse
  })

  const titulo = document.title || location.hostname
  const respuesta = (await ipcRenderer.invoke('pip:abrir', {
    sdp: JSON.stringify(pc.localDescription),
    origen: location.origin,
    titulo,
    pausado: video.paused
  })) as string | null

  if (!respuesta) { limpiar(); return } // el PiP está desactivado o no se pudo abrir
  await pc.setRemoteDescription(JSON.parse(respuesta) as RTCSessionDescriptionInit)
}

export function setupPipSource(): void {
  // La ventana del PiP manda de vuelta las órdenes de sus controles.
  ipcRenderer.on('pip:comando', (_e, cmd: string) => {
    const v = videoActual
    if (!v) return
    if (cmd === 'play') void v.play()
    else if (cmd === 'pause') v.pause()
    else if (cmd === 'cerrar') limpiar()
  })

  document.addEventListener('titanio:pip', () => {
    const v = document.querySelector<HTMLVideoElement>(`video[${MARCA}]`)
    if (v) void abrir(v)
  })

  // La página (o el auto-PiP al volver a la pestaña) pide salir: se cierra la ventana.
  document.addEventListener('titanio:pip-salir', () => {
    if (!pc) return
    limpiar()
    ipcRenderer.send('pip:cerrar')
  })

  // Si la página se va, el PiP no puede seguir: su stream muere con ella.
  window.addEventListener('pagehide', () => { if (pc) { limpiar(); ipcRenderer.send('pip:cerrar') } })

  /**
   * El parche, en el mundo principal.
   *
   * Se devuelve un objeto con la forma de `PictureInPictureWindow` para que un sitio que lea
   * `width`/`height` o escuche `resize` no reviente. No se llama al original: sabemos que no
   * abre ventana, y llamarlo dejaría a la página creyendo que hay un PiP nativo además del
   * nuestro.
   */
  // La ventana se cerró por su cuenta (botón X, o el main la cerró): el mundo principal tiene
  // que enterarse, o `document.pictureInPictureElement` se quedaría mintiendo.
  ipcRenderer.on('pip:comando', (_e, cmd: string) => {
    if (cmd === 'cerrar') document.dispatchEvent(new CustomEvent('titanio:pip-cerrado'))
  })

  contextBridge.executeInMainWorld({
    func: (marca: string) => {
      const proto = HTMLVideoElement.prototype as unknown as {
        requestPictureInPicture?: () => Promise<unknown>
      }
      if (!proto.requestPictureInPicture) return

      /**
       * `document.pictureInPictureElement` se mantiene coherente a mano.
       *
       * No es cosmética: el PiP automático del main decide con ese valor si entrar o salir
       * (`if (document.pictureInPictureElement) …`). Como no llamamos al PiP nativo, nadie lo
       * rellenaría, y al volver a la pestaña la ventana se quedaría flotando para siempre.
       */
      let actual: HTMLVideoElement | null = null
      try {
        Object.defineProperty(document, 'pictureInPictureElement', {
          get: () => actual,
          configurable: true
        })
      } catch (e) {
        console.warn('[titanio] no se pudo reflejar pictureInPictureElement:', e)
      }
      document.addEventListener('titanio:pip-cerrado', () => { actual = null })

      proto.requestPictureInPicture = function (this: HTMLVideoElement): Promise<unknown> {
        try {
          this.setAttribute(marca, '1')
          actual = this
          document.dispatchEvent(new CustomEvent('titanio:pip'))
        } catch (e) {
          console.warn('[titanio] no se pudo abrir el picture-in-picture:', e)
          return Promise.reject(new DOMException(tr("No se pudo abrir el PiP"), 'NotAllowedError'))
        }
        const falso = document.createElement('div')
        Object.defineProperty(falso, 'width', { get: () => 320 })
        Object.defineProperty(falso, 'height', { get: () => 180 })
        return Promise.resolve(falso)
      }

      // Y la salida, por lo mismo: `exitPictureInPicture` es lo que llama el auto-PiP al
      // volver a la pestaña. Sin parchearla, cerraría un PiP nativo que no existe.
      const doc = document as unknown as { exitPictureInPicture?: () => Promise<void> }
      doc.exitPictureInPicture = function (): Promise<void> {
        actual = null
        document.dispatchEvent(new CustomEvent('titanio:pip-salir'))
        return Promise.resolve()
      }
    },
    args: [MARCA]
  })
}
