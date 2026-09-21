# Diagnóstico de Titanio y plan de trabajo

Auditoría del 24 jul 2026. Escrito para dejar de discutir sensaciones y trabajar sobre datos.

---

## 1. Los números

| | |
|---|---|
| Código | 10,897 líneas · 118 archivos |
| **Tests** | **0** |
| **CI** | **ninguno** |
| **Empaquetado / firma** | **no existe** → nadie más puede instalarlo |
| Errores tragados (`catch {}` que descartan) | **34** |
| Ventanas nativas hechas a mano | **9** |
| Diseños de panel distintos | **6** |
| Clases de "row" distintas | **5** |
| Archivos JSON de estado | **16**, sin versión ni migración |
| `src/main/index.ts` | **1,726 líneas** (god file) |
| Ventanas soportadas | **1** (no hay multi-ventana) |

## 2. Lo que NO es el problema

Las features no son amateur. Estas piezas están bien y algunas por encima del estándar comercial:

- **`titaniowright`**: librería de automatización con *transport* intercambiable (Electron hoy, CDP mañana). Publicable.
- **REPL como superficie del agente** (coding agent), en lugar de una tool por acción.
- **Vault**: el secreto se inyecta desde el main; **el agente nunca lo ve**. Difícil de copiar y es un argumento de confianza real.
- **Rutinas** con extractores generados una vez → **$0 de LLM por corrida**, con auto-reparación.
- Skills (SKILL.md), quick actions con `{{selection}}`, warm-set de pestañas, restauración de sesión.

## 3. Lo que SÍ es amateur

1. **No podemos distribuirlo.** Sin `electron-builder`, firma, notarización ni auto-update, Titanio no es un producto: es un repo que corre en una máquina.
2. **Cero tests.** Las esquinas redondeadas se rompieron 3 veces en un día; el sistema de CI eras tú mirando la pantalla. Y la ironía: construimos una librería para automatizar navegadores.
3. **34 `catch` que descartan el error.** No es estilo: fue la causa raíz de 3 bugs reales (el falso "límite de pasos", las sugerencias colgadas, el instalador mudo). Patrón: *promesa sin timeout + catch vacío = fallo invisible*.
4. **9 ventanas nativas sin abstracción**, cada una con su propio diseño y sus propios bugs de foco/hover. **← se ataca ahora**
5. **16 JSON de estado** sin schema ni migración: el primer cambio de formato corrompe datos del usuario.
6. **God file de 1,726 líneas** en el main.

## 4. La decisión estratégica

> No vamos a competir contra un navegador completo. Chrome tiene +1000 ingenieros.
> Arc levantó ~$128M, tuvo ~100 personas y **mató su propio navegador** para pivotar.

**Titanio no es un navegador: es un puesto de trabajo agéntico que además renderiza páginas.**
El único foso real es lo que Chrome estructuralmente no puede hacer: **un agente que ya vive
dentro de tus sesiones**. Eso no lo replican los agentes en la nube porque no tienen tus cookies.

### Se elimina del roadmap (y se dice honestamente en Settings)

| Descartado | Por qué |
|---|---|
| **Extensiones** | Electron no implementa `declarativeNetRequest`, `contextMenus` ni `action`. Probado: AdBlock instala pero su background muere en el primer `addListener`. Es un *non-goal* declarado de Electron. |
| **Passkeys** | Requiere cuenta de Apple Developer + firma. Bloqueado y de bajo valor ahora. |
| **Perfiles / incógnito / historial con UI** | Son features para *reemplazar* Chrome. No es el objetivo. |
| **Bloqueo de anuncios vía extensión** | Imposible. Si se quiere, se hace **nativo** con `webRequest` del main. |

---

## 5. Tareas, por criticidad

### P0 — Consistencia y fundamentos (ahora)

- [ ] **Abstracción de popovers** — una factoría en el main (`createPopover`) + primitivas de UI
      compartidas (`PopoverPanel`, `PopoverRow`, `PopoverLabel`, `PopoverDivider`).
      Elimina 6 diseños de panel y 5 clases de row. **← en curso**
- [ ] Migrar las ventanas a la abstracción: site-info, profile menu, extensions, vault, sign-in.
- [ ] Barrer los 34 `catch` vacíos: loguear o propagar, nunca descartar.
- [ ] Timeout obligatorio en toda promesa que envuelva I/O (ya se arreglaron 3; falta auditar el resto).

### P0 — Poder distribuirlo

- [ ] `electron-builder`: appId, icono, DMG.
- [ ] Firma + notarización (necesita cuenta de Apple).
- [ ] Auto-update (`electron-updater`).

### P0 — Poder verificarlo

- [ ] Playwright sobre Electron: 15 pruebas de humo (abrir/cerrar/cambiar pestaña, esquinas,
      omnibox, quick action, rutina, resize de paneles).
- [ ] CI en GitHub Actions: typecheck + build + smoke.

### P1 — El foso (producto)

- [ ] **Watchers**: botón "Vigilar esta página" en el topbar (fase 2 de rutinas).
- [ ] **Skills por demostración**: grabar una tarea → el agente escribe el SKILL.md parametrizado.
- [ ] Recibos verificables del agente: qué tocó, dry-run, undo.

### P2 — Deuda técnica

- [ ] Partir `main/index.ts` en módulos (tabs, ventanas, ipc, layout).
- [ ] Unificar los 16 JSON en un store con versión y migración.
- [ ] Multi-ventana.
- [ ] Memoria: techo real de pestañas vivas (hoy warm set de 8, sin límite de RAM).

---

## 6. Notas de arquitectura que no hay que volver a romper

- **La vista nativa se dibuja ENCIMA del DOM.** Cualquier overlay sobre la página tiene que
  ser una ventana nativa. De ahí la abstracción de popovers.
- **Las muescas del redondeado nativo revelan lo que hay detrás**, y el `body` es transparente
  (vibrancy). Por eso el contenedor de contenido necesita una **base opaca**, y la franja con
  el color de la página va **solo arriba** (si cubre todo, se pierde el redondeado inferior).
- **El color del topbar se muestrea en la ESQUINA**, no promediando la franja: ese color rellena
  la muesca y debe coincidir con ese píxel.
- `setBorderRadius(radius)` acepta **un solo valor**: no hay redondeo por esquina.
