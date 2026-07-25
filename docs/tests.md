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
- La app trae marcadores por defecto (Gmail y compañía): cualquier test de marcadores tiene
  que medir contra la lista inicial, no contra cero.
- **`removeBookmark` y `addBookmark` del preload no hacen nada desde el chrome**: los
  canales están restringidos a las páginas internas (`newtab/settings/error/downloads`) y
  `index.html` no es una de ellas. Nadie en el renderer los llama (los marcadores se
  quitan por el menú contextual nativo), así que hoy es código muerto, no un fallo visible.
  Está fijado como invariante de seguridad en `security.spec.ts`; si algún día el chrome
  necesita borrar marcadores, hay que decidirlo a propósito y no descubrirlo con un
  botón que no responde.

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
