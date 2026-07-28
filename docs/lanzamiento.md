# Checklist de lanzamiento — producto

Lo que le falta a Monper **como navegador que alguien usa a diario**. La deuda técnica y el
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
            sirve Monper.
- [x] **Historial navegable y buscable.** `history.html`, agrupado por día, con búsqueda,
      borrado por entrada y borrado total. Se llega con ⌘Y y desde el submenú de perfil.
      Restringido a páginas internas: es el registro de todo lo que has visitado.
      - [ ] Siguiente escalón (*Memory*): buscar por **contenido**, no solo por título y URL.
            Es media respuesta a "¿dónde vi ese benchmark?".

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
      - [ ] **Carpetas**: decisión de diseño pendiente, no olvido. Cambia el modelo de datos
            (hoy `Bookmark` es plano) **y** la UI del sidebar — plegar, arrastrar dentro. Con
            79 marcadores importados empieza a hacer falta, pero el sidebar es estrecho y la
            sección va capada a 35vh: conviene decidir la forma antes de escribirla.
- [ ] **Multi-ventana (⌘N).** `createWindow()` existe pero solo se llama una vez.
- [x] **Picture-in-picture.** Comprobado: `document.pictureInPictureEnabled` es `true` y
      `requestPictureInPicture` existe en las pestañas. Funciona sin código nuestro; el ítem
      se cierra sin escribir nada.

## P2 — Lo que yo no haría, y por qué (pero queda escrito)

Estos son features para **reemplazar** Chrome, y el [diagnóstico](diagnostico.md) ya decidió
que ese no es el juego. Se listan para que la decisión sea explícita y no un olvido: si algún
día el argumento cambia, que se cambie a propósito.

- [ ] **Ventana privada / incógnito.** La gente la busca por costumbre. Contra: es una
      partición de sesión aparte, y toda la propuesta de Monper es *tener* tus sesiones. Una
      ventana donde el agente no sabe quién eres es un agente inútil. Si se hace, que sea por
      una razón mejor que "Chrome lo tiene".
- [ ] **Perfiles múltiples.** Mismo argumento, más caro: multiplica particiones, vault e
      historial. Antes de esto viene multi-ventana.
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
- [ ] Qué ve el usuario cuando su API key falla o se queda sin crédito.
