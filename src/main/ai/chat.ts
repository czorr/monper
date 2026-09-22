import type { AIProvider, ChatMessage, Effort } from '../../shared/types'

const SYSTEM = 'Eres Titanio, un asistente dentro de un navegador. Responde de forma clara y concisa en el idioma del usuario.'

interface StreamHandlers {
  onDelta: (text: string) => void
  onError: (message: string) => void
}

/** Llama al proveedor activo en streaming. Devuelve el texto completo al terminar. */
export async function streamChat(
  provider: AIProvider,
  key: string,
  model: string,
  effort: Effort,
  messages: ChatMessage[],
  handlers: StreamHandlers,
  signal: AbortSignal
): Promise<string> {
  return provider.kind === 'anthropic'
    ? streamAnthropic(provider, key, model, effort, messages, handlers, signal)
    : streamOpenAI(provider, key, model, messages, handlers, signal)
}

// ---- lector genérico de SSE ----
async function readSSE(
  res: Response,
  onEvent: (data: string) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const block of parts) {
      for (const line of block.split('\n')) {
        const m = line.match(/^data:\s?(.*)$/)
        if (m) onEvent(m[1])
      }
    }
  }
}

async function streamAnthropic(
  provider: AIProvider,
  key: string,
  model: string,
  effort: Effort,
  messages: ChatMessage[],
  { onDelta, onError }: StreamHandlers,
  signal: AbortSignal
): Promise<string> {
  const base = provider.baseUrl || 'https://api.anthropic.com'
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    signal,
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: SYSTEM,
      stream: true,
      output_config: { effort },
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    })
  })
  if (!res.ok) { onError(`Error ${res.status}: ${(await res.text()).slice(0, 300)}`); return '' }

  let full = ''
  await readSSE(res, (data) => {
    if (!data || data === '[DONE]') return
    try {
      const ev = JSON.parse(data)
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        full += ev.delta.text
        onDelta(ev.delta.text)
      } else if (ev.type === 'error') {
        onError(ev.error?.message || 'Error del modelo')
      }
    } catch { /* ignora líneas no-JSON */ }
  }, signal)
  return full
}

async function streamOpenAI(
  provider: AIProvider,
  key: string,
  model: string,
  messages: ChatMessage[],
  { onDelta, onError }: StreamHandlers,
  signal: AbortSignal
): Promise<string> {
  const base = provider.baseUrl || 'https://api.openai.com/v1'
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: 'system', content: SYSTEM }, ...messages.map((m) => ({ role: m.role, content: m.content }))]
    })
  })
  if (!res.ok) { onError(`Error ${res.status}: ${(await res.text()).slice(0, 300)}`); return '' }

  let full = ''
  await readSSE(res, (data) => {
    if (!data || data === '[DONE]') return
    try {
      const ev = JSON.parse(data)
      const delta = ev.choices?.[0]?.delta?.content
      if (delta) { full += delta; onDelta(delta) }
    } catch { /* ignora */ }
  }, signal)
  return full
}
