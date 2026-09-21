# Titanio — Endurecimiento para ser un browser confiable y optimizado

Auditoría de lo que falta para pasar de "prototipo que funciona" a navegador
confiable. Verificado contra el código (no hay manejo de crashes, errores de red,
certificados, ni descartes de tabs). Lo tachado ya está hecho.

Prioridad: **P0** bloquea "confiable" · **P1** importante · **P2** esperado/pulido.

---

## P0 — Confiabilidad (una página rota no debe romper la experiencia)

1. **Crash del renderer** — `webContents.on('render-process-gone')`. Hoy: la
   pestaña queda **en blanco/gris** para siempre. Falta: UI "Esta página se cerró
   inesperadamente" + botón Recargar (página interna `error.html`).
2. **Páginas de error de red** — `did-fail-load` (offline, DNS, conexión
   rechazada, timeout). Hoy: **blanco**. Falta: interstitial con el código de
   error y Reintentar. Distinguir `errorCode` (−106 offline, −105 DNS, etc.).
3. **Errores de certificado** — HECHO. Chromium rechaza el certificado, salta
   `did-fail-load` con un código de −200 a −219 y `error.html` pinta "Tu conexión
   no es privada". **No hay forma de saltárselo, y es a propósito**: Titanio guarda
   contraseñas y las rellena solo, así que dejar pasar un certificado sospechoso es
   justo cómo se roban credenciales. Verificado con un HTTPS autofirmado de verdad
   (`tests/certificado.spec.ts`), no comprobando el mapeo de códigos a mano.
4. **Página no responde** — HECHO, pero **no con `unresponsive`**: ese evento de
   Electron **no dispara nunca** en un `WebContentsView`. Medido con un bucle de 30 s
   y clics inyectados: cero eventos en 16 s. La primera implementación fue código
   muerto y se tiró.
   La detección es propia: se le pide a la página que evalúe algo trivial y se mira si
   contesta; un hilo bloqueado no puede responder, que es la definición de colgada.
   Coste acotado —solo la pestaña activa, solo con la ventana a la vista, un eval cada
   8 s— porque este repo ya tiró 344MB de pre-warm por menos.
   La guarda es VISIBLE, no enfocada: dos ventanas lado a lado se están mirando las
   dos, y exigir foco dejaba el aviso sin salir en la mitad de los casos reales.

> Sin esto, cualquier caída de red o pestaña que crashea deja al usuario con una
> vista muerta y sin feedback. Es lo primero.

## P0 — Seguridad (hoy es permisiva de más)

5. ~~**Permisos auto-concedidos.**~~ **Hecho.** `permissions.ts` pregunta con un diálogo
   nativo por origen y recuerda la decisión en `permissions.json`. Ver más abajo.
6. ~~**Navegaciones peligrosas** desde contenido web.~~ **Hecho** junto con el soporte de
   `mailto:`/`tel:`: ver abajo. `will-navigate` valida el esquema y `file:`, `javascript:` y
   cualquier desconocido se bloquean.

## P1 — Sesión y datos (lo que se espera "de un browser")

7. **Restaurar pestañas al reabrir.** Hoy solo persistimos tamaño/posición de
   ventana. Falta: guardar las URLs abiertas + activa y restaurarlas al arrancar
   (con las agent tabs excluidas o marcadas).
8. **Reabrir pestaña cerrada (⌘⇧T)** — pila de cerradas recientes.
9. **Gestor de descargas real.** Hoy `will-download` solo notifica al agente y
   "Downloads" abre la carpeta. Falta: progreso, cancelar/pausar, ubicación,
   lista, y confirmación para ejecutables (regla de seguridad).
10. **Historial navegable.** Registramos visitas para el autocomplete pero no hay
    página/menú de historial.

## P2 — Rendimiento / escala

11. **Descartar tabs en segundo plano.** El modelo actual mantiene **todas** las
    vistas vivas y compuestas (para cambio instantáneo). Con muchas pestañas eso
    es RAM + CPU lineales. Falta: *warm set* LRU (mantener vivas las últimas N,
    ocultar el resto) y **descartar/dormir** tabs inactivas tras X min
    (recargarlas al volver). Es la contraparte pendiente de la optimización de
    switch instantáneo.
12. **Cache de favicons.** `BookmarkRow` pega al servicio de Google en cada
    render; cachear a disco/memoria y preferir el favicon real de la página.
