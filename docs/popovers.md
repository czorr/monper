# Ventanas nativas (popovers)

Los overlays de Monper **tienen** que ser ventanas nativas: la vista de la página
(`WebContentsView`) se dibuja encima del DOM, así que un `div` posicionado queda debajo.

Eran 9 ventanas hechas a mano, cada una con su propio posicionamiento, su auto-cierre, su
medición de alto y su diseño de filas. Hoy **5 salen de una factoría común** y 4 siguen a
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

## Submenús del menú de perfil

Las filas con chevron (Bookmarks, Downloads, Extensions, History, Developers) abren un
submenú **en otra ventana nativa**, no en un div: sale fuera del panel y ahí el DOM no se ve,
porque la vista de la página se dibuja encima.

Tres cosas que lo hacen funcionar como un menú de verdad:

- **`focusable: false`** en el submenú. Si robara el foco, el menú padre se cerraría por su
  propio `blur` en cuanto apareciera el hijo.
- **`onHide` en la factoría**: cuando el padre se esconde, se lleva al hijo consigo.
- **Pasar por una fila sin submenú lo cierra**, que es lo que se espera al recorrer un menú.

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
—y que el del resto. Ahora los cinco de la factoría usan la misma regla:
`ventana = panel + 24`. El vault, por ser opaco y con sombra nativa, no lleva ese margen.

`width` en la omnibox es solo el ancho con el que nace la ventana (para que el renderer no
mida a 24px); el real lo pone el anchor en cada `show`.

## Tests

[`tests/popovers.spec.ts`](../tests/popovers.spec.ts): que al arrancar **no** existe ninguno
(ya no se pre-crean: costaba 344MB de base, ver [rendimiento.md](rendimiento.md)), que cada uno
se crea en el primer uso y luego se reutiliza, que abren con el ancho correcto, que se cierran desde el renderer, que solo hay uno
abierto a la vez, que el alto reportado mueve la ventana y que la omnibox no roba el foco.
