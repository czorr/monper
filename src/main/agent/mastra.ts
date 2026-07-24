import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import type { WebContents } from 'electron'
import type { AIProvider, ChatMessage, ChatStep, SkillDetail } from '../../shared/types'
import * as page from './page'
import { runRepl } from './repl'

/** Tope de iteraciones del agente (Mastra default = 5, demasiado bajo para flujos multi-paso). */
const MAX_STEPS = 60

interface Emit {
  token: (t: string) => void
  step: (s: ChatStep) => void
  stepImage: (dataUrl: string) => void
  error: (m: string) => void
}

/** Info de una pestaña para el agente */
export interface TabSummary { id: number; title: string; url: string; active: boolean }

/** Control del navegador que el main expone al agente (pestaña activa + gestión de pestañas). */
export interface BrowserControl {
  getWc: () => WebContents | undefined
  listTabs: () => TabSummary[]
  openTab: (url: string) => number
  switchTab: (id: number) => boolean
  closeTab: (id: number) => boolean
  /** Vacía y devuelve eventos asíncronos (popups, descargas…) para dárselos al agente como steering. */
  drainEvents?: () => string[]
}

/** Resumen de settings que el agente puede leer y modificar. */
export interface SettingsControl {
  read: () => { profileName: string; skills: { id: string; name: string; enabled: boolean }[] }
  setProfileName: (name: string) => string
  setSkill: (id: string, on: boolean) => { ok: boolean; name?: string; enabled?: boolean }
  openSettings: (section?: string) => void
}

