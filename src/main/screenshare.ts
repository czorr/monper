import { desktopCapturer, dialog, systemPreferences, shell, type BrowserWindow, type Session } from 'electron'

/**
 * Compartir pantalla en videollamadas (`navigator.mediaDevices.getDisplayMedia`).
 *
 * **Sin esto no funciona en absoluto.** Electron no trae comportamiento por defecto para
 * `getDisplayMedia`: si nadie registra un `setDisplayMediaRequestHandler`, la petición se
 * rechaza y el sitio se queda esperando. En Meet, Zoom web o Slack huddles el botón de
 * compartir no hacía nada — y no había ni un error en consola que lo explicara.
 *
 * Dos caminos, en este orden:
 *
 * 1. **El selector del sistema** (`useSystemPicker`), en macOS 15+. Es el mejor con
 *    diferencia: es la UI que el usuario ya conoce de todas las demás apps, y **la gestiona
 *    macOS**, incluido el permiso de grabación de pantalla. Cuando está disponible, nuestro
 *    handler ni se llama.
 * 2. **Nuestro selector**, para cuando no lo está. No hay UI de Electron para esto, y un
 *    modal en el DOM no serviría: la vista de la página se dibuja por encima del chrome
 *    (ver docs/popovers.md). Así que va por diálogo nativo.
 *
 * Y el permiso de macOS se comprueba ANTES de ofrecer nada: sin él, `desktopCapturer` sigue
 * devolviendo pantallas y el vídeo sale en negro. El usuario vería "compartiendo" y sus
 * compañeros un rectángulo vacío. Eso es peor que un error.
 */

/** Cuántas fuentes ofrece el diálogo de respaldo. Un `showMessageBox` con 30 botones no es UI. */
const MAX_FUENTES = 8

function permisoDePantalla(): ReturnType<typeof systemPreferences.getMediaAccessStatus> | 'unknown' {
  if (process.platform !== 'darwin') return 'granted' // solo macOS tiene este TCC
  try {
    return systemPreferences.getMediaAccessStatus('screen')
  } catch {
    return 'unknown'
  }
}

/**
 * Avisa si macOS no nos deja grabar la pantalla, y lleva al panel correcto.
 *
 * Devuelve true si se puede seguir. `not-determined` sí sigue: el propio intento de captura
 * es lo que dispara la petición del sistema.
 */
async function permisoOk(padre: BrowserWindow | null): Promise<boolean> {
  const estado = permisoDePantalla()
  if (estado !== 'denied' && estado !== 'restricted') return true

  const { response } = await dialog.showMessageBox(padre ?? undefined!, {
    type: 'warning',
    message: 'macOS no deja que Titanio grabe la pantalla',
    detail:
      'Sin ese permiso se puede elegir una ventana, pero los demás verían un rectángulo en negro.\n\n' +
      'Actívalo en Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla, y reinicia Titanio.',
    buttons: ['Cancelar', 'Abrir Ajustes'],
    defaultId: 1,
    cancelId: 0,
    noLink: true
  })
  if (response === 1) {
    void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
  }
  return false
}

/** Selector de respaldo: diálogo nativo con las pantallas y ventanas disponibles. */
async function elegirFuente(padre: BrowserWindow | null): Promise<Electron.DesktopCapturerSource | null> {
  const fuentes = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    fetchWindowIcons: false,
    thumbnailSize: { width: 0, height: 0 } // no hacen falta miniaturas para un diálogo de texto
  })
  if (!fuentes.length) return null

  // Las pantallas primero: es lo que la gente comparte el 90% de las veces.
  const orden = [
    ...fuentes.filter((f) => f.id.startsWith('screen:')),
    ...fuentes.filter((f) => !f.id.startsWith('screen:'))
  ].slice(0, MAX_FUENTES)

  const botones = [...orden.map((f) => f.name.slice(0, 60)), 'Cancelar']
  const { response } = await dialog.showMessageBox(padre ?? undefined!, {
    type: 'none',
    message: '¿Qué quieres compartir?',
    detail: fuentes.length > MAX_FUENTES ? `Se muestran ${MAX_FUENTES} de ${fuentes.length} fuentes.` : undefined,
    buttons: botones,
    cancelId: botones.length - 1,
    noLink: true
  })
  return orden[response] ?? null
}

export function attachScreenShare(ses: Session, getWindow: () => BrowserWindow | null): void {
  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      // A este handler solo se llega si NO hubo selector del sistema.
      if (!(await permisoOk(getWindow()))) {
        // Cancelar es un `callback({})`: sin esto la promesa del sitio queda colgada para
        // siempre y la llamada se queda con el botón girando.
        callback({})
        return
      }
      try {
        const fuente = await elegirFuente(getWindow())
        if (!fuente) { callback({}); return }
        callback({ video: fuente })
      } catch (e) {
        console.error('[pantalla] no se pudo listar lo que se puede compartir:', e instanceof Error ? e.message : e)
        callback({})
      }
    },
    // macOS 15+: lo gestiona el sistema y el handler de arriba no se invoca.
    { useSystemPicker: true }
  )
}
