# Rendimiento

Medido, no opinado. El banco está en [`tests/perf.spec.ts`](../tests/perf.spec.ts):

```bash
pnpm test:only tests/perf.spec.ts
```

Imprime medianas por consola. **Guarda los números antes de optimizar algo**; si un cambio
no mueve un número, no es una optimización, es una hipótesis.

## Antes / después (Mac del desarrollo, 2026-07-25)

| | Antes | Después |
|---|---|---|
| Arranque → chrome interactivo | 944 ms | **711 ms** |
| First contentful paint | 252 ms | **228 ms** |
| JS que carga `index.html` | 1149 KB | **263 KB** |
| Memoria de base | 919 MB | **575 MB** |
| Ventanas al arrancar | 4 | **1** |
| Pestaña nueva → activa | 23 ms | 32 ms |
| Cambio de pestaña | 31 ms | 17 ms |
| Navegación (página local) | 71 ms | 119 ms |

Las tres últimas filas están dentro del ruido con n=5: no se toca nada que las explique, y
no se van a presentar como mejoras ni como regresiones.

## Arranque empaquetado (el que ve el usuario)

`pnpm dist:dir --mac --arm64` y el banco lo mide solo (se salta el test si no hay build):

| | Empaquetada | Desarrollo |
|---|---|---|
| Arranque → interactivo | **710 ms** (peor 1252) | 648-711 ms |
| First contentful paint | **254 ms** (peor 472) | 228 ms |
| Tamaño de la `.app` | 329 MB | — |

Sale casi igual que en desarrollo, que era la duda: el asar y `file://` no penalizan frente
al dev server. El "peor" caso alto es el primer arranque tras compilar (macOS verifica el
binario nuevo); a partir del segundo se estabiliza.

Sin firmar. Con firma y notarización habrá que volver a medir: Gatekeeper añade trabajo en
el primer arranque de cada versión.

## Los tres cambios

**1. El build no estaba minificado.** `electron.vite.config.ts` no fijaba `build.minify`, y
salían 10.167 líneas con comentarios y nombres completos. Con `minify: 'esbuild'` en main,
preload y renderer: 607 KB → 263 KB. En paint son ~24 ms, poco; el valor está en el tamaño
(el paquete que se descarga, el disco, la memoria, y máquinas más lentas que esta).

**2. El chrome cargaba el Markdown del chat al arrancar.** `react-markdown` + `remark-gfm` +
micromark son ~547 KB y entraban en el chunk de `index.html`: medio mega de parser de Markdown
para pintar un sidebar y una topbar, en cada arranque. Ahora va en `React.lazy`
([Markdown.tsx](../src/renderer/src/components/chat/Markdown.tsx)), con el texto en plano y la
tipografía final como fallback para que no haya hueco ni salto de layout.

**3. Se pre-creaban tres popovers al arrancar.** site-info, menú de perfil y peek, tres
procesos de renderer vivos desde el primer segundo:

| | Con pre-warm | Sin pre-warm |
|---|---|---|
| Primer abrir | 31 ms | 63 ms |
| Memoria de base | 919 MB | 575 MB |
| Ventanas | 4 | 1 |

344 MB por 32 ms que nadie percibe, una sola vez por popover (después la ventana se reutiliza).
Y el motivo original del pre-warm —que el popover saliera **vacío** en el primer click— era
otro bug, ya resuelto en `createPopover`, que reenvía sus datos en `did-finish-load`.
Verificado: abre con sus 10 filas a la primera.

Hay un test que lo fija: *"al arrancar no hay ninguna ventana de popover"*, con el mensaje
"alguien volvió a pre-crear popovers: mide antes de hacerlo".

## Dos medidas que estaban mal

Las cuento porque un número falso es peor que ninguno:

- **El FCP devolvía 0** cuando la entrada de paint aún no existía, por un `?? 0` de fallback.
  Pasó **dos veces**: la segunda al copiar el patrón en el test de la app empaquetada. Ahora
  hay una sola función (`medirFcp`) que espera la entrada y falla si no llega, precisamente
  para que no pueda volver a existir en dos sitios.