13. **Límite/telemetría de procesos.** Cada WebContentsView es un proceso;
    medir memoria y considerar reúso cuando el warm set esté hecho.

## P2 — UX esperado

14. **Buscar en página (⌘F)** — `webContents.findInPage`.
15. **Zoom por sitio (⌘+ / ⌘− / ⌘0)** — `setZoomLevel`, recordar por origen.
16. **Menú contextual del contenido** (click derecho en la página): copiar/pegar,
    atrás/adelante, "Inspeccionar elemento", copiar dirección de enlace/imagen.
    Hoy no existe (solo el de las tabs).
17. **Indicador de progreso de carga** (barra fina en el topbar).
18. **⌘1..9** para saltar de pestaña; **reordenar** tabs (drag); abrir la nueva
    pestaña **junto** a la actual, no al final.
19. **Spellcheck** en inputs (`session` webPreferences).

---

## Orden recomendado

1. **P0 confiabilidad** (1–4): páginas de error/crash/cert/no-responde. Máximo
   impacto percibido, evita "vista muerta".
2. ~~**P0 seguridad — permisos** (5)~~ — hecho, con su página en Settings.
3. **P1 sesión** (7–8): restaurar pestañas + reabrir cerrada.
4. **P2 rendimiento — descarte de tabs** (11): acota el costo del keep-alive.
5. **P1 descargas** (9) y **P2 UX** (14–18) en paralelo según prioridad tuya.

Los primeros cuatro puntos convierten a Titanio de "funciona" a "confiable"; el
resto es el pulido que se espera de un navegador diario.


## Favicons: se acabó el servicio de Google

Los marcadores sin icono propio, las sugerencias del omnibox, los pasos del agente y el
prompt de "iniciar sesión con…" pedían el favicon a `google.com/s2/favicons?domain=…`.

Dos problemas, uno visual y otro de fondo:

- **Ese servicio normaliza los iconos**: los devuelve compuestos sobre un fondo opaco. GitHub
  aparecía con un recuadro que en la web no tiene. Fue el síntoma por el que se miró.
- **Le mandaba a Google un dominio por cada marcador**, por cada sugerencia del omnibox, por
  cada paso del agente y —lo peor— **por cada sitio donde el usuario guarda contraseñas**.
  En un navegador cuyo argumento es que no filtra lo que haces.

Ahora hay una caché por host en [`src/main/favicons.ts`](../src/main/favicons.ts), alimentada
con el icono real que Chromium ya reporta en `page-favicon-updated`. Si un sitio no se ha
visitado todavía no hay icono y la UI cae a su globo local. **Nunca a un tercero.**

Y **ya no hay marcadores de fábrica**: se quitaron los seis (Gmail, YouTube, GitHub…). Además
de presuponer a qué sitios entra el usuario, eran los que obligaban a inventarles un icono
antes de haber visitado nunca la página.

Para los marcadores que no traen icono (los heredados, de antes de esta caché), se le pregunta
**al propio sitio**: se lee su HTML y se elige su `<link rel="icon">`, con `/favicon.ico` como
respaldo. Una vez por host y por sesión, con timeout.

Cuidado al tocar esa elección: **no vale con coger el primer `rel` que contenga "icon"**.
`fluid-icon` y `mask-icon` también lo contienen y son otra cosa — medido contra los sitios
reales, coger el primero daba el icono de aplicación de GitHub (su logo sobre un cuadrado
oscuro) y la máscara monocroma de Safari en Chess.com. Se puntúa por tipo y gana el de más
resolución:

| Sitio | Antes (primer match) | Ahora |
|---|---|---|
| github.com | `fluidicon.png` (logo sobre cuadrado) | `favicons/favicon.png` |
| chess.com | `safari-pinned-tab.svg` (silueta) | `favicon.ico` |
| youtube.com | `favicon.ico` | `favicon_144x144.png` |


## Control remoto (Developers → Remote debugging)

Deja que un proceso externo conduzca Titanio con los mismos verbos que necesita
`titaniowright` (`goto`, `eval`, `mouse`, `key`, `screenshot`, `tabs`…). Vive en
[`src/main/remote.ts`](../src/main/remote.ts) y **está apagado por defecto**.

### Qué expone de verdad

