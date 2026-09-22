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

  const observePage = (): void => {
    // Las SPAs pueden pintar su contenido y aplicar el tema DESPUÉS de load. Sin este
    // aviso, el color del estado de carga se quedaba hasta el primer scroll del usuario.
    let mutationTimer: ReturnType<typeof setTimeout> | undefined
    const observer = new MutationObserver(() => {
      if (document.hidden || mutationTimer !== undefined) return
      mutationTimer = setTimeout(() => { mutationTimer = undefined; ping() }, 250)
    })
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'data-theme', 'data-color-mode']
    })
    ping()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observePage, { once: true })
  else observePage()
  // capture: también capta el scroll de contenedores internos (SPAs con scroll propio).
  document.addEventListener('scroll', ping, { capture: true, passive: true })
  window.addEventListener('resize', ping)
  window.addEventListener('load', ping)
  // También llegan imágenes y hojas de estilo después del load inicial.
  document.addEventListener('load', ping, true)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ping() })
}
