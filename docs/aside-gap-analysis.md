# Titanio vs. Aside — Análisis de brechas

Comparativa entre nuestra arquitectura actual y la que describe Aside en
*"How we built the SOTA browser agent that outperforms Fable"*, con foco en lo
que nos falta (REPL, coding agent, etc.) y una ruta priorizada.

Fuente: https://aside.com/blog/how-we-built-the-sota-browser-agent-that-outperforms-fable

---

## 1. Diferencia de filosofía (la más importante)

| | **Aside** | **Titanio (hoy)** |
|---|---|---|
| Paradigma | **Coding agent**: el modelo *escribe código* (Playwright JS) en un **REPL** | **Tool-calling clásico**: el modelo llama tools discretas (`click(ref)`, `type`, …) |
| Interfaz principal | Un REPL de JavaScript ejecutando Playwright | ~20 tools Zod en Mastra (`buildTools` en [mastra.ts](../src/main/agent/mastra.ts)) |
| Racional | *"¿Qué han visto más los LLMs? Código."* Alinear con los datos de entrenamiento | Acciones atómicas fáciles de describir y validar |
| Techo de capacidad | Alto: rellenar formularios complejos, inspeccionar un video frame a frame, **llamar APIs internas del sitio** | Limitado a lo que expone cada tool; una tarea nueva = una tool nueva |

> Esta es la brecha estructural. Todo lo demás se deriva de aquí. Aside no
> tiene una "tool de scroll" o "tool de click": tiene *una* superficie (código)
> con la que el agente hace **cualquier cosa** que Playwright permita.

---

## 2. Tabla de capacidades

| Capacidad | Aside | Titanio | Nota |
|---|:---:|:---:|---|
| REPL / ejecución de código | ✅ | ❌ | **Brecha #1** — el usuario la señaló |
| `bash` / sandbox | ✅ | ❌ | Entorno de ejecución aislado |
| Wrapper propio sobre CDP ("Asidewright", −80% tokens) | ✅ | ⚠️ | Usamos `executeJavaScript` + `sendInputEvent` de Electron ([page.ts](../src/main/agent/page.ts)), sin capa optimizada |
| Árbol de accesibilidad podado (−70% tokens, focus/iframe/clickability) | ✅ | ⚠️ | Nuestro `snapshot` es un `querySelectorAll` plano de selectores interactivos |
| Visión (screenshot + click por coordenadas) | ✅ | ✅ | `screenshot` + `click_at` ya existen |
| Compaction (gestión de contexto en tareas largas) | ✅ | ❌ | Solo subimos `maxSteps=40` |
| Hooks (interceptar cada paso) | ✅ | ❌ | — |
| Skills | ✅ | ✅ | SKILL.md ya integrado (`use_skill`) |
| Memoria persistente | ✅ (implícito) | ❌ | Sin memoria entre sesiones/tareas |
| Captura de red → reverse-engineering de APIs | ✅ | ❌ | *"requests idénticas a las del sitio, no lo marcan como bot"* |
| Señales asíncronas (popups, downloads, cierre de tab) como *steering* | ✅ | ⚠️ | Manejamos popups en `setWindowOpenHandler`, pero **no** se los reportamos al agente |
| Aislamiento de tabs de fondo (no roban foco) | ✅ (parche a Blink) | ❌ | Nuestras tabs del agente son la vista activa |
| Viewport fijo 1440×900 para tabs de fondo | ✅ | ❌ | Consistencia con datos de Computer Use |
| Anti-detección de bots (Chromium modificado) | ✅ | ⚠️ | Solo limpiamos el User-Agent |
| System prompt mínimo (~10K) | ✅ | ❌ | El nuestro es verboso (persistencia, listas de tools) |
| "Nunca dejar que la IA escriba prompts" | ✅ | — | Filosofía a adoptar |
| Model-agnostic | ✅ | ✅ | anthropic + openai vía `@ai-sdk` |
| Sub-agentes / paralelismo | ⚠️ | ❌ | No explícito en el post, pero implícito |
| Harness de evaluación / benchmarks | ✅ (Mind2Web 99%, Odyssey, BU-Bench) | ❌ | Sin forma de medir regresiones |