Conviene decirlo sin eufemismos: con esto encendido, quien tenga el token puede navegar a los
sitios **donde ya tienes sesión abierta** y leer lo que muestren. `goto` a tu correo + `eval`
de `document.body.innerText` es tu correo. Un `screenshot` es tu pantalla. Eso no es un
descuido: es lo que significa controlar un navegador.

Lo que **no** puede: pedir un secreto al vault ni disparar un autofill. Esos caminos siguen
siendo solo del usuario, y ningún verbo los toca.

### Decisiones tomadas

- **Solo `127.0.0.1`.** Escuchar en `0.0.0.0` lo abriría a toda la red local.
- **Token obligatorio** en cabecera (nunca en la URL: acaban en logs e historiales). Sin él, 401.
- **`enabled` NO se persiste.** El token sí, el interruptor no: si se recordara, lo enciendes
  un día para trabajar y al siguiente la app arranca escuchando en silencio.
- **Indicador fijo en el chrome** mientras esté activo, en el mismo hueco que el pill de
  actualización, y clicarlo lo apaga. Nunca debe estar encendido sin verse.
- **No se usa CDP** (`--remote-debugging-port`): solo se puede fijar al arrancar —no habría
  interruptor en caliente— y da acceso total, incluidas las cookies de sesión.

El límite conocido: **el token está en texto plano** en `remote.json`, y en macOS cualquier
app que ejecutes puede leer tu carpeta de usuario. Por eso la protección real es que esté
apagado. El siguiente paso, si esto va a producción, es pedir confirmación con un diálogo
nativo en la primera orden de cada cliente.

Fijado en `security.spec.ts`: arranca apagado, y encendido tiene indicador.

## Permisos: dónde se ven y quién puede tocarlos

`permissions.ts` guarda una decisión por **origen** y clave (`camera`, `microphone`,
`geolocation`, `notifications`, `clipboard`). Sin decisión previa se abre un diálogo nativo;
`granted`/`denied` se recuerdan y `ask` es simplemente su ausencia.

Durante un tiempo un permiso solo se podía ver desde el candado de **su** sitio: para revocar
la cámara de una página había que volver a entrar en ella. Un permiso concedido y olvidado
que no se puede encontrar es el problema, no la pantalla que faltaba. Hoy `allSites()` los
enumera y Settings → Permissions los muestra todos, con "Olvidar" por sitio y para todos.

**"Olvidar" no es "bloquear".** Borra la decisión, así que el sitio vuelve a preguntar. Se
dice en la propia página porque las dos cosas se confunden y la diferencia importa.

Los tres canales (`perms:list`, `perms:set`, `perms:clear`) pasan por `isInternalSender`.
No es teórico: `titanioTab` es el preload de **contenido**, así que existe también en una web
cualquiera. Sin ese filtro, una página podría enumerar dónde has dado la cámara y
concedérsela a sí misma. Lo fija `tests/security.spec.ts` → "una web no puede leer ni cambiar
los permisos de los sitios".

Lo que **no** existe todavía: qué acciones debe confirmar el agente y en qué sitios no puede
entrar. Está en la página dicho como pendiente, no insinuado con un control que no hace nada.

## Compartir pantalla en videollamadas

**Electron no trae comportamiento por defecto para `getDisplayMedia`.** Si nadie registra un
`setDisplayMediaRequestHandler`, la petición se rechaza y el sitio se queda esperando: en Meet,
Zoom web o los huddles de Slack, el botón de compartir **no hacía absolutamente nada**, y sin
un error en consola que lo explicara. Se arregla en
[`src/main/screenshare.ts`](../src/main/screenshare.ts).

Dos caminos, en este orden:

1. **El selector del sistema** (`useSystemPicker: true`), en macOS 15+. Es el mejor: es la UI
   que el usuario ya conoce del resto de apps y **la gestiona macOS**, incluido el permiso.
   Cuando está disponible, nuestro handler ni se llama.
2. **El nuestro**, para cuando no lo está. No hay UI de Electron para esto y un modal en el DOM
   no serviría —la vista de la página se dibuja por encima del chrome, ver
   [popovers.md](popovers.md)—, así que va por diálogo nativo, pantallas primero y con techo de
   fuentes: un `showMessageBox` con 30 botones no es una UI.

**El permiso se comprueba antes de ofrecer nada.** Sin el TCC de grabación de pantalla,
`desktopCapturer` sigue devolviendo pantallas y el vídeo sale en **negro**: el usuario creería
estar compartiendo y sus compañeros verían un rectángulo vacío. Peor que un error. Si está
denegado se dice y se abre el panel correcto de Ajustes.

