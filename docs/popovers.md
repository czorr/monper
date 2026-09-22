# Ventanas nativas (popovers)

Los overlays de Titanio **tienen** que ser ventanas nativas: la vista de la página
(`WebContentsView`) se dibuja encima del DOM, así que un `div` posicionado queda debajo.

Eran 9 ventanas hechas a mano, cada una con su propio posicionamiento, su auto-cierre, su
medición de alto y su diseño de filas. Hoy **6 salen de una factoría común** y 4 siguen a
mano por motivos concretos.

- Main: [`src/main/popover.ts`](../src/main/popover.ts) — `createPopover()`.
- Renderer: [`Popover.tsx`](../src/renderer/src/components/popover/Popover.tsx) — `PopoverPanel`,
  `PopoverRow`, `PopoverLabel`, `PopoverDivider`, `PopoverList`, `PopoverToggle`.

## Cómo se añade uno

```ts
const miPopover = createPopover(() => win, {
  name: 'algo',            // define los canales: `algo:height` y `algo:close`
  width: 320,              // ancho del PANEL; la ventana es width + 24 (margen de sombra)
  height: 240,             // alto inicial, hasta que el renderer mida
  preload: 'algowin',
  page: 'algo',
  align: 'center',         // 'left' (default) | 'center' | 'right'
  data: { channel: 'algo:data', get: () => construirDatos() }
}, RENDERER_URL)

ipcMain.on('algo:open', (_e, anchor: MenuAnchor) => miPopover.show(anchor))
```

En el renderer, envolver todo en `PopoverPanel` con `onHeight` y usar `PopoverRow`.
**No crear filas nuevas**: si una fila no encaja, se amplía `PopoverRow`.

## Estado

| Ventana | Origen | Notas |
|---|---|---|
| Site info | factoría | `align: left` |
| Petición de permiso | factoría | `align: left`, anclada a la barra del dominio: se pide donde luego se cambia. Ver abajo |
| Descargas | factoría | `align: right` |
| Menú de perfil | factoría | |
| Extensiones | factoría | `align: center` |
| Omnibox | factoría | `focusable: false`, `widthFromAnchor` (mide lo que el input) |
| **Vault** | a mano | **Decisión de producto, no deuda.** Se migró a la factoría y se revirtió: su diseño propio (ventana opaca, esquinas y sombra nativas, cabecera con candado, filas de 44px con avatar, pie de "Gestionar en Settings") es el que queremos. No volver a unificarlo. |
| Quick sign-in | factoría | `focusable: false` + anchor sintético (no cuelga de un botón) |
| **Peek del sidebar** | a mano | Sondea el cursor con `screen.getCursorScreenPoint()` para el coyote time, se activa al entrar (macOS no manda mouse-move a ventanas inactivas) y su x/ancho no dependen del anchor. Meterlo en la factoría era retorcerla. |
| **Popup de extensión** | a mano | Carga HTML de la extensión con su propio preload. No es nuestro renderer. |
| **Ventana principal** | a mano | Obvio. |

## Cosas que la factoría resuelve por ti

- **Posicionar antes de mostrar.** Si haces `show()` y luego `setBounds`, se ve un flash en
  una esquina de la pantalla.
- **Clamping al padre**, para que el panel no se salga de la ventana.
- **`blur` → `hide`** en los focusables (un menú se cierra al perder el foco). Los
  `focusable: false` no reciben ese evento, así que se cierran a mano.
- **`acceptFirstMouse`**, para que el primer click funcione sin activar la ventana.
- **Los datos llegan aunque el renderer todavía no estuviera escuchando.** El popover salía
  vacío en el primer click porque el `send` del main ocurría antes de que el componente
  registrara su listener. `did-finish-load` **no basta**: dispara cuando la página carga, y el
  efecto de React corre después — el menú de perfil seguía saliendo sin nombre ni avatar con
  ese arreglo. Lo que cierra la carrera es el apretón de manos: el preload manda
  `<name>:ready` en cuanto alguien se suscribe y el main contesta con los datos. Si añades un
  popover con `data`, su preload tiene que mandar ese aviso al suscribirse.
- **`<name>:height`** para que la ventana se ajuste al contenido, y **`<name>:close`**.

## La salida del peek

Una ventana oculta no pinta nada, así que **para que un popover tenga animación de salida el
main tiene que avisar antes de esconderla**. El peek lo hace: `hidePeek()` manda
`peek:closing`, espera `PEEK_OUT_MS` (140ms) y entonces sí llama a `hide()`.

Dos trampas que costaron un test cada una:

- El sondeo del cursor se para **al empezar** la retirada, no al terminar; si no, se vuelve a
  abrir sola mientras se está yendo.
- Si el ratón vuelve a mitad de la retirada, la ventana **sigue visible**, así que `peek:show`
  tomaba el atajo de "ya está abierta" y se saltaba la cancelación: el peek se escondía igual
  aunque hubieras vuelto. Ese atajo ahora cancela el temporizador y reenvía `peek:shown`.

