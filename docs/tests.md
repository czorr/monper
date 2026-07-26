# Tests

26 smoke tests sobre la app real (Playwright + Electron). No hay tests unitarios todavía:
lo que se rompía en Monper no eran funciones puras, era el arranque, las pestañas y el IPC.

```bash
pnpm test        # compila y ejecuta
pnpm test:only   # ejecuta sin recompilar (si ya hiciste pnpm build)
npx playwright test tests/tabs.spec.ts -g "reordena"
```

## Qué cubren

| Fichero | Qué fija |
|---|---|
| `app.spec.ts` | Arranca, abre la ventana, expone `window.monper`, hay pestaña activa, la versión cuadra con `package.json`, cero errores de consola |
| `tabs.spec.ts` | Crear, navegar, cambiar, cerrar, reordenar, silenciar; nunca quedan 0 pestañas; una URL que no resuelve pinta la página de error |
| `state.spec.ts` | Marcadores (añadir, desmarcar, `bookmarked` en el estado), tamaños de panel, estado de actualización, **persistencia tras reiniciar** |
| `security.spec.ts` | Sin node ni `contextIsolation:false` en las páginas, el preload no expone nada con pinta de secreto, ningún canal IPC con "password/secret" en el nombre, el chrome no puede escribir datos privados, una web no ve `window.monper` ni `require`/`process` |

## Reglas que salieron a base de tropezar

- **Perfil desechable siempre.** `launch()` pasa `--user-data-dir` a un tmpdir. Sin eso los
  tests escriben en `~/Library/Application Support/Monper` y le borran al usuario sus
  marcadores y su vault.
- **Un worker, en serie.** Varias instancias se pelean por el foco.
- **Nada de red.** `serve()` levanta un HTTP local en el puerto 0. Y tiene que ser http:
  `normalizeUrl` manda cualquier cosa que no sea http(s)/dominio a una búsqueda de Google,
  así que un `data:` URL nunca se carga (eso es a propósito).
- **El predicado de `waitForState` se evalúa en Node, no en la página.** El CSP del chrome
  (`script-src 'self'`) prohíbe `unsafe-eval`: compilar una función dentro del renderer
  falla. Nuestro propio CSP haciendo su trabajo.
- **`state:update` es solo push.** El main lo manda en `did-finish-load`; si te suscribes
  después te pierdes el primero. `installStateListener` usa `addInitScript` + un reload.
- **No pedir permisos en un test.** Sin decisión previa el handler abre un diálogo
  **nativo** y el test se cuelga esperando un click que nadie va a dar.
- **Las páginas no son ventanas.** Son `WebContentsView`, así que Playwright no las ve como
  `Page`. Para mirar dentro de una web: `app.evaluate` + `wc.executeJavaScript`.

## Hallazgos de escribir los tests

- `getVersion` está en el preload de contenido (páginas internas), no en el del chrome.
- La página de error **conserva la URL que pidió el usuario** (para que la omnibox la
  muestre); la señal de que se pintó es el título, no la URL.
- La app **ya no trae marcadores por defecto** (se quitaron: presuponían a qué sitios entra el
  usuario y obligaban a inventarles un icono antes de haber visitado la página). Los tests de
  marcadores crean el suyo y miden contra la lista inicial igualmente.
- **`removeBookmark` y `addBookmark` del preload no hacen nada desde el chrome**: los
  canales están restringidos a las páginas internas (`newtab/settings/error/downloads`) y
  `index.html` no es una de ellas. Nadie en el renderer los llama (los marcadores se
  quitan por el menú contextual nativo), así que hoy es código muerto, no un fallo visible.
  Está fijado como invariante de seguridad en `security.spec.ts`; si algún día el chrome
  necesita borrar marcadores, hay que decidirlo a propósito y no descubrirlo con un
  botón que no responde.

## Tests que solo corren en local

Cuatro dependen del entorno de la máquina, no del producto, y en CI se saltan o se quedan sin
afirmar. Está decidido a propósito: bajar los umbrales hasta que el runner no proteste los
dejaría sin capacidad de detectar la regresión para la que se escribieron.

| Test | Por qué |
|---|---|
| `peek.spec.ts` (3) | El peek se abre con hover intent y comprueba el cursor **real** (`screen.getCursorScreenPoint()`). Un runner no tiene cursor. |
| `topcolor.spec.ts` → muestra de reposo | Depende de que UNA captura concreta caiga en su ventana, y `capturePage` sin GPU no es fiable. Los otros dos de ese fichero aguantan porque cualquier muestra posterior los corrige. |
| `layout-sync.spec.ts` | En CI mide e **imprime**, pero no afirma: el umbral es de cadencia de frames. El runner da `shift=-18ms` (un frame, el suelo de mandar el rect por IPC) con el arreglo funcionando — y el dato que de verdad importa, el primer frame, sale en Δ=0px. |

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml), dos jobs en `macos-latest`:

- **check**: `pnpm typecheck` → `pnpm build` → smoke tests (sube el reporte si falla).
- **package**: `pnpm dist:dir` sin firmar y comprueba que la `.app` existe y trae las
  skills dentro. Se rompió una vez por una dependencia que no entraba en el asar y no lo
  vimos hasta intentar distribuir.

macOS y no Linux a propósito: los tests arrancan Electron con ventana y la app depende de
cosas de macOS. En Linux habría que meter `xvfb` y probaríamos algo que nadie usa.

`tests/` y `playwright.config.ts` entran en `pnpm typecheck` — si no, se pudren.

## Lo que NO cubren

Las 9 ventanas nativas (omnibox, vault, peek, extensiones…), el chat con el agente (haría
falta un provider falso), el REPL y las rutinas, y la instalación de una actualización
(necesita firma). Nada de eso es inalcanzable; simplemente no está.

## `pnpm build` construye también los paquetes

`tests/mcp.spec.ts` lanza `packages/monper-mcp/dist/index.js` como proceso hijo: prueba el
puente de punta a punta, y para eso el paquete tiene que estar compilado.

Eso rompió CI una vez. `pnpm build` solo llamaba a `electron-vite build`, que compila la app
pero no los paquetes de `packages/`; en local el `dist` existía de haberlo compilado a mano y
en CI no, así que el spec arrancaba un fichero inexistente. **Cuatro tests fallando con
`Cannot find module`.**

Ahora `build` encadena `build:mcp`, y `test` llama a `build` en vez de a `electron-vite build`
directamente. Así cualquiera que compile obtiene un árbol coherente, sin que haya que saber un
paso extra que solo vive en el YAML de CI.

`packages/` **no es un workspace de pnpm** y `monper-mcp` no tiene `node_modules` propio: se
compila con el `typescript` y los `@types/node` de la raíz. Si algún día se le añaden
dependencias propias, hará falta un `pnpm-workspace.yaml`.

## Qué se afirma en CI y qué no

`tests/layout-sync.spec.ts` **mide en CI pero no afirma**: sus umbrales son de cadencia de
frames y el runner no tiene vsync fiable. Los números quedan en el log. Conviene saberlo antes
de perseguir un fallo suyo: si falla, es en local y casi siempre por carga de la máquina —
correr toda la suite a la vez basta para que el primer tick llegue tarde y se pase de los 35px.

`tests/peek.spec.ts` se salta entero en CI: el peek se abre con hover intent y comprueba el
cursor REAL del sistema, que en un runner no existe.
