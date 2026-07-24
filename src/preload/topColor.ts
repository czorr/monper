import { ipcRenderer } from 'electron'

/**
 * Avisa al main cuando la página se desplaza (o cambia de tamaño), para que vuelva a
 * muestrear el color real bajo el topbar. El muestreo se hace en el main capturando
 * los píxeles renderizados: así funciona con gradientes, imágenes y video, que
 * getComputedStyle().backgroundColor no puede ver.
 */
export function setupTopColor(): void {
  let queued = false
  const ping = (): void => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => { queued = false; ipcRenderer.send('page:scrolled') })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ping)
  else ping()
  // capture: también capta el scroll de contenedores internos (SPAs con scroll propio).
  document.addEventListener('scroll', ping, { capture: true, passive: true })
  window.addEventListener('resize', ping)
  window.addEventListener('load', ping)
}
