# Checklist de lanzamiento — producto

Lo que le falta a Titanio **como navegador que alguien usa a diario**. La deuda técnica y el
endurecimiento están en [browser-hardening.md](browser-hardening.md); esto es solo producto.

Auditado contra el código, no de memoria. Lo marcado como hecho está verificado.

---

## Bloqueante de negocio

- [ ] **Cuenta de Apple Developer.** Sin firma: Gatekeeper asusta al usuario en el primer
      contacto **y el auto-update no puede instalar** (macOS lo exige). Lanzar sin esto es
      lanzar sin poder arreglar nada después. No depende de código.

## P0 — Sin esto la gente no se cambia

- [x] **Importar de otro navegador.** Marcadores, historial y contraseñas, sin dependencias
      nuevas (`node:sqlite` viene en el Node de Electron). Solo se ofrecen los navegadores
      **instalados y con perfil**: desinstalar uno no borra su carpeta, y detectando solo el
      perfil se ofrecían navegadores que ya no existían.
      - [x] Marcadores (Chrome, Arc, Brave, Edge, Safari)
      - [x] Historial — con su fecha original
      - [x] **Contraseñas** — es el que más importa: el vault vacío desperdicia toda la tesis
            del producto. Con contraseñas importadas, el agente puede entrar en tus sitios el
            día 1; sin ellas, el usuario tiene que reconstruir su vida antes de ver para qué
            sirve Titanio.
- [x] **Historial navegable y buscable.** `history.html`, agrupado por día, con búsqueda,
      borrado por entrada y borrado total. Se llega con ⌘Y y desde el submenú de perfil.
      Restringido a páginas internas: es el registro de todo lo que has visitado.
      - [ ] Siguiente escalón: buscar por **contenido**, no solo por título y URL. Es media
            respuesta a "¿dónde vi ese benchmark?". OJO: esto **no** es *Memory* — se confundió
            una vez y se construyó lo que no era. Memory es lo que el agente aprende de ti
            (ver [memoria.md](memoria.md)); esto es indexar lo que TÚ leíste.

## P1 — Ausencias baratas que empujan a abrir Chrome "un momento"

- [x] **⌘P / Guardar como PDF.** En el menú Archivo y en el menú contextual de la página. En
      macOS el diálogo del sistema ya trae "Guardar como PDF", así que no hace falta un
      `printToPDF` aparte — que además nos obligaría a elegir carpeta y nombre, peor que el
      panel del sistema. Si falla se dice; cancelar no cuenta como fallo.
- [x] **Spellcheck.** `spellcheck: true` explícito y, sobre todo, **sugerencias en el menú
      contextual**: el subrayado ya salía, pero sin poder hacer nada con él había que borrar
      la palabra y reescribirla adivinando. Con "Añadir al diccionario".
- [x] **Gestor de marcadores.** Página propia (⌘⌥B) con búsqueda, renombrar y corregir la URL.
      Antes no había forma de arreglar un título malo sin borrar y volver a crear, perdiendo
      el orden.
      - [x] **Carpetas.** Plegables en el sidebar, decidido así porque es donde de verdad se
            usan los marcadores. `Bookmark` gana `folder`, `parentId` y `collapsed`; el árbol es
            de **un nivel** a propósito (el sidebar es estrecho: anidar dejaría los títulos en
            dos caracteres). Invariante heredada del reorden y ahora con test: **organizar nunca
            pierde un marcador** — borrar una carpeta devuelve lo de dentro a la raíz.
            El importador recrea las carpetas del navegador de origen, aplanando a un nivel:
            medido contra Brave, 79 marcadores en 7 carpetas.
- [x] **Multi-ventana (⌘N).** Hecho, las cinco rebanadas — ver [multiventana.md](multiventana.md).
      Se recomendaba dejarlo para después de lanzar por riesgo (toca layout, esquinas y peek);
      se hizo igual por decisión de producto: "es algo básico". Incluye sacar una pestaña a una
      ventana nueva **mudando** el `WebContentsView`, no recreándolo, para no perder el
      historial. La suite pasó de 118 a 124 en verde.