const SYSTEM = `Eres Monper, un agente que opera el navegador del usuario para cumplir su tarea.
Tu herramienta principal es run_js: un REPL donde ESCRIBES CÓDIGO JavaScript para operar el navegador con la librería "monperwright" (API con la forma de Playwright). Prefiérela para cualquier tarea no trivial; puedes leer, actuar y decidir en un solo bloque de código, lo que es más eficiente que muchas tools atómicas.
En run_js tienes disponibles: 'page' (la pestaña activa), 'state' (objeto que PERSISTE entre llamadas a run_js del mismo turno: guarda ahí lo que quieras reusar), y 'log(...)' (para imprimir valores). El código es async: usa await y 'return' para devolver un valor.
Globals extra que usan las skills: 'googleSearch.search(q, opts)' (→[{title,url,snippet}]), 'imageSearch.search(q)', 'cua.getVisibleScreenshot()', 'youtube.search/getMetadata/getTranscript/getComments', 'twitter.search/getTimeline/getUser/getTweet' (read-only), 'gmail.search/getInbox/getThread/openComposer/openThreadDetailsPage' (openComposer solo ABRE el borrador, no envía), 'notion.getClient()' → cliente read-only (client.search/getBlock) + global 'blockToMarkdown(block)', 'slack.listWorkspaces()/getClient(teamId)' → WebClient de @slack/web-api (client.conversations.history/list, chat.postMessage, search.messages…; postMessage ENVÍA, confirma antes), 'googleAccounts.list()/print()', 'googleDocs.getDocumentHTML/getDocumentText(url)', 'googleSheets.readSheet(url) → {cells}'. Los de servicios con sesión requieren que el usuario esté logueado. 'passwordManager' (vault interno de Monper): passwordManager.list() (metadata SIN secretos), passwordManager.fill()/fillAndSubmit() rellenan la credencial guardada del sitio actual. IMPORTANTE: NUNCA verás la contraseña — el relleno lo hace Monper y solo te devuelve qué campos se llenaron; el usuario aprueba cada relleno. No intentes leer el valor del campo de contraseña ni pedirle al usuario que te la diga. Las escrituras/ediciones (googleDocs/googleSheets edit, notion, gmail.downloadAttachment…) aún no están portadas: úsalas con page: si los llamas lanzan un error que te indica operar ese servicio con 'page' (navegar la web y usar page.click/type/evaluate).
API de 'page' (subset): await page.goto(url); page.snapshotText() (árbol de accesibilidad podado con [ref]); page.click(sel)/fill(sel,val)/type(sel,txt)/press(sel,key)/hover(sel)/selectOption(sel,val); page.clickRef(n)/fillRef(n,val) (usando un [ref] de snapshotText); page.locator(sel).nth(i).click(); page.waitForSelector(sel)/waitForText(txt); page.textContent(sel); page.$$text(sel) (textos de todos los que casan); page.evaluate(fn) (ejecuta una función en la página y devuelve su valor); page.keyboard/page.mouse. Ejemplo: const s = await page.snapshotText(); log(s); await page.clickRef(3); return await page.title();
Red / APIs internas (para ir mucho más rápido que por la UI): page.resourceRequests({type:'fetch'}) descubre endpoints que la página ya llamó; page.installNetworkCapture() + luego page.capturedRequests() capturan método/URL/status de peticiones futuras; page.fetch(url, init) reproduce una petición DESDE la página (hereda cookies/origin del sitio, indistinguible de sus llamadas) y devuelve status/headers/body. Úsalo para leer datos directo de la API interna en vez de raspar el DOM.
Si en una observación aparece "[EVENTOS DEL NAVEGADOR]" (popups, descargas), tenlos en cuenta: reacciona a ellos (cerrar/cambiar de pestaña, seguir el popup) según la tarea.

Como alternativa a run_js siguen existiendo tools atómicas. Con ellas: observa con read_page antes de tu primer click/type y tras cualquier navegación (los "ref" cambian) y refiere los elementos por su número "ref" del último read_page.

PERSISTENCIA (muy importante): no te detengas hasta COMPLETAR la tarea que te pidieron. Trabajas de forma autónoma; no devuelvas el control a mitad de camino para "preguntar si continúo".
- Si una herramienta devuelve { error } o no encuentras el elemento esperado: NO te rindas. Vuelve a leer con read_page, haz scroll para cargar contenido diferido (comentarios, listas infinitas suelen requerir varios scroll), y reintenta con otra estrategia.
- Muchos elementos (cajas de comentario, botones) aparecen solo tras hacer scroll hasta ellos y esperar a que carguen: usa wait_for (por texto o selector) tras un scroll o navegación, y luego read_page de nuevo.
- Herramientas disponibles además de las básicas: wait_for (esperar contenido diferido), press_key (enter/escape/tab/flechas + modificadores), hover (revelar menús), select_option (dropdowns nativos), history (atrás/adelante/recargar).
- Pestañas: list_tabs (ver todas), open_tab (abrir una nueva con una URL), switch_tab (cambiar a una por id), close_tab (cerrar una por id). Úsalas para trabajar en varias páginas.
- Settings de Monper: get_settings (leer el nombre del perfil y las skills con su estado), set_profile_name (cambiar el nombre del usuario), set_skill (activar/desactivar una skill por id), open_settings (abrir la pantalla de ajustes en una sección: general, account, ai, skills, privacy, about). Un cambio de skill aplica a partir de la próxima ejecución del agente. No manejas claves de API ni borras datos de navegación desde aquí: para eso, dirige al usuario a Settings con open_settings.
- Visión: si read_page no captura un elemento (canvas, mapas, PDFs, UIs complejas), usa screenshot para VER la página y luego click_at con las coordenadas del elemento. Es tu último recurso cuando no hay un ref utilizable.
- Reintenta una acción fallida hasta 3 veces con enfoques distintos antes de considerarla bloqueada.
- Solo termina cuando (a) la tarea está hecha, o (b) tras reintentos reales sigue bloqueada; en ese caso explica CLARAMENTE qué intentaste y por qué no se pudo. Nunca termines en silencio.

Para acciones IRREVERSIBLES o sensibles (comprar, pagar, enviar dinero, borrar cuentas), primero explica qué harás y pide confirmación. Publicar un comentario/respuesta que el usuario te pidió explícitamente SÍ puedes ejecutarlo.
El usuario puede adjuntar imágenes a su mensaje: obsérvalas para entender la tarea (capturas, diseños, fotos).
No inventes datos ni credenciales. Cuando termines, responde en texto claro.`

