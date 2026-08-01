import type { TurnoUso } from './types'

/**
 * Precio por millón de tokens, en dólares.
 *
 * Vive en `shared` y no en el main por dos razones: es DATO, no lógica de proceso, y así el
 * cálculo se puede probar sin levantar Electron — que es lo que hace que la aritmética del
 * dinero tenga tests de verdad.
 *
 * Se mantiene A MANO y esa es su debilidad: si el proveedor cambia la tarifa, aquí sigue la
 * vieja. Por eso un modelo sin precio conocido **no inventa uno**: se enseñan sus tokens y se
 * calla el coste. Un número inventado en una pantalla que se llama "Billing" es peor que un
 * hueco — el usuario toma decisiones de dinero con él.
 *
 * De ahí que **no haya tarifas de OpenAI**: no tenemos una fuente fiable para ellas, y ponerlas
 * a ojo sería exactamente lo que este fichero promete no hacer. Los modelos GPT cuentan tokens
 * y salen como "sin tarifa" hasta que alguien meta los números buenos.
 *
 * `desde`/`hasta` (ms) acotan una tarifa a una ventana de fechas. Existe por los precios de
 * lanzamiento: aplicar la tarifa de lista a un turno que se cobró al precio promocional infla
 * la factura estimada, y este panel se lee para decidir cuánto gastar.
 */
interface Tarifa {
  in: number
  out: number
  /** Lectura de caché. No se publica por modelo: es ~0.1× el input (ver docs de prompt caching). */
  cached?: number
  desde?: number
  hasta?: number
}

/** Décima parte del input, que es lo que cuesta leer de caché. */
const cache = (input: number): number => input / 10

export const PRECIOS: Record<string, Tarifa[]> = {
  'claude-opus-5': [{ in: 5, out: 25, cached: cache(5) }],
  'claude-fable-5': [{ in: 10, out: 50, cached: cache(10) }],
  'claude-opus-4-8': [{ in: 5, out: 25, cached: cache(5) }],
  'claude-opus-4-7': [{ in: 5, out: 25, cached: cache(5) }],
  'claude-opus-4-6': [{ in: 5, out: 25, cached: cache(5) }],
  'claude-sonnet-5': [
    // Precio de lanzamiento hasta el 31 de agosto de 2026; después, tarifa de lista.
    { in: 2, out: 10, cached: cache(2), hasta: Date.parse('2026-09-01T00:00:00Z') },
    { in: 3, out: 15, cached: cache(3), desde: Date.parse('2026-09-01T00:00:00Z') }
  ],
  'claude-sonnet-4-6': [{ in: 3, out: 15, cached: cache(3) }],
  'claude-haiku-4-5': [{ in: 1, out: 5, cached: cache(1) }]
}

/** La tarifa vigente en esa fecha, o null si el modelo no tiene ninguna. */
function tarifaEn(model: string, at: number): Tarifa | null {
  const tramos = PRECIOS[model]
  if (!tramos) return null
  return tramos.find((t) => (t.desde ?? -Infinity) <= at && at < (t.hasta ?? Infinity)) ?? null
}

export function hayPrecio(model: string): boolean {
  return !!PRECIOS[model]
}

/**
 * Coste estimado de un turno, o `null` si no sabemos el precio de ese modelo.
 *
 * `null` y no `0`: son cosas distintas. Cero significa "no gastó"; null, "no lo sabemos", y
 * confundirlos haría que un modelo sin tarifa pareciera gratis.
 */
export function costeDe(t: TurnoUso): number | null {
  // La tarifa se busca por la fecha DEL TURNO, no por hoy: un turno de julio se cobró al precio
  // de julio, y recalcularlo con la tarifa de hoy reescribiría el pasado.
  const p = tarifaEn(t.model, t.at)
  if (!p) return null
  // Los cacheados se cobran aparte y mucho más barato: sumarlos al input infla la factura.
  // El proveedor los reporta DENTRO de inputTokens, así que hay que restarlos, no sumarlos.
  const cacheados = t.cachedInputTokens ?? 0
  const frescos = Math.max(0, t.inputTokens - cacheados)
  const precioCache = p.cached ?? p.in
  return (frescos * p.in + cacheados * precioCache + t.outputTokens * p.out) / 1_000_000
}
