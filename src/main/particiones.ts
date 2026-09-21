/**
 * Qué sesión de Chromium usa cada ventana.
 *
 * Hasta ahora la partición era una constante (`persist:titanio`) escrita en seis sitios. Deja de
 * serlo porque las dos cosas grandes que vienen —incógnito y perfiles— son en el fondo lo mismo:
 * decidir en qué sesión vive una ventana. Aquí está esa decisión, sola y sin Electron delante,
 * para que se pueda probar sin levantar la app.
 */

export const PARTICION_NORMAL = 'persist:titanio'

/**
 * Sin el prefijo `persist:` la sesión vive SOLO en memoria: cookies, localStorage, IndexedDB,
 * caché e historial de navegación mueren con el proceso, los borre alguien o no.
 *
 * Esto es lo que hace que incógnito sea incógnito. Nuestros JSON (historial, favicons, sesión)
 * también se dejan de escribir, pero eso por sí solo no bastaría: sin partición aparte, la
 * cookie de sesión del banco seguiría ahí mañana.
 *
 * Es UNA sola para todas las ventanas de incógnito, igual que en Chrome: si cada ventana tuviera
 * la suya, iniciar sesión en un sitio y abrirlo en otra ventana de incógnito pediría el login
 * otra vez, que no es lo que nadie espera.
 */
export const PARTICION_INCOGNITO = 'titanio-incognito'

/**
 * `normal` es la partición del perfil activo (ver perfiles.ts): se pasa en vez de leerse aquí
 * para que este módulo siga sin depender de nada y se pueda probar solo.
 */
export function particionDe(incognito: boolean, normal: string = PARTICION_NORMAL): string {
  return incognito ? PARTICION_INCOGNITO : normal
}

/** ¿Esta partición sobrevive al cierre de la app? */
export function esPersistente(particion: string): boolean {
  return particion.startsWith('persist:')
}