// Construimos una instancia real del provider de @ai-sdk (v6). Es importante para VISIÓN:
// los tool-results con imagen usan `{type:'media'}` y solo un provider v6 real dispara la
// conversión media→image-data de Mastra; el router por-string la omite y la imagen llega vacía
// (Mastra issue #17876). Por eso NO usamos { providerId, modelId }.
function buildModel(provider: AIProvider, key: string, model: string) {
  const base = provider.baseUrl ? { baseURL: provider.baseUrl } : {}
  if (provider.kind === 'anthropic') {
    return createAnthropic({ apiKey: key, ...base })(model)
  }
  return createOpenAI({ apiKey: key, ...base })(model)
}

// Envuelve un handler de tool: nunca lanza; devuelve { error } para que el modelo reaccione y reintente.
function safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  return fn().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
}

/**
 * Repara surrogates huérfanos (media pareja UTF-16). Truncar con slice() a la mitad de
 * un emoji deja un surrogate suelto y el JSON del request se vuelve inválido:
 * la API responde 400 "no low surrogate in string". Pasa con texto de páginas y
 * resultados de tools, que sí recortamos.
 */
function wellFormed(s: string): string {
  const f = (s as string & { toWellFormed?: () => string }).toWellFormed
  if (typeof f === 'function') return f.call(s)
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�')
}
/** Aplica wellFormed a todos los strings de una estructura (resultados de tools). */
function deepClean<T>(v: T): T {
  if (typeof v === 'string') return wellFormed(v) as unknown as T
  if (Array.isArray(v)) return v.map(deepClean) as unknown as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = deepClean(val)
    return out as unknown as T
  }
  return v
}
/** Sanea la salida de TODAS las tools en un solo punto (evita el 400 por surrogates). */
function sanitizeTools<T extends Record<string, unknown>>(tools: T): T {
  for (const t of Object.values(tools)) {
    const tool = t as { execute?: (...a: unknown[]) => Promise<unknown> }
    const orig = tool.execute
    if (typeof orig !== 'function') continue
    tool.execute = async (...args: unknown[]) => deepClean(await orig(...args))
  }
  return tools
}