Las animaciones del peek (`peek-slide-in` / `peek-slide-out`, cajón desde el borde izquierdo)
son suyas y no la `peek-in` compartida: esa la usan todos los popovers y un menú no debe
deslizarse media pantalla. `PopoverPanel` acepta la animación por prop.

## El peek va por el mismo camino

El peek no usa `data` de la factoría: renderiza el mismo `<Sidebar/>` y recibe `state:update`
como el chrome. Tenía **el mismo fallo**: al crearse al vuelo, su React se suscribía después
del `pushState()` que lo acompaña y salía con pestañas de otro momento. Ahora el preload pide
el estado (`state:get`) al suscribirse, así que ya no depende de llegar a tiempo — y de paso
el chrome también deja de depender de ello tras un ⌘R.

## Submenús del menú de perfil

Las filas con chevron (Bookmarks, Downloads, Extensions, History, Developers) abren un
submenú **en otra ventana nativa**, no en un div: sale fuera del panel y ahí el DOM no se ve,
porque la vista de la página se dibuja encima.

Cómo funciona el foco, que es la parte que cuesta:

**macOS no entrega eventos de ratón a una ventana inactiva.** Con el submenú sin foco, su
`:hover` no responde y hay que clicar primero — se sentía rarísimo. Pero si el submenú toma el
foco, el padre lo pierde y se cierra. La salida son cuatro piezas:

- **`keepOnBlur`**: mientras el submenú esté abierto, el padre NO se cierra al perder el foco
  (se lo ha llevado su propio hijo).
- **`activateOnShow: false`**: el submenú aparece sin activarse. Se abre con el ratón todavía
  sobre el padre, y robarle el foco ahí dejaría las demás filas del padre sin hover.
- **Un sondeo del cursor** (el mismo truco del peek) que da el foco a quien esté debajo del
  puntero, **en los dos sentidos**: al entrar en el submenú, al hijo; al volver al menú, al
  padre. Solo dárselo al hijo era el mismo bug al revés.
- **`onHide`**: al cerrarse el hijo, el padre sobrevive solo si tiene el foco (volviste a él);
  si el foco se fue a otra parte, se cierran los dos. Es un menú, no dos ventanas sueltas.

Y **pasar por una fila sin submenú lo cierra**, que es lo que se espera al recorrer un menú.

El renderer del submenú no sabe de dónde salen las filas: el main se las manda ya masticadas
(`SubmenuRow`, con label, subtexto, icono, imagen y `action`), y devuelve la `action` al
clicar. Añadir una sección es añadir un `case` en `datosSubmenu()` y otro en el handler.

**La posición hay que traducirla dos veces**: el rect de la fila llega en coordenadas de la
ventana DEL MENÚ, hay que pasarlo a pantalla y de ahí al área de contenido de la ventana
principal, que es el sistema en el que trabaja la factoría.

## Lo que NO se unifica

Que una ventana esté "a mano" no es siempre deuda. El vault es el ejemplo: comparte las
primitivas *conceptuales* (abre anclado, se cierra al perder el foco) pero su look es
deliberadamente distinto porque es el sitio donde viven los secretos y conviene que se
sienta otra cosa. Si en el futuro alguien "termina la unificación", va a romper eso.

## Detalle que se corrigió al migrar

Site info y el menú de perfil creaban la ventana con el ancho del panel **sin sumar el
margen de la sombra** (`PAD * 2`), así que su panel salía 24px más estrecho que el diseño
—y que el del resto. Ahora los siete de la factoría usan la misma regla:
`ventana = panel + 24`. El vault, por ser opaco y con sombra nativa, no lleva ese margen.

`width` en la omnibox es solo el ancho con el que nace la ventana (para que el renderer no
mida a 24px); el real lo pone el anchor en cada `show`.

## Tests

[`tests/popovers.spec.ts`](../tests/popovers.spec.ts): que al arrancar **no** existe ninguno
(ya no se pre-crean: costaba 344MB de base, ver [rendimiento.md](rendimiento.md)), que cada uno
se crea en el primer uso y luego se reutiliza, que abren con el ancho correcto, que se cierran desde el renderer, que solo hay uno
abierto a la vez, que el alto reportado mueve la ventana y que la omnibox no roba el foco.

## Descargas (`downloadspop`)

El botón de descargas del topbar abría la **página** de todas las descargas. Para contestar
"¿terminó lo que acabo de bajar?" te cambiaba de página y perdías lo que estabas leyendo. Ahora
abre un popover con las 6 últimas —las que están bajando primero, que son el motivo por el que
se abre— y "Ver todas" sigue llevando al listado completo.

- **Se refresca en vivo.** `broadcastDownloads()` le manda la lista además de a las páginas: se
  abre justo para mirar cómo va una descarga, y con datos solo al abrirse la barra de progreso
  se quedaba congelada delante del usuario.
- **La barra de progreso es el FONDO de la fila**, no un elemento aparte: en 320px de ancho, una
  barra propia obliga a partir el nombre del archivo en dos líneas.