- **`decodedBodySize` es 0 en `file://`**, así que "JS cargado por el chrome" daba **0 KB**.
  Ahora se suma el tamaño en disco de los chunks que referencia `index.html`.
- **El arranque incluía un reload** que mete el propio harness (`installStateListener`).
  Ahora ese test usa `skipStateListener`, y además se mide el FCP, que aísla nuestro código
  del ~900 ms que tarda Electron en arrancar y que tapaba cualquier mejora.

## El "flash gris" al cambiar de pestaña: lo que se descartó

Se investigó a fondo y **no se pudo reproducir ni medir**. Queda escrito para no repetir el
camino:

- **`win.capturePage()` no ve las vistas nativas.** Muestreando el centro del área de
  contenido durante 25 capturas seguidas sale `17,17,20` (el fondo de la app) siempre, con
  la página cargada y quieta. Solo captura el DOM del chrome. Para muestrear una página hay
  que capturar desde SU webContents (es lo que hace `MONPER_DEBUG_CORNERS`).
- **La página no deja de pintar.** Con una página que registra cada `requestAnimationFrame`:
  tras activar una pestaña, el primer frame llega a los **2-10 ms**, y da igual que la
  pestaña estuviera fría (fuera del warm set de 8) o caliente. El hueco máximo entre frames
  en régimen estacionario es 17-18 ms, o sea un frame a 60Hz.
- **Grabar la pantalla no es una opción práctica**: `getMediaAccessStatus('screen')` sale
  `denied` y `desktopCapturer.getSources` lanza *"Failed to get sources"*. Es un permiso TCC
  de macOS que se concede a mano en Ajustes del Sistema, y el binario que lanzan los tests
  (`node_modules/electron/dist`) no aparece en esa lista hasta que lo pide.
- **Lo que SÍ funciona: `contentTracing`**, el trazador del propio Chromium, sin permisos.
  Los eventos `PipelineReporter` dicen el estado de cada frame: `STATE_PRESENTED_ALL`,
  `STATE_DROPPED`, `STATE_NO_UPDATE_DESIRED`. Es el único instrumento que tenemos para ver
  artefactos visuales, y está en [`tests/frames.spec.ts`](../tests/frames.spec.ts).

### Lo que dijo el trazado

| Guion | Presentados | Descartados |
|---|---|---|
| 12 cambios de pestaña | ~45 | 6-16 (**~1 por cambio**) |
| 8 colapsos del sidebar | ~665 | 16-26 (3-4%) |

Hay ~1 frame descartado por cambio de pestaña, de forma consistente. Es el mejor candidato a
ser el flash. **Pero ninguno de los dos arreglos que probé lo movió**, y la varianza entre
dos corridas del MISMO build (16 vs 26 descartados) es mayor que cualquier efecto que
midiéramos:

| | Cambios | Colapsos |
|---|---|---|
| Antes | 11 | 25 |
| Sin re-enganchar la vista activa | 9 | 24 |
| Con el layout idempotente | 6-9 | 16-26 |

Los valores absolutos también son ruidosos porque cada pestaña tiene su propio compositor y
**en reposo ya salen frames descartados** (13 de 26 en 2,5 s quieto). Sirve para A/B con el
mismo guion, no como umbral.

Lo que sí salió de la investigación, medido: **`layoutTabs` re-enganchaba la vista activa al
compositor en cada cambio de layout**. `addChildView` sobre una vista que ya cuelga del
`contentView` la desengancha y la vuelve a enganchar, y se llamaba al colapsar el sidebar, al
abrir el chat y en cada resize: **12 de 12 llamadas eran redundantes**. Ahora solo se llama si
la vista no está ya encima (0 de 12), y al cambiar de pestaña exactamente 1 vez.

Se probó además una **caché de layout** (no repetir `setVisible`/`setBounds`/`setBorderRadius`
cuando el valor no cambia) y **se revirtió**. Merece quedar escrito:

