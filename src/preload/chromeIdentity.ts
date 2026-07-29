import { contextBridge } from 'electron'
import { chromeBrands, chromeFullVersionBrands, majorOf, type Brand } from '../shared/chrome'

/**
 * La otra mitad de la identidad de Chrome: la que se ve desde JavaScript.
 *
 * `chromehints.ts` (main) arregla la cabecera `Sec-CH-UA`, pero un sitio puede preguntar lo
 * mismo desde la página con `navigator.userAgentData`, y ahí Electron seguía respondiendo
 * `[Not;A=Brand, Chromium]` — sin `Google Chrome`. Medido: eso, junto con un `window.chrome`
 * vacío, es lo que hace saltar el "This browser or app may not be secure" de Google.
 *
 * **Corre en el MUNDO PRINCIPAL, no en el aislado.** Un preload con `contextIsolation` vive
 * en otro contexto: lo que redefina ahí no lo ve la página. Por eso va con
 * `contextBridge.executeInMainWorld`, que es la vía soportada para tocar los globals reales
 * sin desactivar el aislamiento (desactivarlo daría acceso a nuestro preload a cualquier
 * web: exactamente lo contrario de lo que este producto promete).
 *
 * La función se **serializa** para cruzar de mundo: no puede cerrar sobre nada de este
 * módulo. De ahí que las marcas se le pasen por `args` ya calculadas, y no importadas dentro.
 */

interface DatosIdentidad {
  brands: Brand[]
  fullVersionList: Brand[]
  platform: string
}

export function setupChromeIdentity(): void {
  const version = process.versions.chrome
  if (!version) return // sin Chromium debajo no hay nada que alinear

  const platform =
    process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux'

  contextBridge.executeInMainWorld({
    func: (datos: DatosIdentidad) => {
      /**
       * Se parchea el PROTOTIPO, no `navigator.userAgentData`.
       *
       * Medido: `navigator.userAgentData === navigator.userAgentData` es **false** — cada
       * acceso devuelve una instancia nueva. Parchear la instancia parecía funcionar (no
       * lanza, el descriptor existe) y no servía de nada: la página lee otro objeto. El
       * getter vive en `NavigatorUAData.prototype`, es configurable, y ahí sí lo ven todas.
       */
      const Ctor = (window as unknown as { NavigatorUAData?: { prototype: object } }).NavigatorUAData
      if (Ctor?.prototype) {
        try {
          Object.defineProperty(Ctor.prototype, 'brands', {
            get: () => datos.brands.map((b) => ({ ...b })),
            configurable: true
          })
          // getHighEntropyValues es otra vía para lo mismo: si se deja sin tocar devuelve la
          // lista vieja y contradice a `brands`, que es justo la incoherencia a evitar.
          const proto = Ctor.prototype as {
            getHighEntropyValues?: (h: string[]) => Promise<Record<string, unknown>>
          }
          const original = proto.getHighEntropyValues
          if (typeof original === 'function') {
            Object.defineProperty(Ctor.prototype, 'getHighEntropyValues', {
              value: function (this: object, hints: string[]): Promise<Record<string, unknown>> {
                return original.call(this, hints).then((r) => {
                  const out = { ...r }
                  // Solo se reescribe lo que el sitio pidió: añadir claves que no se
                  // solicitaron sería una diferencia observable respecto a Chrome.
                  if ('brands' in out) out.brands = datos.brands.map((b) => ({ ...b }))
                  if ('fullVersionList' in out) {
                    out.fullVersionList = datos.fullVersionList.map((b) => ({ ...b }))
                  }
                  return out
                })
              },
              configurable: true,
              writable: true
            })
          }
        } catch (e) {
          // Callarlo dejaría a Monper anunciándose como Chromium sin que nadie se entere:
          // el login de Google fallaría y el motivo estaría escondido.
          console.warn('[monper] no se pudo alinear navigator.userAgentData:', e)
        }
      }

      // `window.chrome` existe en Electron pero VACÍO, y comprobar sus propiedades es la
      // detección clásica de una línea. Se rellena con lo que Chrome expone y es inocuo:
      // dos funciones de métricas de carga y el objeto `app`. No se toca `chrome.runtime`
      // (es la superficie de extensiones y fingirla rompería a quien la use de verdad).
      try {
        const w = window as unknown as { chrome?: Record<string, unknown> }
        const c = (w.chrome ||= {})
        if (!('app' in c)) c.app = { isInstalled: false }
        if (!('csi' in c)) c.csi = function () { return {} }
        if (!('loadTimes' in c)) c.loadTimes = function () { return {} }
      } catch (e) {
        console.warn('[monper] no se pudo completar window.chrome:', e)
      }
    },
    args: [
      {
        brands: chromeBrands(majorOf(version)),
        fullVersionList: chromeFullVersionBrands(version),
        platform
      } satisfies DatosIdentidad
    ]
  })
}