- Una descarga en curso no responde al clic: abrir un archivo a medias es peor que no responder.
- `fmtBytes` se movió a [`src/shared/bytes.ts`](../src/shared/bytes.ts). Estaba duplicado entre
  la página y el popover, y dos copias garantizan que un día el mismo archivo se vea como
  "1.4 MB" en un sitio y "1,4 MB" en el otro.

## La petición de permiso no la ancla el main

Cámara, micrófono, ubicación y compañía se pedían con `dialog.showMessageBox`: una caja del
sistema, centrada, modal, que no se parece a nada del producto y —lo importante— aparece lejos
del pill del dominio, que es donde ese permiso vive después. El usuario decidía sin llegar a
ver dónde volver a cambiarlo.

Ahora se pregunta en un popover anclado a la barra del dominio. Con un detalle de
arquitectura: **dónde cae el pill solo lo sabe el DOM del chrome**, así que el main no puede
posicionarlo por su cuenta. El flujo es un ida y vuelta:

1. `askPermission` (main) manda `perm:ask` a la ventana que pregunta.
2. El `UrlBar` mide su contenedor y contesta `perm:anchor` con el rect.
3. El main muestra el popover ahí y espera la respuesta por `permask:answer`.

Se ancla al **contenedor de la barra**, no al pill: el pill no existe mientras se edita la
URL, y una petición de permiso no puede depender de dónde tuviera el usuario el cursor.

Con **multiventana**, la ventana que importa es la que PIDE el permiso, no la activa: se busca
en `ventanas` aquella cuya pestaña activa es el `webContents` solicitante. Anclarlo a la activa
pondría el panel sobre un chrome que no es el del sitio que pregunta, señalando el dominio
equivocado.

Tres casos que no son el feliz, y por qué se resuelven así:

- **La pide una pestaña de fondo** (o de otra ventana) → `unavailable`, y cae al diálogo
  nativo. Anclar al pill el permiso de otra pestaña señalaría un dominio que no es el suyo.
- **El chrome no contesta en 1,5 s** (ventana oculta, arranque) → `unavailable` e igualmente
  diálogo. Una petición de permiso no puede quedarse colgada en silencio. Al expirar se
  descarta también el anclaje: si el chrome contesta tarde, mostraría un popover huérfano.
- **El usuario cierra el popover sin pulsar** → se deniega ESTA vez y **no se guarda nada**.
  Un descuido no es una decisión; persistirlo como `denied` condenaría al sitio para siempre
  sin que nadie lo hubiera elegido.

## Primera apertura: 291 ms de ventana VACÍA (agosto 2026)

El usuario: *"el profile menu tarda una barbaridad en abrir la primera vez"*. Medido con una
sonda desechable, abriendo el menú de perfil tres veces seguidas:

```
apertura 1: ventana 59 ms · contenido 291 ms
apertura 2: ventana 11 ms · contenido  13 ms
apertura 3: ventana  8 ms · contenido   9 ms
```

O sea: el coste no es crear la ventana, es **arrancar su renderer**, y `show()` la enseñaba
igualmente a los 59 ms — casi un cuarto de segundo de panel en blanco encima de la página. Dos
arreglos, los dos en `popover.ts`:

1. **No mostrar antes de pintar.** El `show` espera a `ready-to-show` si aún no ha pintado. Un
   contador `turno` invalida el `show` pendiente si mientras tanto se pidió cerrar u abrir otro:
   sin él, un popover podía aparecer solo medio segundo después de que el usuario lo cerrara.
2. **Precalentar SOLO el menú de perfil**, y a los 4 s de arrancar. Precalentarlos todos ya se
   probó y se descartó (344 MB por ~30 ms); este es el único que se abre en cada sesión.

## Por qué los popovers no tienen la vibrancy del sidebar

Preguntado directamente: *"¿como es un native window no puede tener vibrancy igual que el
sidebar?"*. Puede, pero no **a la vez** que lo demás:

- La ventana del popover es `transparent: true` (así el panel se ve redondeado y la sombra CSS
  cabe en el margen `PAD`). En una ventana transparente de macOS **no hay vibrancy**: el
  `NSVisualEffectView` no tiene superficie que componer. Y `backdrop-filter` tampoco hace nada,
  porque no se compone ningún fondo detrás de la página.
- La ventana principal sí la tiene porque **no** es transparente: `vibrancy` +
  `visualEffectState: 'active'` + `backgroundColor: '#00000000'`, sin `transparent`.

Por eso el `bg-[#1c1c20]/95` del panel dejaba ver lo de detrás **sin desenfocar**: ese 5% era un
agujero de verdad. El panel pasa a opaco y se quita el `backdrop-blur-md`, que no hacía nada.

Tener vibrancy de verdad exige rehacer la ventana: `transparent: false`, `PAD = 0` (si no, el
margen de la sombra sería un rectángulo de material desenfocado alrededor del panel), redondeo
y sombra nativos (`roundedCorners` / `hasShadow`) en vez de por CSS. Es tocar esquinas, así que
no se hace de oído — ver [esquinas-y-vibrancy.md](esquinas-y-vibrancy.md).
