import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { WebContents } from 'electron'
import type { AIProvider, ChatMessage, ChatStep } from '../../shared/types'
import * as page from './page'

interface Emit {
  token: (t: string) => void
  step: (s: ChatStep) => void
  error: (m: string) => void
}

const SYSTEM = `Eres Monper, un agente que opera el navegador del usuario para cumplir su tarea.
Observa la página con read_page antes de tu primer click/type y tras cualquier navegación (los "ref" cambian).
Refiere los elementos por su número "ref" del último read_page.
Para acciones IRREVERSIBLES o sensibles (comprar, pagar, enviar, borrar, publicar), primero explica qué harás y pide confirmación; no las ejecutes sin el OK del usuario.
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
      execute: async () => page.snapshot(wc())
    }),
    navigate: createTool({
      id: 'navigate',
      description: 'Carga una URL en la pestaña activa.',
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => page.navigate(wc(), url)
    }),
    click: createTool({
      id: 'click',
      description: 'Click en el elemento con ese ref (del último read_page).',
      inputSchema: z.object({ ref: z.number().int() }),
      execute: async ({ ref }) => page.click(wc(), ref)
    }),
    type: createTool({
      id: 'type',
      description: 'Escribe texto en un input/textarea por su ref. submit=true pulsa Enter.',
      inputSchema: z.object({ ref: z.number().int(), text: z.string(), submit: z.boolean().optional() }),
      execute: async ({ ref, text, submit }) => page.type(wc(), ref, text, submit)
    }),
    scroll: createTool({
      id: 'scroll',
      description: 'Desplaza la página.',
      inputSchema: z.object({ direction: z.enum(['up', 'down']) }),
      execute: async ({ direction }) => page.scroll(wc(), direction)
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
  const out = await agent.stream(opts.messages as Parameters<typeof agent.stream>[0])
  for await (const chunk of out.fullStream) {
    if (opts.signal.aborted) return
    if (chunk.type === 'text-delta') opts.emit.token(chunk.payload.text)
    else if (chunk.type === 'tool-call') opts.emit.step(describe(chunk.payload.toolName, chunk.payload.args))
  }
}