- No mejoraba **nada** medible: los frames descartados salían iguales con y sin ella.
- Y añadía un modo de fallo nuevo: en cuanto alguien cambia la geometría por otra vía, la
  caché miente y `layoutTabs` se salta el cambio que hacía falta. Pasó de verdad con
  `ui:omnibox` (la página se quedaba oculta) y luego apareció una regresión del ancho al
  cerrar el panel de chat que apuntaba aquí — no se pudo reproducir en el harness (5
  escenarios: toggle por IPC, por click, doble toggle a mitad de animación, arrastrar y
  cerrar, resize de ventana) pero el mecanismo era éste y no pagaba por sí misma.

Repetir un `setBounds` es barato; una vista con el tamaño equivocado no. **La única parte que
se queda es la guarda de `addChildView`**, porque no tiene estado: lee la lista real de hijos
del `contentView`, así que no puede quedarse obsoleta. Fijada en
[`tests/layout.spec.ts`](../tests/layout.spec.ts).

## Color del topbar: la muestra que se perdía

Síntoma reportado: al volver arriba con un flick de trackpad, el topbar se quedaba con el
color de mitad del recorrido y hacía falta mover el scroll un pelín para que reaccionara.

Dos agujeros en `scheduleTopSample`, los dos reales:

1. Los eventos que llegaban **mientras había una captura pendiente se descartaban** y nadie
   volvía a mirar. Si el último evento del scroll caía en esa ventana de 100 ms, la última
   muestra era de mitad del recorrido.
2. En macOS el scroll **sigue animándose después del último evento `scroll` del DOM**:
   momentum y, al topar arriba, el rebote elástico. Esa animación la hace el compositor y no
   emite más eventos, así que la última captura veía un frame intermedio.

Arreglo: muestra de cierre cuando se descartaron eventos, más una muestra a los 260 ms de
quedarse quieto.

**Estado de la prueba, con precisión:**

- El **gesto** no se pudo reproducir. `window.scrollTo` (seco o `smooth`) no vale: la muestra
  siempre cae después del cambio de posición y se autocorrige. Los eventos de rueda de
  `sendInputEvent` tampoco, porque no llevan las fases de momentum de macOS. Se probó también
  contra github.com real, con flick de rueda, y salía OK con y sin el arreglo.
- El **mecanismo** sí está probado: hay un test que pinta un color 150 ms después del último
  evento de scroll —la misma forma que el rebote— y **falla sin el arreglo y pasa con él**.
- Para confirmarlo en tu máquina con tu trackpad: `MONPER_DEBUG_TOPCOLOR=1 pnpm dev` imprime
  cada muestra con su motivo (`scroll` / `reposo`), el `scrollY` y el color. Al llegar arriba
  debe aparecer una línea `reposo` con el color bueno.

De paso, la home de github.com **nunca** coincide exacto: su hero está animado, así que el
píxel cambia entre que se captura y se compara. No es un bug del muestreo.

## Colapsar/expandir: el chrome y la página iban desfasados

El chrome lo anima una transición CSS (compositor) y la vista de la página un `setInterval`
en el main: dos relojes. Se veía "laggy" al expandir.

Medido con un único reloj de referencia (el evento de click **dentro** de la página, porque el
click de Playwright trae ~85ms propios que no son nuestros), instrumentando cada `setBounds`
del main y cada frame del chrome con `requestAnimationFrame`:

| | Antes | Después |
|---|---|---|
| Arranque de la vista nativa | ~19 ms **después** del chrome | 1-4 ms |
| Mejor encaje entre las dos curvas | 20-24 ms de desfase | 0-4 ms |

**Y con eso NO bastaba.** Alinear el arranque dejó otro síntoma que la métrica de
desplazamiento no ve: cada lado, cuando su primer frame llega tarde, **entra de golpe a mitad
del recorrido**, porque la curva está muy cargada al principio (a 34ms ya va por el 47%).

| primer frame pintado | Antes | Después |
|---|---|---|
| Expandir: chrome / nativa | 61px / **112px** | 61 / 62 |
| Colapsar: chrome / nativa | **130px** / 178px | 179 / 178 |