// Las page-ops como tools de Mastra (Zod). Operan sobre la pestaña activa vía BrowserControl.
function buildTools(ctrl: BrowserControl, settings: SettingsControl, skills: SkillDetail[]) {
  const wc = (): WebContents => {
    const w = ctrl.getWc()
    if (!w) throw new Error('No hay pestaña activa.')
    return w
  }
  // Adjunta eventos asíncronos pendientes (popups, descargas) a una observación como steering.
  const withEvents = (s: string): string => {
    const ev = ctrl.drainEvents?.() ?? []
    return ev.length ? `${s}\n\n[EVENTOS DEL NAVEGADOR]\n${ev.join('\n')}` : s
  }
  // Estado del REPL: persiste entre llamadas a run_js dentro de un mismo run del agente.
  const replState: Record<string, unknown> = {}
  const tools = {
    run_js: createTool({
      id: 'run_js',
      description:
        'Ejecuta código JavaScript (async) para operar el navegador con la librería monperwright. ' +
        'Globals: page (pestaña activa, API estilo Playwright), state (persiste entre llamadas de este turno), log(...). ' +
        'Usa await y return para devolver un valor. Es tu herramienta principal: prefiérela sobre las tools atómicas. ' +
        'Ej: const s = await page.snapshotText(); log(s); await page.clickRef(2); return await page.title();',
      inputSchema: z.object({ code: z.string().describe('Código JS async. Tiene page, state y log.') }),
      execute: async ({ code }) => {
        const r = await safe(() => runRepl(wc(), code, replState))
        return typeof r === 'string' ? withEvents(r) : r
      }
    }),
    read_page: createTool({
      id: 'read_page',
      description: 'Lee la página activa: URL, título, texto visible y elementos interactivos con su ref.',
      inputSchema: z.object({}),
      execute: async () => {
        const r = await safe(() => page.snapshot(wc()))
        return typeof r === 'string' ? withEvents(r) : r
      }
    }),
    navigate: createTool({
      id: 'navigate',
      description: 'Carga una URL en la pestaña activa.',
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => safe(() => page.navigate(wc(), url))
    }),
    click: createTool({
      id: 'click',
      description: 'Click en el elemento con ese ref (del último read_page). Si falla, vuelve a leer y reintenta.',
      inputSchema: z.object({ ref: z.number().int() }),
      execute: async ({ ref }) => safe(() => page.click(wc(), ref))
    }),
    type: createTool({
      id: 'type',
      description: 'Escribe texto en un input/textarea por su ref. submit=true pulsa Enter.',
      inputSchema: z.object({ ref: z.number().int(), text: z.string(), submit: z.boolean().optional() }),
      execute: async ({ ref, text, submit }) => safe(() => page.type(wc(), ref, text, submit))
    }),
    scroll: createTool({
      id: 'scroll',
      description: 'Desplaza la página. Tras hacer scroll, vuelve a leer con read_page para ver el contenido recién cargado.',
      inputSchema: z.object({ direction: z.enum(['up', 'down']) }),
      execute: async ({ direction }) => safe(() => page.scroll(wc(), direction))
    }),
    wait_for: createTool({
      id: 'wait_for',
      description: 'Espera a que aparezca un texto o un selector CSS antes de continuar (ideal para contenido diferido: comentarios, modales, SPAs). Da text O selector.',
      inputSchema: z.object({
        text: z.string().optional().describe('Texto que debe aparecer en la página'),
        selector: z.string().optional().describe('Selector CSS que debe existir'),
        timeoutMs: z.number().int().optional().describe('Tope de espera en ms (default 8000)')
      }),
      execute: async ({ text, selector, timeoutMs }) => safe(() => page.waitFor(wc(), { text, selector, timeoutMs }))
    }),
    press_key: createTool({
      id: 'press_key',
      description: 'Pulsa una tecla: enter, escape, tab, backspace, delete, space, flechas, home, end, pageup, pagedown. Modificadores opcionales: cmd, ctrl, shift, alt.',
      inputSchema: z.object({
        key: z.string(),
        modifiers: z.array(z.enum(['cmd', 'ctrl', 'shift', 'alt'])).optional()
      }),
      execute: async ({ key, modifiers }) => safe(() => page.pressKey(wc(), key, modifiers))
    }),
    hover: createTool({
      id: 'hover',
      description: 'Pasa el mouse sobre un elemento por su ref (revela menús o tooltips que solo aparecen en hover).',
      inputSchema: z.object({ ref: z.number().int() }),
      execute: async ({ ref }) => safe(() => page.hover(wc(), ref))
    }),
    select_option: createTool({
      id: 'select_option',
      description: 'Elige una opción de un menú desplegable nativo <select>, por valor o por texto visible.',
      inputSchema: z.object({ ref: z.number().int(), value: z.string() }),
      execute: async ({ ref, value }) => safe(() => page.selectOption(wc(), ref, value))
    }),
    history: createTool({
      id: 'history',
      description: 'Navegación de historial de la pestaña: back (atrás), forward (adelante) o reload (recargar).',
      inputSchema: z.object({ action: z.enum(['back', 'forward', 'reload']) }),
      execute: async ({ action }) => safe(() => page.history(wc(), action))
    }),
    list_tabs: createTool({
      id: 'list_tabs',
      description: 'Lista todas las pestañas abiertas con su id, título, URL y cuál está activa.',
      inputSchema: z.object({}),
      execute: async () => {
        const tabs = ctrl.listTabs()
        if (!tabs.length) return 'No hay pestañas abiertas.'
        return tabs.map((t) => `${t.active ? '➤' : ' '} [${t.id}] ${t.title || '(sin título)'} — ${t.url}`).join('\n')
      }
    }),
    open_tab: createTool({
      id: 'open_tab',
      description: 'Abre una nueva pestaña con la URL dada y la activa. Devuelve el id de la pestaña.',
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => safe(async () => {
        let u = url.trim()
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u
        const id = ctrl.openTab(u)
        await new Promise((r) => setTimeout(r, 600))
        return `Pestaña ${id} abierta en ${u}.`
      })
    }),
    switch_tab: createTool({
      id: 'switch_tab',
      description: 'Cambia a la pestaña con ese id (la vuelve activa).',
      inputSchema: z.object({ id: z.number().int() }),
      execute: async ({ id }) => (ctrl.switchTab(id) ? `Cambiado a la pestaña ${id}.` : `ERROR: no existe la pestaña ${id}.`)
    }),
    close_tab: createTool({
      id: 'close_tab',
      description: 'Cierra la pestaña con ese id.',
      inputSchema: z.object({ id: z.number().int() }),
      execute: async ({ id }) => (ctrl.closeTab(id) ? `Pestaña ${id} cerrada.` : `ERROR: no existe la pestaña ${id}.`)
    }),
    screenshot: createTool({
      id: 'screenshot',
      description: 'Captura la pantalla de la página activa para VERLA (visión). Úsalo cuando read_page no baste; luego usa click_at con coordenadas.',
      inputSchema: z.object({}),
      execute: async () => safe(() => page.screenshot(wc())),
      // Entrega la imagen al modelo como contenido multimodal (texto + media).
      toModelOutput: (out: unknown) => {
        const o = out as page.MediaResult | { error: string }
        if ('error' in o) return { type: 'text', value: `ERROR: ${o.error}` }
        return {
          type: 'content',
          value: [
            { type: 'text', text: o.text },
            { type: 'media', data: o.data, mediaType: o.mediaType }
          ]
        }
      }
    }),
    click_at: createTool({
      id: 'click_at',
      description: 'Click en coordenadas absolutas del viewport (px CSS), estimadas a partir de un screenshot previo. Úsalo solo cuando no hay un ref utilizable.',
      inputSchema: z.object({ x: z.number(), y: z.number() }),
      execute: async ({ x, y }) => safe(() => page.clickAt(wc(), x, y))
    }),
    get_settings: createTool({
      id: 'get_settings',
      description: 'Lee los ajustes de Monper: nombre del perfil y las skills disponibles con su estado (activada/desactivada) e id.',
      inputSchema: z.object({}),
      execute: async () => {
        const s = settings.read()
        const skillLines = s.skills.length
          ? s.skills.map((k) => `- ${k.id}: ${k.name} — ${k.enabled ? 'activada' : 'desactivada'}`).join('\n')
          : '(sin skills)'
        return `Nombre del perfil: ${s.profileName}\nSkills:\n${skillLines}`
      }
    }),
    set_profile_name: createTool({
      id: 'set_profile_name',
      description: 'Cambia el nombre del perfil del usuario (se refleja en el sidebar y el menú de perfil).',
      inputSchema: z.object({ name: z.string().describe('Nuevo nombre (1–60 caracteres)') }),
      execute: async ({ name }) => safe(async () => {
        const n = name.trim()
        if (!n) return { error: 'El nombre no puede estar vacío.' }
        return `Nombre actualizado a "${settings.setProfileName(n)}".`
      })
    }),
    set_skill: createTool({
      id: 'set_skill',
      description: 'Activa o desactiva una skill del agente por su id (usa get_settings para ver los ids). El cambio aplica a partir de la próxima ejecución del agente.',
      inputSchema: z.object({ id: z.string(), enabled: z.boolean() }),
      execute: async ({ id, enabled }) => safe(async () => {
        const r = settings.setSkill(id, enabled)
        if (!r.ok) return { error: `No existe la skill "${id}".` }
        return `Skill "${r.name}" ${r.enabled ? 'activada' : 'desactivada'}. Aplica en tu próxima ejecución.`
      })
    }),
    open_settings: createTool({
      id: 'open_settings',
      description: 'Abre la pantalla de ajustes de Monper en una sección concreta. Úsalo para dirigir al usuario a algo que no puedes cambiar tú (claves de API, borrar datos, foto de perfil).',
      inputSchema: z.object({
        section: z.enum(['general', 'account', 'ai', 'skills', 'privacy', 'about']).optional()
      }),
      execute: async ({ section }) => safe(async () => {
        settings.openSettings(section)
        return `Ajustes abiertos${section ? ` en la sección "${section}"` : ''}.`
      })
    })
  }
  // Skills habilitadas: tool para cargar el cuerpo de una skill por id.
  if (skills.length) {
    ;(tools as Record<string, unknown>).use_skill = createTool({
      id: 'use_skill',
      description: 'Carga las instrucciones completas de una skill por su id (de la lista de SKILLS DISPONIBLES) y síguelas.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const s = skills.find((x) => x.id === id || x.name === id)
        return s ? s.body : `ERROR: no existe la skill "${id}". Skills: ${skills.map((x) => x.id).join(', ')}.`
      }
    })
  }
  return sanitizeTools(tools)
}