Y cancelar tiene que llamar a `callback({})`: sin eso la promesa del sitio queda colgada para
siempre y la llamada se queda con el botón girando.

### Entitlements

Compartir pantalla **no** necesita entitlement (solo TCC). Cámara y micrófono **sí**, y no los
teníamos: con `hardenedRuntime: true` los textos de uso del Info.plist no bastan. Añadidos
`com.apple.security.device.camera` y `com.apple.security.device.audio-input`, que habrían
fallado justo al firmar y funcionando bien en desarrollo — el peor momento para descubrirlo.

## Navegador predeterminado

Lo visible es un banner en la new tab y una fila en Settings → General. Lo que de verdad hay
que resolver es **qué pasa cuando otra app te manda un enlace**, y ahí había tres trampas.
Vive en [`src/main/defaultbrowser.ts`](../src/main/defaultbrowser.ts).

1. **Una sola instancia.** Sin `requestSingleInstanceLock`, cada enlace que abras desde Mail o
   Slack lanza un Titanio **nuevo**. Dos instancias sobre el mismo `userData` escriben los
   mismos JSON y la última en guardar gana: **pierdes marcadores y vault**. Es el fallo más
   caro y no se ve hasta que ya pasó. El lock se pide ANTES de crear nada; si no se obtiene, el
   proceso muere sin tocar el perfil.
2. **La URL llega antes de que exista la ventana.** En macOS, abrir un enlace con la app
   cerrada dispara `open-url` **antes** de `ready`. Se encolan y se entregan cuando hay dónde.
3. **Cada plataforma la entrega distinto.** macOS por `open-url`; Windows y Linux en `argv`,
   tanto al arrancar como en `second-instance` — donde además hay que traer la ventana al
   frente, porque el usuario acaba de pedir algo.

**En desarrollo no se ofrece, a propósito.** `electron .` corre dentro de Electron.app, así que
`setAsDefaultProtocolClient` registraría **Electron** como tu navegador: los enlaces acabarían
en un binario de desarrollo que un día borras. `hacerPredeterminado` devuelve el motivo en vez
de fallar mudo, y el banner no aparece.

**El banner no insiste.** No sale si ya lo somos, y si lo descartas no vuelve en un mes. Que un
navegador pregunte esto en cada arranque es lo que hace que la gente odie estos banners.

### Empaquetado

`electron-builder.yml` declara `protocols` con http/https. **Sin eso macOS ni lista a Titanio**
en Ajustes → Escritorio y Dock → Navegador web predeterminado: el sistema solo ofrece apps que
declaran manejar esos esquemas, y `LSSetDefaultHandlerForURLScheme` falla si la app no lo hace.

### Qué está probado

[`tests/defaultbrowser.spec.ts`](../tests/defaultbrowser.spec.ts) simula el `open-url` del
sistema: que abre una pestaña **nueva** (no reemplaza la que había) y queda al frente, que un
esquema que no es web —`file://`, `javascript:`— **no** abre nada, y que en desarrollo no se
ofrece. Lo que no se puede probar aquí es el lock ni el diálogo del sistema: hacen falta dos
procesos y una app firmada.


## Esquemas que no son web (`mailto:`, `tel:`…)

Un `WebContentsView` no sabe navegarlos: la navegación falla y el enlace **no hace nada**, sin
un solo error que lo explique. Escribir un correo desde una web o abrir un enlace de Zoom era
imposible. Vive en [`src/main/schemes.ts`](../src/main/schemes.ts).

Llegan por **tres caminos distintos** y hay que cubrir los tres, cosa que no es obvia:

| Camino | Cuándo |
|---|---|
| `will-navigate` | `<a href="mailto:…">` normal |
| `setWindowOpenHandler` | el mismo enlace con `target="_blank"` — NO pasa por will-navigate |
| `normalizeUrl` | escribirlo en la barra de direcciones |

El tercero era su propio bug: `normalizeUrl` mandaba a Google todo lo que no fuera http(s), así
que teclear `mailto:x@y.com` acababa en una **búsqueda de ese texto**.

### Lista blanca, no filtro de peligrosos

