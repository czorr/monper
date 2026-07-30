# Picture-in-Picture

El PiP de Monper es **nuestro**, de arriba abajo. No porque quisiéramos reinventarlo: es que el
de Chromium no existe aquí.

## Lo medido: el PiP nativo está roto en Electron

En las condiciones exactas de una pestaña de Monper (`WebContentsView`, `sandbox`, nuestro
preload):

| | `video.requestPictureInPicture()` | `documentPictureInPicture` |
|---|---|---|
| La promesa | **resuelve OK** (356×200) | **resuelve OK** |
| `document.pictureInPictureElement` | **true** | — |
| **Ventanas creadas** | **0** | **0** |
| Tamaño real | — | **0×0** |

Chromium acepta la petición, el DOM jura que el vídeo está en PiP y **no hay ninguna ventana**.
La ventana la dibuja `chrome/browser/picture_in_picture/`, que Electron no compila: Blink pide
al embedder que abra la ventana (`WebContentsDelegate::EnterPictureInPicture`) y Electron no
implementa ese hook.

Lo que veía el usuario: al pulsar el PiP de YouTube el vídeo desaparecía del reproductor y no
aparecía en ningún sitio.

Dos cosas que se comprobaron antes de rendirse: **no es un feature flag** (probado con
`DocumentPictureInPictureAPI`, `PictureInPicture`, `AutoPictureInPictureVideoHeuristics`,
`DocumentPictureInPictureReparenting`: mismo resultado, 0 ventanas), y arreglarlo de verdad
significaría parchear y compilar Electron desde fuente — y mantener ese fork en cada versión.

Y una trampa de método: la **primera** medición dijo "funciona", porque solo comprobó que la
promesa resolviera. Resolver y existir no son lo mismo; ahí estaba todo el bug.

## Cómo funciona el nuestro

```
pestaña (video)  --captureStream--> RTCPeerConnection --WebRTC local--> ventana PiP
       ^                                                                    |
       +---------------- comandos (play/pause/cerrar) por IPC --------------+
```

- **El vídeo NUNCA pasa por el main.** Va directo de renderer a renderer por WebRTC; por IPC
  solo cruzan el SDP y los comandos de los botones.
- **El `<video>` NO se mueve de la página.** Mover el elemento es lo que rompe a los
  reproductores que reposicionan su DOM (YouTube el primero). Se copia su stream y la página
  no se entera.
- **Audio incluido**: `captureStream()` se lleva todas las pistas.

### El reparto entre mundos no es capricho

- El **parche** de `requestPictureInPicture` va en el mundo PRINCIPAL, que es donde la página
  lo llama (vía `contextBridge.executeInMainWorld`).
- El **WebRTC** va en el mundo AISLADO, el único con `ipcRenderer`. Puede hacerlo porque **el
  DOM sí es común** a los dos mundos: lo aislado es el JS, no los nodos.
- Se comunican con un atributo en el elemento (`data-monper-pip`) más un evento: es lo que
  cruza sin problemas.

El parche devuelve un objeto con forma de `PictureInPictureWindow` para que un sitio que lea
`width`/`height` no reviente, y **no** llama al original: sabemos que no abre ventana, y
llamarlo dejaría a la página creyendo que hay un PiP nativo además del nuestro.

## Trampas

- **Esperar al ICE.** Sin esperar a `iceGatheringState === 'complete'`, la oferta viaja sin
  candidatos y la conexión no llega a establecerse. Hay techo de 1,5 s por si se atasca: mejor
  una oferta incompleta que colgarse.
- **La carrera del renderer.** El main no manda la oferta hasta que la ventana avisa por
  `pip:listo`. Mandarla al crear la ventana la perdería antes de que React monte — la misma
  carrera que los popovers.
- **`alwaysOnTop` con nivel `'screen-saver'`**, no el de por defecto: `'floating'` queda por
  debajo de una app en pantalla completa, que es justo cuando más falta hace ver el vídeo.
- **Ventana sin marco y transparente.** Con marco, macOS pinta su fondo cuadrado por debajo y
  se ven las cuatro puntas fuera del `border-radius`.
- **Pausar en el PiP no basta con pausar el `<video>` local**: es un espejo del stream, así
  que congelaría la imagen y el original seguiría. Manda siempre el vídeo de la pestaña.

## Superficie

| Dónde | Qué |
|---|---|
| `src/preload/pipSource.ts` | Origen: parche + captura + `RTCPeerConnection` |
| `src/main/pip.ts` | Ventana, relay de SDP y comandos, estado on/off |
| `src/renderer/src/pip.tsx` | La ventana: vídeo, controles al hover, origen |
| `userData/pip.json` | `{ enabled }` |
| Settings → General → Vídeo | El interruptor (activo por defecto) |

Limitación conocida: **un PiP a la vez**. Dos vídeos flotando es ruido, no una función.
