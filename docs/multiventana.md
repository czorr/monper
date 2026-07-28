# Multi-ventana: plan

Hoy Monper es de **una sola ventana**, y no por descuido de un sitio: el estado de "la
ventana" son variables de módulo que usa todo el main.

## Lo que hay que desmontar, medido

| | |
|---|---|
| Referencias a `win`, `tabs`, `activeId`, `sidebarCollapsed`, `chatOpen` | **212** |
| Handlers IPC que tocan ese estado | **82 de 140** |
| Popovers parentados a `win`, más el peek | **7** |
| Líneas del núcleo de pestañas + layout | **781** |

```ts
let win: BrowserWindow | null = null   // ← 88 usos
const tabs = new Map<number, Tab>()    // ← 76
let activeId: number | null = null     // ← 35
let sidebarCollapsed = false           // ← 8
let chatOpen = false                   // ← 5
```

## El diseño correcto

Una `Ventana` con **sus** pestañas, su activa, su layout y sus popovers; un registro de
ventanas; y los handlers IPC resolviendo **de qué ventana viene** el mensaje con
`BrowserWindow.fromWebContents(e.sender)` en vez de asumir la única que hay.

Eso último no es solo plumbing: hoy `ipcMain.on('ui:collapse')` colapsa *la* ventana. Con dos
abiertas, sin resolver el emisor, colapsaría la equivocada — y ese tipo de bug no se ve en un
test hasta que hay dos ventanas de verdad.

## Orden, en rebanadas que se pueden verificar

Cada una deja el repo en un estado coherente y con los 118 tests en verde. Si se para entre
dos, no queda nada a medias.

1. **Extraer `Ventana`, con una sola instancia.** Mover los cinco globales a un objeto y
   rewirear las 212 referencias. **Cero cambio de comportamiento**: la suite en verde es
   exactamente el criterio de éxito. Es la rebanada más aburrida y la más larga.
2. **Resolver el emisor en los 82 handlers.** Siguen operando sobre la única ventana, pero ya
   por `fromWebContents` y no por el singleton.
3. **Popovers y peek por ventana.** Site info, menú de perfil, submenú, omnibox, extensiones,
   quick sign-in, vault y peek se crean por ventana o se re-parentan al enfocarse.
4. **`createWindow()` de verdad, ⌘N.** Recién aquí aparece la segunda ventana.
5. **Arrastrar una pestaña fuera** → mover el `WebContentsView` a otra ventana.

## Lo que ya está hecho (rebanadas 1-4)

- `crearVentana()` devuelve una `Ventana` con sus pestañas, su activa, su layout y sus
  esquinas. `ventanas: Map<id, Ventana>`, `vAct()` (la enfocada), `vActOpt()`, `ventanaDe(wc)`.
- **`vDe(ev)` es lo que usan los handlers**: `ventanaDe(ev.sender) ?? vAct()`. Los 33 handlers
  que tocaban estado de ventana ya resuelven el emisor.
- `ventanaDe` **no se fía de `BrowserWindow.fromWebContents`**: para el `WebContentsView` de una
  pestaña no siempre resuelve, así que además recorre las ventanas buscando el `webContents`.
- `paraTodas(canal, …)` y `paraPaginas(sufijo, canal, …)` para el estado que es de la app y no
  de una ventana: marcadores, descargas, perfil, vault, actualizaciones, rutinas. Mandarlo solo
  a la enfocada dejaba la otra con datos viejos y sin forma de enterarse.
- `reparentar(w)` antes de mostrar el vault y el peek: se crean una vez y capturaban su `parent`.
  El popup de extensiones se destruye y recrea, así que no lo necesita.
- **Sesión: el formato pasa a `{ ventanas: [{urls, activeIndex}] }`**, y se sigue leyendo el
  viejo (`{urls, activeIndex}`) como una sola ventana. La primera ventana toma el primer grupo y
  pide una ventana por cada grupo restante; cada una hace `shift()` de la cola al cargar. Sin
  esto, ⌘N duplicaba toda la sesión anterior en cada ventana nueva.
- Los servicios de app (scheduler de rutinas, updater) arrancan **una vez**, no por ventana.
- ⌘N en Archivo → Nueva ventana. `tests/multiventana.spec.ts` cubre las tres invariantes:
  aparece la segunda ventana, las pestañas no se mezclan, y cerrar en una no toca la otra.

- **El id de pestaña pasa a ser único en toda la app.** Era un contador por ventana que
  empezaba en 1, así que con dos ventanas había dos pestañas con id 1. El estado que recibe
  cada renderer solo lleva las suyas, pero cualquier búsqueda global habría sido ambigua.

- Cerrar una ventana **no destruye** los `WebContentsView` de sus pestañas: hay que cerrarlos a
  mano en `closed` o cada ⌘N + ⌘⇧W deja procesos de renderer vivos.

### Trampas que costaron una vuelta

`ipcMain.emit('ui:setPanel', null, …)` en los tests de layout pasa `null` como evento: `vDe`
tiene que tolerar un evento sin `sender` y caer en `vAct()`, o esos tres tests revientan con
`Cannot read properties of null`.


El rewiring masivo de las 212 referencias se hizo con una expresión regular, y **reescribió
también literales de cadena**: `'tabs:new'` acabó como `'vAct().tabs:new'` y los 12 tests de
pestañas fallaron con `No handler registered`. Si se repite el patrón en la rebanada 5, excluir
lo que va entre comillas antes de sustituir.

## Trampas de ESTE repo, no genéricas

- **El layout y las esquinas.** `layoutTabs`, `animateLayout` y la máscara de `setBorderRadius`
  ya costaron días y varias hipótesis falsas (ver [esquinas-y-vibrancy.md](esquinas-y-vibrancy.md)).
  Son per-ventana y hay que moverlos con cuidado: `resellarRadioAlAsentarse` usa `activeId`, y
  una máscara sellada al tamaño de la ventana equivocada es exactamente el bug que ya
  perseguimos.
- **Solo la activa se dibuja.** Esa regla es por-ventana: con dos ventanas, cada una tiene su
  activa y ocultar "todas menos la activa" globalmente dejaría una ventana en negro.
- **El peek** sondea el cursor con `screen.getCursorScreenPoint()` y compara contra el rect de
  *la* ventana. Con dos, hay que saber sobre cuál está el ratón.
- **El agente y el control remoto** operan sobre "la pestaña activa". Con varias ventanas eso
  deja de estar definido: hay que decidir si el agente vive en una ventana concreta (creo que
  sí) o si sigue a la enfocada (creo que no: una tarea larga no debe cambiar de ventana porque
  hagas clic en otra).
- **`saveSessionNow` y la restauración** guardan una lista plana de pestañas. Pasa a ser una
  lista de ventanas, con migración del formato viejo.

## Recomendación: después de lanzar

Es el único P1 que **no se nota al abrir el navegador**. Los demás eran ausencias que empujan
a abrir Chrome; este es comodidad de usuario avanzado.

Y el riesgo está mal repartido: toca justo el área —layout, esquinas, peek— que ya se llevó
varios días y tres hipótesis equivocadas. Meterle mano la semana antes de lanzar, con la firma
de Apple todavía pendiente, es cambiar un feature que poca gente pedirá el primer día por la
posibilidad de romper lo que todo el mundo ve.

Después de lanzar, con usuarios reales y sin prisa, es un refactor limpio de 2-4 sesiones.