Leyenda: ✅ tiene · ⚠️ parcial/tangencial · ❌ falta

---

## 3. Brechas en detalle + recomendación

### 3.1 REPL / coding agent  — **prioridad máxima**
**Qué hacen ellos:** el agente escribe JS (Playwright) que se ejecuta en un REPL
persistente; el estado (variables, handles) sobrevive entre pasos.

**Qué tenemos:** tools atómicas. Cada capacidad nueva exige código nuestro.

**Cómo cerrarlo en Titanio:**
- Añadir una tool `run_js({ code })` que ejecute en la pestaña activa vía
  `wc.executeJavaScript(code, true)` y devuelva el valor serializado (ya usamos
  ese mecanismo en [page.ts](../src/main/agent/page.ts) para todo).
- Dar un **contexto persistente**: envolver el código en una función que reciba
  un objeto `page` con helpers (`page.click`, `page.type`, `page.$$`,
  `page.waitFor`, `page.fetch`) — nuestra propia mini-"Asidewright" sobre
  `executeJavaScript`/`sendInputEvent`. No necesitamos Playwright real; basta un
  API con la *misma forma* para aprovechar el conocimiento del modelo.
- Persistir variables entre llamadas guardando un scope (p. ej. `globalThis.__titanio`)
  en la página, o manteniendo un string de "preámbulo" acumulado.
- Riesgo/seguridad: es ejecución arbitraria en la página del usuario. Mantener
  el gate de acciones sensibles del system prompt y considerar allow-list.

> Nota: esto **no** obliga a tirar las tools actuales. Se puede ofrecer `run_js`
> como súper-tool y dejar las atómicas como atajos. Migración incremental.

### 3.2 Árbol de accesibilidad podado (tokens)
**Ellos:** a11y tree modificado, −70% tokens, con señales de focus, iframe id y
clickability, sin truncar.

**Nosotros:** `SNAPSHOT_JS` hace `querySelectorAll` de una lista de selectores y
enumera refs. Es plano y no reporta focus/iframe/visibilidad real.

**Recomendación:** evolucionar `snapshot` para (a) usar el AXTree real (vía
`Accessibility.getFullAXTree` de CDP, accesible con `wc.debugger`), o (b)
enriquecer el snapshot actual con: estado de foco, si está en viewport, id de
iframe, y colapsar contenedores redundantes. Medir tokens antes/después.

### 3.3 Compaction / contexto de tareas largas
**Ellos:** compaction propia. **Nosotros:** nada; a los 40 pasos cortamos.

**Recomendación:** al acercarse a un umbral de tokens/pasos, resumir los
`tool-result` viejos (sobre todo `read_page` y `screenshot`, que son enormes) a
un resumen textual y descartar los originales del historial que mandamos a
`agent.stream`. Es un `map` sobre `opts.messages` antes de llamar al modelo.

### 3.4 Captura de red → APIs internas
**Ellos:** capturan requests y reusan las APIs internas del sitio → rápido y no
los detectan como bot.

**Recomendación:** exponer al agente el tráfico de red de la pestaña
(`wc.debugger` + `Network.requestWillBeSent`/`responseReceived`, o
`webRequest`), con una tool `list_requests` / `replay_request`. Encaja perfecto
con el REPL (3.1): el agente hace `page.fetch(...)` replicando headers/cookies.

### 3.5 Señales asíncronas como *steering*
**Ellos:** popups, downloads y cierres de tab llegan al agente como mensajes.

**Nosotros:** los manejamos a nivel de ventana pero el agente no se entera.

