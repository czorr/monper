# Monper — Endurecimiento para ser un browser confiable y optimizado

Auditoría de lo que falta para pasar de "prototipo que funciona" a navegador
confiable. Verificado contra el código (no hay manejo de crashes, errores de red,
certificados, ni descartes de tabs; los permisos se auto-conceden).

Prioridad: **P0** bloquea "confiable" · **P1** importante · **P2** esperado/pulido.

---

## P0 — Confiabilidad (una página rota no debe romper la experiencia)

1. **Crash del renderer** — `webContents.on('render-process-gone')`. Hoy: la
   pestaña queda **en blanco/gris** para siempre. Falta: UI "Esta página se cerró
   inesperadamente" + botón Recargar (página interna `error.html`).
2. **Páginas de error de red** — `did-fail-load` (offline, DNS, conexión
   rechazada, timeout). Hoy: **blanco**. Falta: interstitial con el código de
   error y Reintentar. Distinguir `errorCode` (−106 offline, −105 DNS, etc.).
3. **Errores de certificado** — `certificate-error` / `session.setCertificateVerifyProc`.
   Hoy: Electron bloquea por defecto → **blanco sin explicación**. Falta:
   interstitial "Conexión no privada" con detalle y (opcional, gateado) continuar.
4. **Página no responde** — `unresponsive` / `responsive`. Falta: aviso
   "La página no responde" con Esperar/Cerrar.

> Sin esto, cualquier caída de red o pestaña que crashea deja al usuario con una
> vista muerta y sin feedback. Es lo primero.

## P0 — Seguridad (hoy es permisiva de más)

5. **Permisos auto-concedidos.** `permissions.ts` hace `callback(true)` para
   cámara/micrófono/geolocalización/notificaciones/portapapeles **sin preguntar**.
   Un browser confiable **pide permiso** (prompt por origen, recordar decisión).
   Es el hueco de seguridad más serio. Falta: prompt nativo o UI de permiso, y
   denegar por defecto lo sensible.
6. **Navegaciones peligrosas** desde contenido web: bloquear `file://`,
   `chrome://` y esquemas raros iniciados por páginas; validar `will-navigate`.

## P1 — Sesión y datos (lo que se espera "de un browser")

7. **Restaurar pestañas al reabrir.** Hoy solo persistimos tamaño/posición de
   ventana. Falta: guardar las URLs abiertas + activa y restaurarlas al arrancar
   (con las agent tabs excluidas o marcadas).
8. **Reabrir pestaña cerrada (⌘⇧T)** — pila de cerradas recientes.
9. **Gestor de descargas real.** Hoy `will-download` solo notifica al agente y
   "Downloads" abre la carpeta. Falta: progreso, cancelar/pausar, ubicación,
   lista, y confirmación para ejecutables (regla de seguridad).
10. **Historial navegable.** Registramos visitas para el autocomplete pero no hay
    página/menú de historial.

## P2 — Rendimiento / escala

11. **Descartar tabs en segundo plano.** El modelo actual mantiene **todas** las
    vistas vivas y compuestas (para cambio instantáneo). Con muchas pestañas eso
    es RAM + CPU lineales. Falta: *warm set* LRU (mantener vivas las últimas N,
    ocultar el resto) y **descartar/dormir** tabs inactivas tras X min
    (recargarlas al volver). Es la contraparte pendiente de la optimización de
    switch instantáneo.
12. **Cache de favicons.** `BookmarkRow` pega al servicio de Google en cada
    render; cachear a disco/memoria y preferir el favicon real de la página.
13. **Límite/telemetría de procesos.** Cada WebContentsView es un proceso;
    medir memoria y considerar reúso cuando el warm set esté hecho.

## P2 — UX esperado

14. **Buscar en página (⌘F)** — `webContents.findInPage`.
15. **Zoom por sitio (⌘+ / ⌘− / ⌘0)** — `setZoomLevel`, recordar por origen.
16. **Menú contextual del contenido** (click derecho en la página): copiar/pegar,
    atrás/adelante, "Inspeccionar elemento", copiar dirección de enlace/imagen.
    Hoy no existe (solo el de las tabs).
17. **Indicador de progreso de carga** (barra fina en el topbar).
18. **⌘1..9** para saltar de pestaña; **reordenar** tabs (drag); abrir la nueva
    pestaña **junto** a la actual, no al final.
19. **Spellcheck** en inputs (`session` webPreferences).

---

## Orden recomendado

1. **P0 confiabilidad** (1–4): páginas de error/crash/cert/no-responde. Máximo
   impacto percibido, evita "vista muerta".
2. **P0 seguridad — permisos** (5): dejar de auto-conceder; prompt por origen.
3. **P1 sesión** (7–8): restaurar pestañas + reabrir cerrada.
4. **P2 rendimiento — descarte de tabs** (11): acota el costo del keep-alive.
5. **P1 descargas** (9) y **P2 UX** (14–18) en paralelo según prioridad tuya.

Los primeros cuatro puntos convierten a Monper de "funciona" a "confiable"; el
resto es el pulido que se espera de un navegador diario.


## Favicons: se acabó el servicio de Google

Los marcadores sin icono propio, las sugerencias del omnibox, los pasos del agente y el
prompt de "iniciar sesión con…" pedían el favicon a `google.com/s2/favicons?domain=…`.

Dos problemas, uno visual y otro de fondo:

- **Ese servicio normaliza los iconos**: los devuelve compuestos sobre un fondo opaco. GitHub
  aparecía con un recuadro que en la web no tiene. Fue el síntoma por el que se miró.
- **Le mandaba a Google un dominio por cada marcador**, por cada sugerencia del omnibox, por
  cada paso del agente y —lo peor— **por cada sitio donde el usuario guarda contraseñas**.
  En un navegador cuyo argumento es que no filtra lo que haces.

Ahora hay una caché por host en [`src/main/favicons.ts`](../src/main/favicons.ts), alimentada
con el icono real que Chromium ya reporta en `page-favicon-updated`. Si un sitio no se ha
visitado todavía no hay icono y la UI cae a su globo local. **Nunca a un tercero.**

Los marcadores **de fábrica** no se quedan sin icono mientras tanto: llevan el logo de marca
en SVG ([`SeedFavicon.tsx`](../src/renderer/src/components/browser/SeedFavicon.tsx)), sacado
de `simple-icons`, que ya estaba en el bundle por los proveedores de IA. Los de marca oscura
(GitHub, X) se pintan en blanco, porque sobre el chrome oscuro no se verían.

El orden es: **favicon real del sitio → logo de marca empaquetado → globo**. En cuanto visitas
el sitio, el real gana y el de marca deja de usarse.