function skillsSection(skills: SkillDetail[]): string {
  if (!skills.length) return ''
  return `\n\nSKILLS DISPONIBLES: tienes skills con instrucciones especializadas para ciertas tareas. Cuando la petición encaje con una skill (por su descripción o keywords), invoca la tool use_skill(id) para cargar sus instrucciones completas y síguelas al pie de la letra.\n` +
    skills.map((s) => `- ${s.id}: ${s.name} — ${s.description}${s.keywords.length ? ` (keywords: ${s.keywords.join(', ')})` : ''}`).join('\n')
}

export function buildAgent(provider: AIProvider, key: string, model: string, ctrl: BrowserControl, settings: SettingsControl, skills: SkillDetail[] = []): Agent {
  return new Agent({
    id: 'monper-agent',
    name: 'Monper',
    instructions: wellFormed(SYSTEM + skillsSection(skills)), // las skills traen emojis
    model: buildModel(provider, key, model),
    tools: buildTools(ctrl, settings, skills)
  })
}

function describe(toolName: string, args: unknown): ChatStep {
  const a = (args ?? {}) as Record<string, unknown>
  switch (toolName) {
    case 'run_js': return { state: 'solving', label: 'Ejecutando código', kind: 'generic' }
    case 'read_page': return { state: 'listening', label: 'Leyendo la página', kind: 'read' }
    case 'navigate': {
      const h = host(String(a.url ?? ''))
      return { state: 'searching', label: `Navegando a ${h}`, kind: 'navigate', favicon: faviconFor(h) }
    }
    case 'click': return { state: 'working', label: `Click en el elemento ${a.ref}`, kind: 'click' }
    case 'type': return { state: 'composing', label: 'Escribiendo', kind: 'type' }
    case 'scroll': return { state: 'working', label: `Scroll ${a.direction}`, kind: 'scroll' }
    case 'wait_for': return { state: 'searching', label: `Esperando ${a.text ? `"${a.text}"` : a.selector ?? 'contenido'}`, kind: 'wait' }
    case 'press_key': return { state: 'working', label: `Tecla ${a.key}`, kind: 'press' }
    case 'hover': return { state: 'working', label: `Hover en el elemento ${a.ref}`, kind: 'hover' }
    case 'select_option': return { state: 'composing', label: `Eligiendo "${a.value}"`, kind: 'select' }
    case 'history': return { state: 'searching', label: `Historial: ${a.action}`, kind: 'history' }
    case 'list_tabs': return { state: 'listening', label: 'Viendo las pestañas', kind: 'tab' }
    case 'open_tab': return { state: 'searching', label: `Abriendo ${host(String(a.url ?? ''))}`, kind: 'tab', favicon: faviconFor(host(String(a.url ?? ''))) }
    case 'switch_tab': return { state: 'working', label: `Cambiando a la pestaña ${a.id}`, kind: 'tab' }
    case 'close_tab': return { state: 'working', label: `Cerrando la pestaña ${a.id}`, kind: 'tab' }
    case 'screenshot': return { state: 'searching', label: 'Mirando la pantalla', kind: 'screenshot' }
    case 'click_at': return { state: 'working', label: `Click en (${a.x}, ${a.y})`, kind: 'click' }
    case 'use_skill': return { state: 'listening', label: `Usando skill: ${a.id}`, kind: 'read' }
    case 'get_settings': return { state: 'listening', label: 'Leyendo los ajustes', kind: 'read' }
    case 'set_profile_name': return { state: 'composing', label: `Cambiando el nombre a "${a.name}"`, kind: 'generic' }
    case 'set_skill': return { state: 'working', label: `${a.enabled ? 'Activando' : 'Desactivando'} skill ${a.id}`, kind: 'generic' }
    case 'open_settings': return { state: 'searching', label: `Abriendo ajustes${a.section ? `: ${a.section}` : ''}`, kind: 'navigate' }
    default: return { state: 'working', label: toolName, kind: 'generic' }
  }
}
function host(u: string): string {
  try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '') } catch { return u }
}
function faviconFor(h: string): string | undefined {
  return h ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64` : undefined
}

// Compaction: si la conversación es larga, colapsa los turnos viejos en un resumen
// determinista y deja los últimos K verbatim. Controla el crecimiento de contexto en
// tareas/sesiones largas sin una llamada extra al modelo.
function compactHistory(messages: ChatMessage[], keep = 10): ChatMessage[] {
  if (messages.length <= keep) return messages
  const old = messages.slice(0, messages.length - keep)
  const recent = messages.slice(-keep)
  const summary = old
    .map((m) => `${m.role}: ${m.content.replace(/\s+/g, ' ').slice(0, 160)}`)
    .join('\n')
  return [{ role: 'user', content: `[Resumen de la conversación previa]\n${summary}` }, ...recent]
}

// Convierte un ChatMessage a ModelMessage. Si el usuario adjuntó imágenes, arma contenido
// multimodal ({type:'text'} + {type:'image', image: dataUrl}); si no, deja el string tal cual.
function toModelMessage(msg: ChatMessage): { role: string; content: unknown } {
  // Sanea surrogates huérfanos (el historial también se recorta en compactHistory).
  const m: ChatMessage = { ...msg, content: wellFormed(msg.content ?? '') }
  if (m.role === 'user' && m.attachments?.length) {
    const parts: unknown[] = []
    if (m.content) parts.push({ type: 'text', text: m.content })
    for (const a of m.attachments) {
      // Sin mime explícito, Mastra etiqueta la imagen como image/jpeg y reescribe el prefijo
      // del data URL, corrompiéndola (un PNG llega como "jpeg"). Damos el mime real del data URL.
      const mime = a.dataUrl.match(/^data:([^;,]+)/)?.[1] || 'image/png'
      parts.push({ type: 'image', image: a.dataUrl, mimeType: mime, mediaType: mime })
    }
    return { role: m.role, content: parts }
  }
  return { role: m.role, content: m.content }
}

/** Corre el agente Mastra en streaming, emitiendo tokens (texto) y steps (tool-calls). */
export async function runMastra(opts: {
  provider: AIProvider; key: string; model: string
  messages: ChatMessage[]; control: BrowserControl; settings: SettingsControl; emit: Emit; signal: AbortSignal; skills?: SkillDetail[]
}): Promise<void> {
  const agent = buildAgent(opts.provider, opts.key, opts.model, opts.control, opts.settings, opts.skills ?? [])
  // {role, content:string} es un ModelMessage válido; la unión de Mastra es demasiado estricta para inferirlo.
  // maxSteps: el default de Mastra es 5 (corta la tarea a mitad); subimos para dejar completar flujos largos.
  const messages = compactHistory(opts.messages).map(toModelMessage)
  const out = await agent.stream(messages as Parameters<typeof agent.stream>[0], { maxSteps: MAX_STEPS })
  let gotText = false
  let steps = 0
  let finishReason = ''
  let streamError = ''
  for await (const chunk of out.fullStream) {
    if (opts.signal.aborted) return
    if (chunk.type === 'text-delta') { gotText = true; opts.emit.token(chunk.payload.text) }
    else if (chunk.type === 'tool-call') { steps++; opts.emit.step(describe(chunk.payload.toolName, chunk.payload.args)) }
    else if (chunk.type === 'tool-result' && chunk.payload.toolName === 'screenshot') {
      // Adjunta la captura al step de screenshot para renderizarla en el chat.
      const r = chunk.payload.result as page.MediaResult | { error: string } | undefined
      if (r && !('error' in r) && r.data) opts.emit.stepImage(`data:${r.mediaType};base64,${r.data}`)
    }
    // Antes ignorábamos estos chunks y CUALQUIER fallo se reportaba como "límite de pasos".
    else if (chunk.type === 'error') streamError = errText((chunk.payload as { error?: unknown }).error)
    else if (chunk.type === 'tool-error') streamError = errText((chunk.payload as { error?: unknown }).error)
    else if (chunk.type === 'finish') {
      const r = (chunk.payload as { stepResult?: { reason?: string } }).stepResult?.reason
      if (r) finishReason = r
    }
  }
  if (gotText || opts.signal.aborted) return
  // Sin texto: explica la causa REAL en vez de asumir el límite de pasos.
  console.log('[agent] turno sin texto —', { steps, finishReason, streamError })
  if (streamError) { opts.emit.error(streamError); return }
  if (finishReason === 'length') {
    opts.emit.token('Me quedé sin espacio de respuesta (límite de tokens). Pídeme algo más acotado o dime que continúe.')
  } else if (steps >= MAX_STEPS) {
    opts.emit.token(`Alcancé el límite de ${MAX_STEPS} pasos sin terminar. ¿Quieres que continúe?`)
  } else {
    opts.emit.token(`El modelo terminó sin responder${finishReason ? ` (motivo: ${finishReason})` : ''}. Intenta reformular la petición.`)
  }
}

/** Extrae un mensaje legible de un error del proveedor (SDK, HTTP o anidado). */
export function errText(e: unknown): string {
  if (!e) return 'Error desconocido del modelo.'
  if (typeof e === 'string') return e
  const o = e as {
    message?: unknown; name?: unknown; status?: unknown; statusCode?: unknown
    error?: { message?: unknown }; responseBody?: unknown; cause?: unknown; data?: unknown
  }
  const parts: string[] = []
  const status = o.status ?? o.statusCode
  if (status != null) parts.push(`HTTP ${String(status)}`)
  const msg =
    (typeof o.error?.message === 'string' && o.error.message) ||
    (e instanceof Error && e.message) ||
    (typeof o.message === 'string' && o.message) ||
    ''
  if (msg) parts.push(msg)
  // Los SDK suelen traer el detalle útil en el cuerpo de la respuesta.
  const body = o.responseBody ?? o.data
  if (body && parts.length < 2) parts.push(typeof body === 'string' ? body.slice(0, 400) : JSON.stringify(body).slice(0, 400))
  if (!parts.length && o.cause) return errText(o.cause)
  if (!parts.length) { try { return JSON.stringify(e).slice(0, 500) } catch { return String(e) } }
  return parts.join(' — ')
}
