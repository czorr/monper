# Incógnito y perfiles

Las dos son la misma pieza: **en qué sesión de Chromium vive una ventana**. Hasta agosto de 2026
eso era una constante (`PARTITION = 'persist:titanio'`) repetida en seis sitios. Ahora vive en
[`src/main/particiones.ts`](../src/main/particiones.ts) y cuelga de la ventana
(`Ventana.particion`, `Ventana.incognito`).

## Decisiones tomadas (agosto 2026)

- **Un solo perfil activo en toda la app**, no uno por ventana. Cambiar de perfil recarga todo.
- **Alcance a lo Chrome**: separado por perfil serán cookies/sesión web, historial, marcadores,
  descargas, favicons y permisos. Desde la personalización de septiembre de 2026 también
  apariencia, navegación y preferencias del agente. Compartidos: el vault, las conexiones
  de IA, los chats y el consumo/billing.
- Incógnito primero, porque es el mismo mecanismo y se puede probar entero.

## Incógnito: qué lo hace incógnito

Dos capas, y **hacen falta las dos**:

1. **La partición no persiste.** `titanio-incognito`, sin el prefijo `persist:`. Chromium tira
   cookies, localStorage, IndexedDB y caché al morir el proceso, los borre alguien o no. Sin
   esto, no escribir nuestros JSON no serviría de nada: la cookie del banco seguiría ahí mañana.
2. **No se escribe nada nuestro**: ni `recordVisit`/`updateMeta` (historial), ni
   `rememberFavicon`, ni `session.json`. `restoreSession` además se niega a restaurar *dentro*
   de una ventana de incógnito, que abriría ahí las pestañas de la sesión normal.

Es **una sola** sesión para todas las ventanas de incógnito, como Chrome: si cada una tuviera la
suya, hacer login y abrir el sitio en otra ventana de incógnito volvería a pedirlo.

### `prepararSesion()`: la trampa que costó encontrar

Todo lo que hace navegable una sesión —UA de Chrome, Client Hints, adblocker, permisos,
`getDisplayMedia`, descargas— se enganchaba **una vez al arrancar**, sobre `persist:titanio`. Una
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

## Perfiles

[`src/main/perfiles.ts`](../src/main/perfiles.ts). Por perfil van cookies/sesión web
(`persist:titanio-<id>`), historial, marcadores, favicons, permisos y las pestañas abiertas.
Compartidos siguen el vault, las conexiones de IA, los chats del agente y el consumo.

### La decisión que se ahorró una migración entera

**La carpeta del perfil por defecto es la raíz de `userData`**, no `userData/perfiles/default`.
Así los `history.json`, `bookmarks.json` y `favicons.json` que el usuario ya tiene siguen
exactamente donde están y siguen siendo los suyos. Con la otra opción, el día de la
actualización habría abierto la app y la habría visto en blanco sin que nada explicara por qué.

`rutaDePerfil(fichero)` es el único sitio donde se decide eso. **Lo que no pasa por ahí es, por
definición, compartido entre perfiles** — y el vault no pasa, a propósito.

### Cambiar de perfil reinicia la app

Consecuencia directa de "un solo perfil activo". Media docena de módulos leen su JSON UNA vez al
arrancar (historial, marcadores, favicons, permisos); cambiarlos en caliente pediría inventarse
un `reinit` en cada uno para ahorrarle al usuario un segundo. `cambiarDePerfil` guarda la sesión
de pestañas, `app.relaunch()` y fuera. Cada perfil restaura la suya, así que no se pierde nada.

Por lo mismo, `initProfile()` es **lo primero** del `whenReady`: si `initPermissions`,
`initBookmarks` o `initHistory` corrieran antes, abrirían los ficheros del perfil por defecto y
el usuario vería los datos de otro perfil.

### Borrar un perfil no borra sus datos

Sale de la lista; su carpeta se queda. Un click no puede tirar meses de historial y marcadores
sin vuelta atrás. El diálogo se lo dice al usuario con esas palabras, así que hay un test que
comprueba que el código lo cumple. Si algún día hay un "borrar también los datos", será una
decisión aparte y explícita.

El perfil por defecto no se puede borrar: es donde viven los datos de antes de que hubiera
perfiles.

### Cómo se prueba

`perfiles.ts` recibe su carpeta base en `initPerfiles(baseDir)` en vez de pedírsela a `app`.
Eso es lo que permite que [`tests/perfiles.spec.ts`](../tests/perfiles.spec.ts) —17 tests: ids
que chocan, activo colgado, JSON corrupto, migración del `profile.json` viejo— corra **sin
levantar Electron**, en medio segundo. Misma idea que `precios.ts` con la aritmética del dinero.

El primer intento no fue así: llamaba a `require('./perfiles.js')` dentro de `app.evaluate`, y
ahí **no hay `require`**. La lección se repite (ya había pasado en `incognito.spec`): si algo
merece tests de verdad, sácale la dependencia de Electron en vez de pelearte con el arnés.

### Personalización por perfil (septiembre 2026)

General y el botón de configuración del perfil activo abren **Perfiles**. Allí se puede
crear, renombrar, personalizar o quitar un perfil, sin tener que activarlo para editarlo.
La foto, icono y color se reflejan en la tarjeta, el sidebar y el menú nativo.

`perfiles.json` guarda `preferences`: color, icono, tinte del tema, inicio, nueva pestaña,
buscador, instrucciones del agente, modelo predeterminado y habilitación de control del
navegador, skills y MCP. Los temas usan el tinte existente; no cambian las capas ni esquinas
de la vista nativa. El buscador seleccionado se aplica a la barra, sugerencias y menú de
selección; Google solo recibe consultas de sugerencias cuando es el buscador elegido.

`panels.json`, `chat.json`, `skills-enabled.json` y `mcp-servers.json` pasan por `rutaDePerfil`.
La raíz sigue perteneciendo al perfil predeterminado y conserva su configuración anterior.
Los perfiles nuevos parten de preferencias propias. La biblioteca de skills sigue siendo
compartida; su activación es independiente. La configuración y activación de MCP se edita
desde la sección MCP del perfil activo.

Las instrucciones se incluyen al construir el agente. Las categorías desactivadas se
retiran de las herramientas disponibles; MCP desactivado tampoco inicia sus servidores al
enviar un mensaje. El modelo predeterminado identifica tanto la conexión como el modelo.
Sin predeterminado, se recuerda la última selección de ese perfil.

Al cambiar de perfil se guarda la sesión **antes** de activar el destino. La ruta de la
sesión cargada queda fijada hasta cerrar el proceso para que `before-quit` no escriba las
pestañas de origen en el destino. Los IDs nuevos tampoco reutilizan carpetas de perfiles
retirados: conservar sus datos no debe hacer que reaparezcan en un perfil recién creado.

`pnpm test:profiles` verifica migración, persistencia, aislamiento de rutas y modelos,
buscadores y filtrado de herramientas sin abrir Electron. El borrado físico de datos
continúa siendo una operación pendiente y separada.