- [x] **Picture-in-picture de un vídeo.** Funciona sin código nuestro. **La comprobación
      anterior no valía**: se dio por bueno porque `document.pictureInPictureEnabled` era `true`
      y la API existía — o sea, se verificó la llamada y no el efecto, el mismo error que costó
      dos sesiones en las esquinas. Ahora `tests/pip.spec.ts` mete un vídeo real en PiP y
      comprueba `document.pictureInPictureElement`.
- [ ] **Document PiP** (el panel de controles flotante de Google Meet). **No se puede**:
      Electron 43 no lo implementa. `requestWindow()` rechaza con `Internal error: no window`
      en una pestaña, y en una `BrowserWindow` normal la promesa no se resuelve nunca — medido
      cinco veces. No es nuestra arquitectura de vistas, es un muro de Electron, como las
      extensiones. El test queda como chivato: avisa el día que Electron lo soporte.

## P2 — Lo que yo no haría, y por qué (pero queda escrito)

Estos son features para **reemplazar** Chrome, y el [diagnóstico](diagnostico.md) ya decidió
que ese no es el juego. Se listan para que la decisión sea explícita y no un olvido: si algún
día el argumento cambia, que se cambie a propósito.

- [x] **Ventana privada / incógnito.** Estaba aquí como "yo no lo haría"; el usuario decidió
      que sí, y el argumento de contra resultó ser flojo: incógnito no compite con tener tus
      sesiones, convive con ellas. Hecho — ver [incognito-y-perfiles.md](incognito-y-perfiles.md).
- [x] **Perfiles múltiples.** Igual. Un solo perfil activo, cambiar reinicia la app, y la carpeta
      del perfil por defecto sigue siendo la raíz de `userData` para no migrar nada.
- [ ] **Sync entre dispositivos.** Requiere servidor, cuentas y cifrado extremo a extremo —
      o sea, un producto entero más. Y choca de frente con "nada sale de tu máquina", que hoy
      es un argumento de venta.
- [ ] **Extensiones.** Técnicamente imposible en Electron (no implementa `declarativeNetRequest`,
      `chrome.contextMenus` ni `chrome.action`). No es una decisión: es un muro. El adblocker
      por eso se hizo nativo.
- [ ] **Traducir página.** Sin API de traducción propia, implica mandar el contenido de lo que
      lees a un tercero. Es justo lo que el producto promete no hacer.

## Hecho (verificado en código, para no perseguirlo)

Reabrir pestaña cerrada (⌘⇧T) · Buscar en página (⌘F) · Zoom por sitio · Restaurar sesión ·
Página de descargas · Permisos por sitio con su pantalla · Adblocker nativo con allowlist ·
Navegador predeterminado + enlaces de otras apps · Compartir pantalla en videollamadas ·
Página de error de red · Crash del renderer · Puente MCP en las dos direcciones ·
Autocompletado inline de la omnibox.

## Lo que no es código

- [ ] Política de privacidad. No es burocracia aquí: la omnibox manda cada pulsación a Google
      y el vault guarda secretos. Un navegador que se vende por privacidad tiene que decir
      exactamente qué sale de la máquina.
- [ ] Página de descarga.
- [x] **Qué ve el usuario cuando su API key falla o se queda sin crédito.** Era código, no
      redacción, así que se hizo. Antes el chat volcaba la cadena cruda del SDK
      (`HTTP 400 — {"type":"error",...}`): la información correcta con la forma equivocada.
      Ahora `diagnosticar()` clasifica en nueve tipos y cada uno dice **qué hacer** — sin
      crédito lleva a tu saldo del proveedor, key inválida a Settings → AI, rate limit a
      esperar y ya. El error crudo sigue ahí, plegado, o un caso mal clasificado sería
      imposible de depurar. Diez tests con los payloads REALES de Anthropic y OpenAI.

      Las dos trampas que justifican los tests: Anthropic manda el crédito agotado como
      **400** (no 402), y OpenAI lo manda como **429**, el mismo status que un rate limit.
      Clasificar por código diría "espera unos segundos" a quien puede esperar un año.
