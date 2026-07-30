import { test, expect } from '@playwright/test'
import { diagnosticar } from '../src/main/agent/mastra'

/**
 * Clasificación de los fallos del proveedor de IA.
 *
 * No lanza la app: es una función pura, y así corre en milisegundos. Lo que se comprueba no es
 * el texto —eso cambiará— sino **que cada fallo real caiga en su caja**, porque de ahí sale lo
 * único que le importa al usuario: si es culpa suya, si se arregla solo, y dónde tocar.
 *
 * Los payloads son los que devuelven de verdad Anthropic y OpenAI, no inventados.
 */

/** Error tal y como lo tira el SDK: status arriba y el cuerpo del proveedor dentro. */
const err = (status: number, body: unknown): unknown =>
  Object.assign(new Error(typeof body === 'string' ? body : JSON.stringify(body)), { status, responseBody: body })

test('sin crédito se distingue de petición inválida, aunque ambas sean HTTP 400', () => {
  // Anthropic manda el crédito agotado como 400, no como 402. Clasificar por status mandaría
  // al usuario a revisar su petición cuando lo que tiene que hacer es recargar.
  const f = diagnosticar(err(400, {
    type: 'error',
    error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API' }
  }), 'anthropic')
  expect(f.tipo).toBe('credito')
  expect(f.accion?.kind, 'sin crédito hay que llevarlo a su saldo, no a Settings').toBe('url')
  expect(f.accion?.value).toContain('anthropic.com')
})

test('la cuota agotada de OpenAI llega como 429 y tampoco es un rate limit', () => {
  // `insufficient_quota` viene con el MISMO status que el rate limit. Confundirlos le diría
  // "espera unos segundos" a alguien que puede esperar un año sin que se arregle.
  const f = diagnosticar(err(429, {
    error: { type: 'insufficient_quota', message: 'You exceeded your current quota, please check your plan and billing details.' }
  }), 'openai')
  expect(f.tipo).toBe('credito')
  expect(f.accion?.value).toContain('openai.com')
})

test('un rate limit de verdad sí es de esperar, y no ofrece acción', () => {
  const f = diagnosticar(err(429, { error: { type: 'rate_limit_error', message: 'Number of requests has exceeded your rate limit' } }), 'anthropic')
  expect(f.tipo).toBe('limite')
  expect(f.accion, 'no hay nada que pulsar: se arregla esperando').toBeUndefined()
})

test('una key inválida manda a Settings', () => {
  const f = diagnosticar(err(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), 'anthropic')
  expect(f.tipo).toBe('auth')
  expect(f.accion?.kind).toBe('settings')
})

test('un modelo que no existe no se confunde con una key mala', () => {
  const f = diagnosticar(err(404, { error: { message: "The model 'gpt-9' does not exist or you do not have access to it" } }), 'openai')
  expect(f.tipo).toBe('modelo')
})

test('sin red no se culpa a la API key', () => {
  // Es la confusión más cara: sin status, un `fetch failed` parecía un fallo de auth y mandaba
  // al usuario a regenerar una key que estaba perfecta.
  const f = diagnosticar(Object.assign(new Error('fetch failed'), { cause: new Error('getaddrinfo ENOTFOUND api.anthropic.com') }), 'anthropic')
  expect(f.tipo).toBe('red')
  expect(f.accion).toBeUndefined()
})

test('un 5xx se dice que no es culpa del usuario', () => {
  const f = diagnosticar(err(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }), 'anthropic')
  expect(f.tipo).toBe('proveedor')
})

test('la conversación demasiado larga propone empezar otra', () => {
  const f = diagnosticar(err(400, { error: { message: 'prompt is too long: 250000 tokens > 200000 maximum' } }), 'anthropic')
  expect(f.tipo).toBe('contexto')
})

test('lo que no se sabe clasificar conserva el texto crudo', () => {
  // Sin esto, un caso nuevo quedaría PEOR que volcar la cadena: un mensaje genérico y ninguna
  // pista de qué pasó.
  const f = diagnosticar(err(418, { error: { message: 'soy una tetera' } }), 'anthropic')
  expect(f.tipo).toBe('desconocido')
  expect(f.crudo).toContain('tetera')
})

test('todos los fallos traen el crudo para poder depurarlos', () => {
  const casos: unknown[] = [
    err(401, { error: { message: 'invalid x-api-key' } }),
    err(429, { error: { message: 'rate limit' } }),
    err(500, 'boom')
  ]
  for (const c of casos) expect(diagnosticar(c, 'anthropic').crudo, 'todo fallo debe poder depurarse').toBeTruthy()
})
