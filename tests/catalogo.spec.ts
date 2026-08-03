import { test, expect } from '@playwright/test'
import { idsDeRespuesta, mezclarCatalogo } from '../src/main/ai/catalogo'
import { MODELS } from '../src/shared/types'

/**
 * El catálogo de modelos que se le pregunta al proveedor.
 *
 * Existe porque la lista escrita a mano siempre va por detrás: el día que sale un modelo nuevo
 * había que tocar el código y publicar una versión para poder elegirlo. Lo que se prueba aquí es
 * el parseo y la mezcla, que es donde se decide qué acaba viendo el usuario en el selector.
 */

test('saca los ids de la respuesta de las dos APIs', () => {
  // Anthropic y OpenAI contestan la misma forma: { data: [{ id }] }.
  expect(idsDeRespuesta({ data: [{ id: 'gpt-5' }, { id: 'gpt-6' }] })).toEqual(['gpt-5', 'gpt-6'])
  expect(idsDeRespuesta({ data: [{ id: 'claude-opus-5', display_name: 'Opus 5' }] })).toEqual(['claude-opus-5'])
})

test('una respuesta rara no revienta el selector', () => {
  // Un gateway compatible a medias puede contestar cualquier cosa. Quedarse sin modelos es
  // recuperable; una excepción en mitad de pintar los ajustes, no.
  expect(idsDeRespuesta(null)).toEqual([])
  expect(idsDeRespuesta({})).toEqual([])
  expect(idsDeRespuesta({ data: 'nope' })).toEqual([])
  expect(idsDeRespuesta({ data: [null, 42, { sin: 'id' }, { id: '' }, { id: 'bueno' }] })).toEqual(['bueno'])
})

test('los de fábrica van primero y conservan su orden', () => {
  /**
   * El PRIMERO de la lista es el que se elige solo al conectar un proveedor: ese orden es una
   * decisión de producto (capaz primero) y no se le cede al proveedor, que devuelve los suyos
   * en el orden que quiere.
   */
  const r = mezclarCatalogo('anthropic', ['zzz-modelo-nuevo', 'claude-opus-5'])
  expect(r.slice(0, MODELS.anthropic.length)).toEqual(MODELS.anthropic)
  expect(r[0].id).toBe(MODELS.anthropic[0].id)
})

test('no se duplica lo que ya está en la lista de fábrica', () => {
  const yaEstan = MODELS.openai.map((m) => m.id)
  const r = mezclarCatalogo('openai', yaEstan)
  expect(r.filter((m) => m.id === yaEstan[0])).toHaveLength(1)
  expect(r).toHaveLength(MODELS.openai.length)
})

test('un modelo nuevo del proveedor SÍ aparece', () => {
  // Es el punto entero: un id que este código no conoce tiene que poder elegirse igual.
  const r = mezclarCatalogo('openai', ['un-modelo-que-no-existia'])
  expect(r.some((m) => m.id === 'un-modelo-que-no-existia')).toBe(true)
})

test('a un modelo desconocido no se le inventa nombre', () => {
  // Bautizarlo sería adivinar, y un nombre equivocado en un selector de modelos confunde más
  // que el id crudo.
  const r = mezclarCatalogo('openai', ['sol-1'])
  expect(r.find((m) => m.id === 'sol-1')?.name).toBe('sol-1')
})

test('lo que no es de chat se queda fuera', () => {
  // /v1/models devuelve embeddings, audio, imagen… llenarían el selector de cosas que fallarían
  // al primer mensaje.
  const r = mezclarCatalogo('openai', [
    'text-embedding-3-large', 'whisper-1', 'tts-1', 'dall-e-3', 'omni-moderation-latest',
    'gpt-realtime', 'modelo-de-chat-nuevo'
  ])
  const ids = r.map((m) => m.id)
  expect(ids).toContain('modelo-de-chat-nuevo')
  for (const malo of ['text-embedding-3-large', 'whisper-1', 'tts-1', 'dall-e-3', 'omni-moderation-latest', 'gpt-realtime']) {
    expect(ids, `${malo} no debería estar en el selector`).not.toContain(malo)
  }
})

test('el filtro es lista NEGRA, no blanca', () => {
  /**
   * La diferencia importa: con lista blanca, un modelo nuevo con un nombre que no encaje en
   * ningún patrón conocido se quedaría fuera — justo el problema que este fichero resuelve.
   */
  const r = mezclarCatalogo('anthropic', ['luna', 'terra', 'sol', 'x-9000'])
  const ids = r.map((m) => m.id)
  for (const nuevo of ['luna', 'terra', 'sol', 'x-9000']) expect(ids).toContain(nuevo)
})

// ---- el catálogo de arranque ----

test('solo hay modelos vigentes y self-serve', () => {
  /**
   * Un selector con tres generaciones de modelos no ayuda a elegir, estorba. Se fija la lista
   * de agosto de 2026: si alguien vuelve a colar una generación vieja, este test se cae y
   * obliga a justificarlo.
   */
  expect(MODELS.anthropic.map((m) => m.id)).toEqual([
    'claude-opus-5', 'claude-fable-5', 'claude-sonnet-5', 'claude-haiku-4-5'
  ])
  expect(MODELS.openai.map((m) => m.id)).toEqual([
    'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'
  ])
})

test('ningún id lleva sufijo de fecha', () => {
  // Los ids con fecha (`claude-haiku-4-5-20251001`) fijan una instantánea concreta: el alias
  // sin fecha sigue apuntando a la vigente, que es lo que queremos en un selector.
  for (const lista of Object.values(MODELS)) {
    for (const m of lista) expect(m.id, `${m.id} lleva fecha`).not.toMatch(/-\d{8}$/)
  }
})
