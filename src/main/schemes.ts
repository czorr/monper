import { shell } from 'electron'

/**
 * Esquemas que no son web: `mailto:`, `tel:`, `zoommtg:`…
 *
 * Un `WebContentsView` no sabe qué hacer con ellos: la navegación falla y el enlace **no hace
 * nada**. Escribir un correo desde una web, llamar desde una ficha de contacto o abrir un
 * enlace de Zoom era imposible, y sin ningún error que lo explicara.
 *
 * Lo correcto es dárselos al sistema, que ya sabe quién los maneja. Pero `shell.openExternal`
 * con lo que venga de una página es un agujero conocido: hay esquemas que ejecutan cosas
 * (`ms-msdt:` en Windows, `file:` en cualquier sitio), y una web hostil solo necesita un
 * `location.href` para dispararlos. Por eso esto es una **lista blanca**, no un filtro de
 * peligrosos: lo que no se conoce, no se abre.
 */

/**
 * Lo que sí se le pasa al sistema.
 *
 * Criterio para añadir: que el esquema PIDA algo (abrir una app, componer un mensaje) y no
 * que EJECUTE algo. Ante la duda, se queda fuera — el coste de omitir uno es que un enlace no
 * funcione; el de colar el equivocado es ejecución arbitraria.
 */
const PERMITIDOS = new Set([
  'mailto', 'tel', 'sms', 'facetime', 'facetime-audio', 'imessage',
  'webcal', 'maps', 'msteams', 'zoommtg', 'slack', 'spotify', 'itms-apps', 'tg'
])

/**
 * Nunca, ni siquiera si alguien los añade arriba por descuido.
 *
 * `file:` daría a una web acceso a tu disco a través del visor del sistema; `javascript:` es
 * ejecución directa; `chrome:`/`devtools:` son superficie interna del navegador.
 */
const PROHIBIDOS = new Set(['file', 'javascript', 'chrome', 'devtools', 'chrome-extension', 'about', 'blob', 'data'])

export function esquemaDe(url: string): string {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(url.trim())
  return m ? m[1]!.toLowerCase() : ''
}

/** ¿Es una URL que el propio navegador debe cargar? */
export function esWeb(url: string): boolean {
  const e = esquemaDe(url)
  return e === 'http' || e === 'https'
}

/**
 * Intenta abrirlo con el sistema. Devuelve true si se hizo cargo.
 *
 * Que devuelva false significa "esto no lo abre nadie": quien llame debe **bloquear** la
 * navegación, no dejarla seguir.
 */
export function abrirConElSistema(url: string): boolean {
  const e = esquemaDe(url)
  if (!e || esWeb(url)) return false
  if (PROHIBIDOS.has(e) || !PERMITIDOS.has(e)) {
    // Nunca en silencio: un enlace que no hace nada es de las cosas más difíciles de depurar
    // desde fuera, y esta línea es la que lo explica.
    console.warn(`[esquemas] bloqueado "${e}:" — no está en la lista blanca (${url.slice(0, 80)})`)
    return false
  }
  // `openExternal` es asíncrono y puede fallar (no hay app para ese esquema): se dice.
  void shell.openExternal(url).catch((err) => {
    console.error(`[esquemas] el sistema no pudo abrir "${e}:":`, err instanceof Error ? err.message : err)
  })
  return true
}