Dos arreglos simétricos, uno a cada lado:

- **El main arranca su reloj en el PRIMER tick**, no cuando llega el IPC. El primer tick del
  intervalo llega ~34ms tarde (el main está ocupado justo después del click) y antes ese
  retraso se pagaba al principio, donde la curva es vertical. Ahora se paga al final, donde es
  plana: 2px sobre 240.
- **El chrome anima con un `inset` que va un frame por detrás de `collapsed`.** El cambio de
  `collapsed` monta o desmonta el sidebar entero, y la transición CSS arrancaba con el reloj
  ya corriendo: su primer frame pintado aparecía al 46%. Separando el inset, la animación
  empieza en un frame en el que el render ya está hecho.

Resultado: mismo primer frame (1-3px de diferencia) y misma duración (149-154ms).

Tres cosas que enseñó la medición, y que valen más que el arreglo:

- **Ambos lados corren limpios a 60fps** (hueco máximo 17-18ms). No había frames perdidos:
  el problema era el arranque, no la fluidez.
- **Comparar píxeles en el mismo instante engaña.** La curva es tan empinada al principio que
  un frame de desfase de muestreo ya da 60px de "diferencia". La métrica buena es el
  desplazamiento temporal que mejor encaja una curva con la otra.
- **Se probó además compartir el origen de tiempo** (el renderer manda su instante de
  arranque y el main anima desde ahí). Control con y sin: **no movía ningún número**, así que
  se quitó. Lo que alinea es el rAF.

Fijado en [`tests/layout-sync.spec.ts`](../tests/layout-sync.spec.ts), que comprueba las tres
cosas: desplazamiento ≤10ms, primer frame a menos de 35px de diferencia y duraciones que no se
separen más de 40ms.

**Cuidado con la métrica**: las dos series registran su posición de PARTIDA, y comparar la
partida de una contra el primer movimiento de la otra da 61px de desfase que no existe. Pasó,
y por poco lo doy por bueno.

## Lo que no está medido

- El arranque **empaquetado**, que es el que ve el usuario (aquí se mide el de desarrollo).
- Páginas reales pesadas: todo se mide contra un HTTP local para no depender de la red.
- El streaming del agente y el REPL.
- Percepción: el "flash gris" al cambiar de pestaña es un problema de compositor, no de los
  17 ms que tarda el cambio de estado.

## El peek tardaba la primera vez

Síntoma: "la primera vez que apunto al botón tarda muchísimo en salir, las demás va rápido".

Medido creando y cargando su ventana tres veces seguidas:

| | creada | dom-ready | primer frame |
|---|---|---|---|
| 1ª | 18 ms | 187 ms | **232 ms** |
| 2ª | 13 ms | 135 ms | 163 ms |
| 3ª | 10 ms | 123 ms | 163 ms |

Y `showPeekNow` llamaba a `showInactive()` **justo después** de `loadURL`, así que esos 230ms
eran una ventana visible, vacía y transparente. Sumando el hover-intent de 180ms: ~410ms la
primera vez contra ~185ms las siguientes, que es exactamente la diferencia que se notaba.

**Arreglo: la ventana se crea al COLAPSAR el sidebar, no en el primer hover.** No es volver a
pre-crear al arrancar —eso costaba 344MB y sigue prohibido por su test—: si nunca colapsas,
esta ventana no se crea nunca. Colapsar es la acción que declara que vas a usar el peek, y ahí
no estás esperando a nada. Encaja además con los 600ms en que `peek:show` ignora el hover tras
colapsar: para cuando puedes abrirlo, ya está cargado.

Cuesta un renderer mientras el sidebar esté colapsado. No se destruye al expandir a propósito:
con ⌘S se alterna constantemente y volveríamos a pagarlo cada vez.

Lo fija `tests/popovers.spec.ts` → "el peek se prepara al colapsar el sidebar, no al primer
hover", que comprueba las dos mitades: que expandido NO existe, y que al colapsar existe,
termina de cargar y **no** se muestra.
