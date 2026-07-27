# Adblocker

Bloqueo de anuncios y rastreadores **a nivel de red**, en el main. Vive en
[`src/main/adblock.ts`](../src/main/adblock.ts) y se engancha en la sesión `persist:monper`
justo después de `configurePasskeys()`, antes que nada que pueda navegar.

## Por qué así

**Por qué no una extensión (uBlock Origin).** Electron no implementa
`declarativeNetRequest`, que es de lo que depende uBO Lite en MV3. Las extensiones con APIs
bloqueantes no pueden funcionar aquí — es la misma razón que ya está anotada en el CLAUDE.md.

**Por qué no un motor propio.** Interceptar la petición es lo fácil; lo difícil es hacer
*matching* de decenas de miles de filtros con la sintaxis de uBO/EasyList sin que cada
petición cueste milisegundos. Se usa `@ghostery/adblocker-electron`, del mismo linaje que
uBlock y el bloqueador de Brave.

**Por qué solo red, sin filtros cosméticos.** La parte cosmética (ocultar el hueco que deja
el anuncio) exige inyectar CSS/JS en cada página del usuario: superficie nueva dentro de las
pestañas, en un producto cuyo argumento es que el agente nunca ve lo que no debe. Primero lo
que no puede romper nada. Consecuencia visible y asumida: **algunos sitios se quedan con el
hueco vacío**, y eso se dice en Settings en vez de dejar que parezca un fallo.

El paquete ya usa `registerPreloadScript` (no el `setPreloads` deprecado), así que cuando se
quiera añadir la cosmética no hay deuda de API que pagar — solo la decisión de producto.

**El agente también navega sin anuncios.** `agent/headless.ts` usa la misma partición. No es
un efecto colateral, es parte del motivo: menos DOM que leer y páginas más rápidas para el
agente.

## Trampas

- **Electron admite UN listener por sesión y evento.** Registrar otro `onBeforeRequest` sobre
  `persist:monper` **desactiva el del adblocker sin error ni aviso**. Si hace falta otro
  interceptor, tiene que encadenarse dentro de `enganchar()`, nunca registrarse aparte.
- **La allowlist NO puede salir del referrer.** `Request.sourceHostname` de Ghostery se
  rellena con el `referrer`, que llega vacío o recortado según la política de la página: la
  excepción por sitio habría fallado justo en los sitios que cuidan su referrer. Se resuelve
  con `webContents.fromId(details.webContentsId).getURL()`, que es la página que el usuario
  tiene delante — la que él cree estar permitiendo. Además, el `Request` público solo guarda
  *hashes* del origen, así que ese campo ni siquiera está disponible.
- **La allowlist se consulta con el sitio de la pestaña, no con el del recurso.** Un anuncio
  en `ejemplo.com` viene de un tercero; comparar contra el host del recurso haría que
  "desactivar aquí" no sirviese de nada.
- **La caché del motor no es opcional.** Sin ella, cada arranque son varios MB de listas
  descargadas y parseadas, y las primeras páginas se pintan CON anuncios: exactamente lo que
  el usuario nota. Se guarda en `userData/adblock/engine.bin`; las listas se refrescan cada
  12 h por detrás.
- **Los listeners se registran antes de que el motor exista.** `initAdblock` engancha primero
  y rellena `blocker` cuando termina de cargar. Al revés, las peticiones de la primera página
  pasarían sin filtrar.
- **El main frame nunca se bloquea.** Cargar la página que el usuario pidió no es negociable;
  además es el momento en que se reinicia el contador de esa pestaña.

## Privacidad

Descargar las listas le revela nuestra IP al CDN, y nada más: **el matching es 100% local**,
así que qué páginas visitas no sale de la máquina. Es la misma línea que se trazó con los
favicons (ver [`src/main/favicons.ts`](../src/main/favicons.ts)): un tercero puede vernos
pedir un recurso genérico, nunca la navegación.

## Superficie

| Dónde | Qué |
|---|---|
| `userData/adblock.json` | `{ enabled, allow[] }` vía `jsonfile.ts` |
| `userData/adblock/engine.bin` | Motor compilado (caché) |
| `adblock:state` / `adblock:enable` / `adblock:allow` | IPC, todos con `isInternalSender` |
| Settings → Adblocker | `AdblockSection.tsx`: interruptor global y lista de excepciones |
| Popover del dominio | "Bloquear anuncios aquí" + nº de bloqueos de esa página |

El interruptor del popover está **invertido** respecto a lo que se guarda: dice "bloquear
aquí" y lo que persiste es la *excepción*. Apagarlo recarga la pestaña a propósito — los
recursos ya bloqueados no vuelven solos, y quien lo apaga lo hace porque la página está rota
ahora.
