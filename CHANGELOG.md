# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado: **semver**, pero pre-1.0 — mientras el primer número sea `0`, la segunda cifra sube
con cada tanda de novedades y la tercera solo con arreglos. La `1.0.0` llegará cuando se pueda
instalar de verdad: firmada, notarizada y con auto-update funcionando (ver
[docs/distribucion.md](docs/distribucion.md)).

Cada versión lleva su tag (`v0.2.0`). El número de `package.json` es el que compara
electron-updater, así que **subirlo es parte de publicar**, no un trámite posterior.

## [0.2.0] — 2026-08-02

Primera versión numerada de verdad. La `0.1.0` se quedó puesta 123 commits, así que esto
recoge todo lo que entró desde entonces.

### Navegador

- **Múltiples ventanas**, con pestañas que se arrastran de una a otra.
- **Perfiles e incógnito**, cada uno con su partición de sesión.
- **Gestor de historial** y **gestor de marcadores**, con carpetas y arrastre.
- **Importar** marcadores e historial desde otros navegadores.
- **Navegador por defecto**: Monper se declara para `http`/`https` y puede pedirlo.
- **Descargas** con su popover propio.
- Imprimir, corrector ortográfico, compartir pantalla en videollamadas.

### Vídeo

- **Pantalla completa** de verdad: la vista se come la ventana entera, sin chrome encima.
- **Picture-in-Picture propio**. El de Chromium no abre ninguna ventana bajo Electron, así que
  la ventana es nuestra: flota siempre encima, con esquinas redondeadas, vídeo limpio en reposo
  y controles al pasar por encima. Sale solo al dejar la pestaña. Ver [docs/pip.md](docs/pip.md).

### Privacidad

- **Adblocker** a nivel de red, con excepciones por sitio. También cubre al agente.
- **Permisos** (cámara, micrófono, ubicación…) en un popover anclado a la barra del dominio,
  en vez de un diálogo del sistema.
- **Identidad de Chrome coherente** (`Sec-CH-UA` + `navigator.userAgentData`), que es lo que
  arregla el "This browser or app may not be secure" al iniciar sesión con Google.

### Agente

- **Consumo**: qué se ha gastado, por día y por modelo, con precios reales.
- **Chats** en Settings, con búsqueda por contenido y archivado.
- **Errores de IA clasificados**: qué ha pasado y qué hacer, en vez del error crudo.
- **Vault** con su pantalla propia en Settings → Password.
- Servidor **MCP** para exponer tu web logueada a otras IAs.

### Omnibox

- Autocompletado con sugerencias enriquecidas: navegación con título, entidades con foto.
- Completado inline compartido entre la barra de direcciones y la new tab.

### Interno

- Se quitó el workflow de CI: el repo es privado y `macos-latest` cobra 10×. La suite se corre
  en local antes de entregar.

### Conocido

- Passkeys siguen apagadas: hace falta un provisioning profile, no solo el Team ID.
  Ver [docs/pendiente-passkeys-firma.md](docs/pendiente-passkeys-firma.md).
- Sin `Developer ID Application` no se puede notarizar, así que el DMG solo abre en este Mac.

## [0.1.0]

El principio: pestañas, chrome propio, agente, vault y skills.
