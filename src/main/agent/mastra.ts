import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { WebContents } from 'electron'
import type { AIProvider, ChatMessage, ChatStep } from '../../shared/types'
import * as page from './page'

/** Tope de iteraciones del agente (Mastra default = 5, demasiado bajo para flujos multi-paso). */
const MAX_STEPS = 40

interface Emit {
  token: (t: string) => void
  step: (s: ChatStep) => void
  error: (m: string) => void
}

const SYSTEM = `Eres Monper, un agente que opera el navegador del usuario para cumplir su tarea.
Observa la página con read_page antes de tu primer click/type y tras cualquier navegación (los "ref" cambian).
Refiere los elementos por su número "ref" del último read_page.

PERSISTENCIA (muy importante): no te detengas hasta COMPLETAR la tarea que te pidieron. Trabajas de forma autónoma; no devuelvas el control a mitad de camino para "preguntar si continúo".
- Si una herramienta devuelve { error } o no encuentras el elemento esperado: NO te rindas. Vuelve a leer con read_page, haz scroll para cargar contenido diferido (comentarios, listas infinitas suelen requerir varios scroll), y reintenta con otra estrategia.
- Muchos elementos (cajas de comentario, botones) aparecen solo tras hacer scroll hasta ellos y esperar a que carguen: haz read_page de nuevo después de cada scroll.
- Reintenta una acción fallida hasta 3 veces con enfoques distintos antes de considerarla bloqueada.
- Solo termina cuando (a) la tarea está hecha, o (b) tras reintentos reales sigue bloqueada; en ese caso explica CLARAMENTE qué intentaste y por qué no se pudo. Nunca termines en silencio.

Para acciones IRREVERSIBLES o sensibles (comprar, pagar, enviar dinero, borrar cuentas), primero explica qué harás y pide confirmación. Publicar un comentario/respuesta que el usuario te pidió explícitamente SÍ puedes ejecutarlo.
No inventes datos ni credenciales. Cuando termines, responde en texto claro.`

// Router de modelos nativo de Mastra: no importamos @ai-sdk directamente.
function modelConfig(provider: AIProvider, key: string, model: string): {
  providerId: string; modelId: string; apiKey: string; url?: string
} {
  return {
    providerId: provider.kind === 'anthropic' ? 'anthropic' : 'openai',
    modelId: model,
    apiKey: key,
    url: provider.baseUrl
  }
}

// Envuelve un handler de tool: nunca lanza; devuelve { error } para que el modelo reaccione y reintente.
function safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  return fn().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
}

// Las page-ops como tools de Mastra (Zod). Reciben el WebContents activo por closure.
function buildTools(getWc: () => WebContents | undefined) {
  const wc = (): WebContents => {
    const w = getWc()
    if (!w) throw new Error('No hay pestaña activa.')
    return w
  }
  return {
    read_page: createTool({
      id: 'read_page',
      description: 'Lee la página activa: URL, título, texto visible y elementos interactivos con su ref.',
      inputSchema: z.object({}),
      execute: async () => safe(() => page.snapshot(wc()))
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
    })
  }
}

export function buildAgent(provider: AIProvider, key: string, model: string, getWc: () => WebContents | undefined): Agent {
  return new Agent({
    id: 'monper-agent',
    name: 'Monper',
    instructions: SYSTEM,
    model: modelConfig(provider, key, model),
    tools: buildTools(getWc)
  })
}

function describe(toolName: string, args: unknown): ChatStep {
  const a = (args ?? {}) as Record<string, unknown>
  switch (toolName) {
    case 'read_page': return { state: 'listening', label: 'Leyendo la página', kind: 'read' }
    case 'navigate': {
      const h = host(String(a.url ?? ''))
      return { state: 'searching', label: `Navegando a ${h}`, kind: 'navigate', favicon: faviconFor(h) }
    }
    case 'click': return { state: 'working', label: `Click en el elemento ${a.ref}`, kind: 'click' }
    case 'type': return { state: 'composing', label: 'Escribiendo', kind: 'type' }
    case 'scroll': return { state: 'working', label: `Scroll ${a.direction}`, kind: 'scroll' }
    default: return { state: 'working', label: toolName, kind: 'generic' }
  }
}
function host(u: string): string {
  try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '') } catch { return u }
}
function faviconFor(h: string): string | undefined {
  return h ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64` : undefined
}

/** Corre el agente Mastra en streaming, emitiendo tokens (texto) y steps (tool-calls). */
export async function runMastra(opts: {
  provider: AIProvider; key: string; model: string
  messages: ChatMessage[]; getWc: () => WebContents | undefined; emit: Emit; signal: AbortSignal
}): Promise<void> {
  const agent = buildAgent(opts.provider, opts.key, opts.model, opts.getWc)
  // {role, content:string} es un ModelMessage válido; la unión de Mastra es demasiado estricta para inferirlo.
  // maxSteps: el default de Mastra es 5 (corta la tarea a mitad); subimos para dejar completar flujos largos.
  const out = await agent.stream(opts.messages as Parameters<typeof agent.stream>[0], { maxSteps: MAX_STEPS })
  let gotText = false
  for await (const chunk of out.fullStream) {
    if (opts.signal.aborted) return
    if (chunk.type === 'text-delta') { gotText = true; opts.emit.token(chunk.payload.text) }
    else if (chunk.type === 'tool-call') opts.emit.step(describe(chunk.payload.toolName, chunk.payload.args))
  }
  // El agente se detuvo sin dar una respuesta (típicamente al topar maxSteps): no dejes el turno mudo.
  if (!gotText && !opts.signal.aborted) {
    opts.emit.token('Me detuve antes de completar la tarea (límite de pasos alcanzado). ¿Quieres que continúe?')
  }
}
