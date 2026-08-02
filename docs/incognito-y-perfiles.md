# Incógnito y perfiles

Las dos son la misma pieza: **en qué sesión de Chromium vive una ventana**. Hasta agosto de 2026
eso era una constante (`PARTITION = 'persist:monper'`) repetida en seis sitios. Ahora vive en
[`src/main/particiones.ts`](../src/main/particiones.ts) y cuelga de la ventana
(`Ventana.particion`, `Ventana.incognito`).

## Decisiones tomadas (agosto 2026)

- **Un solo perfil activo en toda la app**, no uno por ventana. Cambiar de perfil recarga todo.
- **Alcance a lo Chrome**: separado por perfil serán cookies/sesión web, historial, marcadores,
  descargas, favicons y permisos. Compartidos: el vault, los ajustes de la app, los chats del
  agente y el consumo/billing. El vault sigue siendo una sola caja fuerte del Mac.
- Incógnito primero, porque es el mismo mecanismo y se puede probar entero.

## Incógnito: qué lo hace incógnito

Dos capas, y **hacen falta las dos**:

1. **La partición no persiste.** `monper-incognito`, sin el prefijo `persist:`. Chromium tira
   cookies, localStorage, IndexedDB y caché al morir el proceso, los borre alguien o no. Sin
   esto, no escribir nuestros JSON no serviría de nada: la cookie del banco seguiría ahí mañana.
2. **No se escribe nada nuestro**: ni `recordVisit`/`updateMeta` (historial), ni
   `rememberFavicon`, ni `session.json`. `restoreSession` además se niega a restaurar *dentro*
   de una ventana de incógnito, que abriría ahí las pestañas de la sesión normal.

Es **una sola** sesión para todas las ventanas de incógnito, como Chrome: si cada una tuviera la
suya, hacer login y abrir el sitio en otra ventana de incógnito volvería a pedirlo.

### `prepararSesion()`: la trampa que costó encontrar

Todo lo que hace navegable una sesión —UA de Chrome, Client Hints, adblocker, permisos,
`getDisplayMedia`, descargas— se enganchaba **una vez al arrancar**, sobre `persist:monper`. Una
sesión nueva no hereda nada de eso: la primera ventana de incógnito navegaba **sin adblocker,
diciendo ser Electron y con la pantalla compartida rechazada**. Por eso ese bloque es ahora
`prepararSesion(particion, incognito)`, idempotente, y se llama al crear cada ventana.

El adblocker admite **un listener por sesión y por evento**, así que `adblock.ts` pasó de guardar
una sesión a guardar un `Set` (`adjuntarAdblock`). El motor y las listas son comunes; lo único
por sesión son los listeners.

### Lo que NO va a incógnito

- **Extensiones.** Igual que Chrome de fábrica. Una extensión ve cada página que abres y puede
  hablar con su servidor: meterlas en la ventana que se abre para no dejar rastro sería prometer
  una cosa y hacer la contraria.
- **Restauración de sesión**, en los dos sentidos.

### Lo que sí se comparte, y por qué

- **La lista de descargas.** Es en memoria (`downloads.ts` no escribe nada) y muere con la app,
  igual que en Chrome durante la sesión. Descargar sin ver el progreso sería peor.
- **El vault.** Autorrellenar en incógnito está permitido (Chrome también); lo que no hay es alta
  automática de credenciales nuevas.

## Cómo se prueba

[`tests/incognito.spec.ts`](../tests/incognito.spec.ts) va contra la sesión de Chromium de
verdad y contra los ficheros de disco, no contra botones. Dos cosas que aprendimos escribiéndolo:

- **Con control siempre.** "El host no está en el historial" pasaría igual si el historial no se
  escribiera nunca. La misma URL en una pestaña normal tiene que aparecer.
- **Los tests de un fichero comparten estado.** El primer intento buscaba el *host* en
  `session.json` y fallaba porque una pestaña normal de un test anterior ya lo había visitado. Se
  busca una marca en la query que solo tocó incógnito.
- Dentro de `app.evaluate` **no hay `require`**: los JSON se leen desde el proceso de test, que
  sí es Node.

## Pendiente: perfiles

Falta la parte grande. Lo que ya está listo para ello: la partición cuelga de la ventana,
`prepararSesion` sabe preparar cualquier sesión y el adblocker admite varias. Lo que falta:

- `persist:monper-<id>` por perfil y un `perfiles.json` con la lista.
- Los ficheros de estado por perfil (`history.json`, `bookmarks.json`, `session.json`,
  `favicons.json`, `permissions.json`) en un subdirectorio del perfil. Hoy todos salen de
  `app.getPath('userData')` a pelo.
- Selector en el menú de perfil, y recargar la app al cambiar (decisión: un solo perfil activo).
- Migración del perfil actual al perfil "por defecto" sin que nadie pierda nada.
