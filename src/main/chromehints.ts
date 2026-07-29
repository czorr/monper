import type { Session } from 'electron'
import { brandsToHeader, chromeBrands, chromeFullVersionBrands, majorOf } from '../shared/chrome'

/**
 * Client Hints coherentes con la UA que ya declaramos.
 *
 * `ses.setUserAgent` arregla la cabecera `User-Agent`, pero **no toca `Sec-CH-UA`**, que es
 * una fuente aparte y la que Chromium rellena por su cuenta con `"Chromium"` y sin
 * `"Google Chrome"`. Google lee esa lista: de ahí el "This browser or app may not be secure"
 * que impide iniciar sesión.
 *
 * Ver `shared/chrome.ts` para la lista de marcas — es la MISMA que expone el preload en
 * `navigator.userAgentData`, y tienen que seguir siéndolo.
 */

/**
 * Se reescribe, nunca se añade.
 *
 * Si la cabecera no venía, es que Chromium decidió no mandarla (contexto inseguro, petición
 * que no la lleva); ponerla ahí crearía una anomalía que un Chrome real no produce — o sea,
 * una señal nueva justo de lo que se intenta evitar. Solo se corrige lo que ya viajaba.
 */
function reescribir(headers: Record<string, string>, nombre: string, valor: string): void {
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === nombre) { headers[k] = valor; return }
  }
}

function tiene(headers: Record<string, string>, nombre: string): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === nombre)
}

export function attachChromeHints(ses: Session, chromeVersion: string): void {
  const major = majorOf(chromeVersion)
  const secChUa = brandsToHeader(chromeBrands(major))
  const secChUaFull = brandsToHeader(chromeFullVersionBrands(chromeVersion))

  // OJO: un solo listener por sesión y evento. El adblocker usa onBeforeRequest y
  // onHeadersReceived; este es onBeforeSendHeaders, que estaba libre. Si algún día hace
  // falta otro, hay que encadenarlo AQUÍ y no registrarlo aparte, o uno anula al otro.
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders
    if (tiene(headers, 'sec-ch-ua')) reescribir(headers, 'sec-ch-ua', secChUa)
    // Solo llega si el sitio la pidió por Accept-CH; si no la pide, no se inventa.
    if (tiene(headers, 'sec-ch-ua-full-version-list')) {
      reescribir(headers, 'sec-ch-ua-full-version-list', secChUaFull)
    }
    callback({ requestHeaders: headers })
  })
}
