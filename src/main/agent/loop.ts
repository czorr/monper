import type { WebContents } from 'electron'
import type { AIProvider, ChatMessage, Effort } from '../../shared/types'
import * as page from './page'

/* eslint-disable @typescript-eslint/no-explicit-any */

const SYSTEM = `Eres Titanio, un agente que opera el navegador del usuario para cumplir su tarea.
Trabajas en bucle: observa la página con read_page, razona, y ejecuta UNA acción por paso.
- Llama read_page antes de tu primer click/type y de nuevo tras cualquier navegación (los "ref" cambian).
- Refiere los elementos por su número "ref" del último read_page.
- Para acciones IRREVERSIBLES o sensibles (comprar, pagar, enviar mensajes, borrar, publicar, aceptar términos): NO las ejecutes; primero explica en tu respuesta exactamente qué harás y pide confirmación al usuario.
- No inventes datos personales ni credenciales. Cuando termines, responde al usuario en texto claro.`

const TOOLS = [
  { name: 'read_page', description: 'Lee la página activa: URL, título, texto visible y elementos interactivos con su ref.', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'navigate', description: 'Carga una URL en la pestaña activa.', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'click', description: 'Click en el elemento con ese ref (del último read_page).', input_schema: { type: 'object', properties: { ref: { type: 'integer' } }, required: ['ref'] } },
  { name: 'type', description: 'Escribe texto en un input/textarea por su ref. submit=true pulsa Enter.', input_schema: { type: 'object', properties: { ref: { type: 'integer' }, text: { type: 'string' }, submit: { type: 'boolean' } }, required: ['ref', 'text'] } },
  { name: 'scroll', description: 'Desplaza la página.', input_schema: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] } }, required: ['direction'] } }
]

interface Emit {
  token: (t: string) => void
  step: (s: { state: string; label: string }) => void
  error: (m: string) => void
}

const MAX_STEPS = 24

export async function runAgent(opts: {
  provider: AIProvider; key: string; model: string; effort: Effort
  messages: ChatMessage[]; wc: WebContents | undefined; emit: Emit; signal: AbortSignal
}): Promise<void> {
  const { provider, key, model, effort, wc, emit, signal } = opts
  const base = provider.baseUrl || 'https://api.anthropic.com'
  const msgs: any[] = opts.messages.map((m) => ({ role: m.role, content: m.content }))

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) return
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      signal,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 2048, system: SYSTEM, tools: TOOLS, output_config: { effort }, messages: msgs })
    })
    if (!res.ok) { emit.error(`Error ${res.status}: ${(await res.text()).slice(0, 300)}`); return }
    const data = (await res.json()) as { content: any[]; stop_reason: string }
    msgs.push({ role: 'assistant', content: data.content })

    const toolUses = data.content.filter((b: any) => b.type === 'tool_use')
    if (toolUses.length === 0) {
      emit.token(data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''))
      return
    }

    const results: any[] = []
    for (const tu of toolUses) {
      if (signal.aborted) return
      emit.step(describe(tu.name, tu.input))
      const out = await exec(tu.name, tu.input, wc)
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out })
    }
    msgs.push({ role: 'user', content: results })
  }
  emit.token('Alcancé el límite de pasos. Dime si continúo.')
}

function host(u: string): string {
  try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '') } catch { return u }
}

function describe(name: string, input: any): { state: string; label: string } {
  switch (name) {
    case 'read_page': return { state: 'listening', label: 'Leyendo la página' }
    case 'navigate': return { state: 'searching', label: `Navegando a ${host(input.url)}` }
    case 'click': return { state: 'working', label: `Click en el elemento ${input.ref}` }
    case 'type': return { state: 'composing', label: 'Escribiendo' }
    case 'scroll': return { state: 'working', label: `Scroll ${input.direction}` }
    default: return { state: 'working', label: name }
  }
}

async function exec(name: string, input: any, wc: WebContents | undefined): Promise<string> {
  if (!wc) return 'ERROR: no hay pestaña activa.'
  try {
    switch (name) {
      case 'read_page': return await page.snapshot(wc)
      case 'navigate': return await page.navigate(wc, input.url)
      case 'click': return await page.click(wc, input.ref)
      case 'type': return await page.type(wc, input.ref, input.text, input.submit)
      case 'scroll': return await page.scroll(wc, input.direction)
      default: return 'Herramienta desconocida: ' + name
    }
  } catch (err) {
    return 'ERROR: ' + (err instanceof Error ? err.message : String(err))
  }
}
