# Por qué Monper dice ser Chrome (y dónde lo dice)

Google bloquea el inicio de sesión con **"This browser or app may not be secure"** cuando cree
que estás en un navegador embebido. Y lo creía. Sin login de Google no hay Gmail, ni Drive, ni
los cientos de sitios con "Continuar con Google": para un navegador cuyo argumento es *tu web
logueada*, eso no es un detalle, es el producto.

Presentarse como Chrome no es una fanfarronada: es lo que hacen Brave, Vivaldi y Arc, por el
mismo motivo.

## La identidad vive en TRES sitios, y tienen que decir lo mismo

`ses.setUserAgent()` arregla **uno**. Los otros dos se rellenan solos, con Chromium, y son los
que delataban:

| Fuente | Dónde se corrige |
|---|---|
| Cabecera `User-Agent` | `index.ts` (ya estaba) |
| Cabecera `Sec-CH-UA` (Client Hints) | [`main/chromehints.ts`](../src/main/chromehints.ts) |
| `navigator.userAgentData` y `window.chrome` | [`preload/chromeIdentity.ts`](../src/preload/chromeIdentity.ts) |

La lista de marcas sale de [`shared/chrome.ts`](../src/shared/chrome.ts) **para las tres**. No
es una manía de reutilizar código: si el header dice una cosa y el JS otra, la incoherencia
delata más que la marca que faltaba, porque ningún navegador real la produce.

## Lo medido (Electron 43 / Chromium 150)

Antes:

```
navigator.userAgentData.brands → [Not;A=Brand v8, Chromium v150]     ← sin "Google Chrome"
window.chrome                  → {} (existe, vacío)
```

Después, y coincidiendo con la cabecera:

```
[Not;A=Brand v24, Chromium v150, Google Chrome v150]
window.chrome → { app, csi, loadTimes }
```

## La trampa que costó dos intentos

```js
navigator.userAgentData === navigator.userAgentData   // false
```

**Cada acceso devuelve una instancia nueva.** `Object.defineProperty` sobre
`navigator.userAgentData` no lanza, deja el descriptor puesto, se puede leer de vuelta y
*parece* que funciona — pero la página lee otro objeto y ve la lista vieja. Hay que parchear
**`NavigatorUAData.prototype`**, donde vive el getter (y es `configurable`).

Segunda trampa del mismo intento: el `catch` estaba vacío. Como el `defineProperty` no lanzaba,
no había ni error que ver; solo el resultado equivocado. Por eso ahora los dos `catch` avisan.

## Reglas al tocar esto

- **La cabecera se reescribe, nunca se añade.** Si `Sec-CH-UA` no venía, es que Chromium
  decidió no mandarla (contexto inseguro, tipo de petición); ponerla crearía una anomalía que
  Chrome no produce — una señal nueva, justo lo contrario del objetivo. Igual con
  `sec-ch-ua-full-version-list`: solo si el sitio la pidió por `Accept-CH`.
- **Un listener por sesión y evento.** `chromehints.ts` usa `onBeforeSendHeaders`; el
  adblocker usa `onBeforeRequest` y `onHeadersReceived`. Registrar otro del mismo tipo anula
  el anterior sin avisar (ver [adblock.md](adblock.md)).
- **No se toca `chrome.runtime`.** Es la superficie de extensiones; fingirla rompería a quien
  la use de verdad. Solo se rellena lo inocuo (`app`, `csi`, `loadTimes`).
- **La función de `executeInMainWorld` se serializa**: no puede cerrar sobre nada del módulo.
  Todo lo que necesite entra por `args`.

## Lo que esto NO es

No es una solución permanente. Google añade señales cuando quiere, y este arreglo tapa las que
se pudieron medir en su momento; puede haber otras del lado del servidor que no se ven desde
aquí. Si un día vuelve el mensaje, el primer paso es **volver a medir** (el harness está en la
sesión que lo escribió: servidor local + Electron con el preload real, comparando cabecera
contra JS), no adivinar qué señal nueva han metido.

Lo cubre `tests/identidad-chrome.spec.ts`, porque esto se rompe en silencio: nadie ve un error,
simplemente un día no se puede entrar en el correo.
