import type { AIProvider } from '../../shared/types'
import { buildOneShotAgent } from './mastra'

/**
 * Una sola pregunta al modelo, sin tools ni loop de agente.
 * Se usa para tareas puntuales como generar el extractor de una rutina.
 */
export async function askModel(
  provider: AIProvider,
  key: string,
  model: string,
  system: string,
  prompt: string
): Promise<string> {
  const agent = buildOneShotAgent(provider, key, model, system)
  const out = await agent.stream([{ role: 'user', content: prompt }] as Parameters<typeof agent.stream>[0])
  let text = ''
  for await (const chunk of out.fullStream) {
    if (chunk.type === 'text-delta') text += chunk.payload.text
  }
  return text.trim()
}

/** Extrae el primer objeto JSON de una respuesta (los modelos suelen envolverlo en prosa/```). */
export function parseJsonLoose<T>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(body.slice(start, end + 1)) as T } catch { return null }
}