**Recomendación:** encolar estos eventos y **inyectarlos** como un `tool-result`
sintético o un mensaje de sistema en el siguiente turno del loop en `runMastra`.

### 3.6 Tabs de fondo aisladas + viewport fijo
**Ellos:** parchearon Blink para que las tabs del agente no roben foco ni abran
popups, y renderizan a 1440×900 fijo.

**Nosotros:** las tabs del agente son la vista visible; abrir/cambiar tab
interrumpe al usuario.

**Recomendación (sin parchear Chromium):** crear `WebContentsView` "de fondo"
fuera de pantalla con tamaño fijo 1440×900 para el trabajo del agente, y solo
promoverlas a visibles cuando el usuario lo pida. Permite paralelismo real.

### 3.7 Anti-detección
**Ellos:** Chromium modificado (técnicas de Browserbase/Browser Use).

**Nosotros:** solo UA limpio.

**Recomendación:** de menor a mayor esfuerzo — ocultar `navigator.webdriver`,
normalizar `navigator.plugins`/`languages`, timing humano en `sendInputEvent`
(pequeños delays/movimientos), y preferir el camino de APIs internas (3.4) que
directamente evita la detección de UI.

### 3.8 Prompt mínimo
**Ellos:** *"instrucción mínima → más inteligencia"*; ~10K tokens; nunca dejan
que la IA escriba prompts.

**Nosotros:** `SYSTEM` en [mastra.ts](../src/main/agent/mastra.ts) es largo
(persistencia, catálogo de tools, skills, settings).

**Recomendación:** con un REPL, gran parte del catálogo de tools desaparece del
prompt. Recortar a: estado actual claro + reglas de seguridad + "escribe código".
A/B contra tareas reales; menos instrucción suele reducir alucinaciones.

### 3.9 Harness de evaluación
**Ellos:** miden en Mind2Web (99%), Odyssey, BU-Bench.

**Nosotros:** sin medición → no sabemos si un cambio mejora o rompe.

**Recomendación:** un set pequeño de tareas repetibles (10–20) con verificación
automática, corrido en las tabs de fondo (3.6). Es lo que permite iterar en 3.1–3.8
sin volar a ciegas.

---

## 4. Ruta priorizada — estado

1. ✅ **REPL `run_js` + librería `titaniowright`** (paquete publicable en `packages/titaniowright`, API tipo Playwright sobre transport intercambiable; adaptador Electron). Tool `run_js` con `page`/`state`/`log`.
2. ✅ **Snapshot de accesibilidad podado** con role/name/estado/refs (`page.snapshot()` en titaniowright).
3. ✅ **Captura de red + replay** (`page.resourceRequests`, `installNetworkCapture`/`capturedRequests`, `page.fetch` desde el contexto de la página → API interna con cookies del sitio).
4. ✅ **Compaction** de historial (`compactHistory` en `runMastra`).
5. ✅ **Señales asíncronas → steering** (popups/descargas → `[EVENTOS DEL NAVEGADOR]` adjunto a las observaciones).
6. 🟡 **Agent tabs** — hecho: sección "Agent tabs" en el sidebar (tabs propias del agente), leyenda inferior "Titanio is controlling this tab" + botón **Take over** (aborta el agente) mientras controla la pestaña activa (franja reservada en la vista nativa). Pendiente: render **offscreen 1440×900** de verdad para que no roben foco al usuario.
7. ⬜ **Harness de eval** para medir todo lo anterior. — pendiente
8. ⬜ **Recorte del system prompt** una vez el REPL absorba las tools. — pendiente

## 5. Lo que ya tenemos alineado
- Visión (screenshot + click por coordenadas).
- Skills (SKILL.md + `use_skill`).
- Model-agnostic (anthropic/openai reales, con visión correcta tras el fix de mime).
- Manejo de popups/OAuth, permisos por origen, UA limpio, adjuntos de imagen.
- Tools de settings (perfil, skills, abrir Settings).
