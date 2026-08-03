import { net } from 'electron'
import type { AIProvider, ModelOption, ProviderKind } from '../../shared/types'
import { MODELS } from '../../shared/types'

/**
 * El catálogo de modelos, preguntado AL PROVEEDOR.
 *
 * `MODELS` en shared es una lista escrita a mano, y por eso siempre va por detrás: el día que
 * sale un modelo nuevo hay que tocar el código y publicar una versión para poder elegirlo. Los
 * dos proveedores exponen su catálogo (`GET /v1/models`), así que se pregunta y ya.
 *
 * La lista de fábrica no desaparece: da los nombres bonitos y el ORDEN (que es nuestra
 * recomendación, no la del proveedor), y es lo que se enseña si la red falla o la key no da
 * permiso para listar. Los modelos que llegan de fuera se añaden detrás, con su id tal cual —
 * inventarles un nombre sería adivinar.
 */

/** Techo de tiempo: un desplegable de modelos no puede colgar los ajustes. */
const TIMEOUT_MS = 6000

/**
 * Lo que NO es un modelo de chat. Se excluye por lista negra y no por lista blanca a propósito:
 * con lista blanca, un modelo nuevo que no encajara en el patrón se quedaría fuera — que es
 * exactamente el problema que este fichero viene a resolver.
 */
const NO_CHAT = /embed|whisper|tts|audio|realtime|transcrib|moderation|dall-e|image|video|rerank|guard/i

async function pedir(url: string, headers: Record<string, string>): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await net.fetch(url, { headers, signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
  } finally { clearTimeout(t) }
}

/** Ids que devuelve el proveedor. Las dos APIs contestan `{ data: [{ id }] }`. */
export function idsDeRespuesta(raw: unknown): string[] {
  const d = raw as { data?: unknown }
  if (!d || !Array.isArray(d.data)) return []
  return d.data
    .map((m) => (m && typeof m === 'object' ? (m as { id?: unknown }).id : null))
    .filter((id): id is string => typeof id === 'string' && !!id.trim())
}

/**
 * Mezcla el catálogo de fábrica con el del proveedor.
 *
 * Los de fábrica van primero y con su nombre: el primero de la lista es el que se elige solo al
 * conectar, así que ese orden es una decisión de producto y no se cede al proveedor. Los de
 * fuera van detrás, ordenados al revés (los ids nuevos suelen ordenar después) y sin duplicar.
 */
export function mezclarCatalogo(kind: ProviderKind, remotos: string[]): ModelOption[] {
  const base = MODELS[kind]
  const ya = new Set(base.map((m) => m.id))
  const extra = remotos
    .filter((id) => !ya.has(id) && !NO_CHAT.test(id))
    .sort((a, b) => b.localeCompare(a))
    // Sin nombre inventado: el id es el nombre. Bautizar un modelo que no conocemos sería
    // adivinar, y un nombre equivocado en un selector de modelos confunde más que el id crudo.
    .map((id) => ({ id, name: id }))
  return [...base, ...extra]
}

/**
 * Pregunta al proveedor qué modelos tiene. Si falla —sin red, key sin permiso de listar, un
 * gateway que no implementa /models— se devuelve el catálogo de fábrica: quedarse sin poder
 * elegir modelo por no poder listar sería peor que la lista vieja.
 */
export async function catalogoDe(provider: AIProvider, key: string): Promise<ModelOption[]> {
  try {
    const raw = provider.kind === 'anthropic'
      ? await pedir(`${provider.baseUrl ?? 'https://api.anthropic.com'}/v1/models?limit=100`, {
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        })
      : await pedir(`${(provider.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/models`, {
          Authorization: `Bearer ${key}`
        })
    return mezclarCatalogo(provider.kind, idsDeRespuesta(raw))
  } catch (e) {
    console.error('[modelos] no se pudo listar el catálogo de', provider.label, e instanceof Error ? e.message : e)
    return MODELS[provider.kind]
  }
}