`shell.openExternal` con lo que venga de una página es un agujero conocido: hay esquemas que
**ejecutan** cosas (`ms-msdt:` en Windows) y `file:` daría acceso al disco a través del visor
del sistema. Una web hostil solo necesita un `location.href`.

Por eso `PERMITIDOS` es una lista cerrada. **Criterio para añadir uno: que PIDA algo (componer
un mensaje, abrir una app), no que EJECUTE algo.** Ante la duda se queda fuera — el coste de
omitir un esquema es que un enlace no funcione; el de colar el equivocado es ejecución
arbitraria. `PROHIBIDOS` existe además como red por si alguien añade uno por descuido.

Y la navegación **se cancela siempre**, se abra o no: dejarla seguir deja la pestaña en un
estado roto aunque el sistema sí haya abierto el correo.

Lo fija `tests/schemes.spec.ts`, que sustituye `shell.openExternal` para no abrir Mail en cada
ejecución y comprueba a quién se le pasa y a quién no — que es exactamente la decisión de
seguridad.

## Document PiP: un muro de Electron, no un bug nuestro

El panel flotante de controles de Google Meet es **Document PiP**
(`documentPictureInPicture.requestWindow()`), una API distinta del PiP de un `<video>`. En
Electron 43 no funciona, y no es culpa de cómo montamos las vistas:

| Dónde | Resultado |
|---|---|
| Pestaña (`WebContentsView`) | La API existe; `requestWindow()` rechaza con `Internal error: no window` |
| `BrowserWindow` normal, sobre http local | La promesa **no se resuelve nunca** |
| `data:` URL | La API ni siquiera está definida (no es contexto seguro) |

Medido cinco veces, consistente. **La primera hipótesis fue falsa** y conviene dejarla escrita
para que nadie la repita: se pensó que `about:blank` estaba en la lista de `PROHIBIDOS` de
`schemes.ts` y que el `setWindowOpenHandler` denegaba la ventana. No es eso — la llamada falla
**antes**, dentro de Chromium, sin llegar nunca al handler.

### Lo que se pedía: PiP automático al dejar la pestaña

Lo que el usuario quería no era un botón, era que **saliera solo**: te cambias de pestaña o
minimizas, y el vídeo sigue delante en la ventanita. Se dispara en la transición de `setActive`
—al DEJAR una pestaña— y en `minimize`/`restore`.

Reglas, todas por evitar que moleste:

- **Solo si está reproduciendo.** Sin la condición de `paused`, cada pestaña con un vídeo
  cargado escupiría una ventanita al navegar.
- **Solo uno a la vez**, que es lo que permite el sistema.
- **Al volver a la pestaña, se sale.** Dejarla flotando sobre su propio vídeo sería absurdo.
- `requestPictureInPicture()` exige gesto de usuario: la llamada va con
  `executeJavaScript(codigo, true)`. Cambiar de pestaña *es* un gesto, solo que no ocurre
  dentro de la página.

`MONPER_DEBUG_PIP=1` imprime cada detección y cada entrada/salida. Los fallos se registran
siempre, sin flag.

### Lo otro que faltaba: el menú contextual

El motor soporta PiP de vídeo, pero **no había forma de pedirlo**. Titanio reemplaza el menú
nativo de Chromium por uno propio, y el nativo traía "Picture in picture" de fábrica: al
construir el nuestro se cubrió el caso de la imagen y el del vídeo se quedó fuera. Desde fuera
parecía que Titanio no soportaba PiP; en realidad faltaba el botón.

Dos trampas al implementarlo:

- **`elementFromPoint` no encuentra el vídeo.** En YouTube —y en casi cualquier reproductor— el
  `<video>` está TAPADO por los overlays de controles, así que devuelve un `div`. El plan B es
  el vídeo visible más grande de la página, que en un reproductor es siempre el que se está
  viendo.
- **Hace falta gesto de usuario.** `requestPictureInPicture()` lo exige, así que la llamada va
  con `executeJavaScript(codigo, true)`. Sin eso el navegador la rechaza y el item del menú
  parecería no hacer nada.

El PiP de vídeo sí funciona, y `tests/pip.spec.ts` lo comprueba metiendo un vídeo de verdad en
PiP (no preguntando si la API existe). El test de Document PiP usa `test.fail()`: hoy Playwright
lo informa como "passed" porque falla, y **empezará a dar "failed" el día que Electron lo
soporte** — que es el aviso que queremos.
