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
 */
export const PRECIOS: Record<string, { in: number; out: number; cached?: number }> = {
  'claude-opus-4-8': { in: 5, out: 25, cached: 0.5 },
  'claude-opus-4-7': { in: 5, out: 25, cached: 0.5 },
  'claude-opus-4-6': { in: 5, out: 25, cached: 0.5 },
  'claude-fable-5': { in: 10, out: 50, cached: 1 },
  'claude-sonnet-5': { in: 3, out: 15, cached: 0.3 },
  'claude-sonnet-4-6': { in: 3, out: 15, cached: 0.3 },
  'claude-haiku-4-5': { in: 1, out: 5, cached: 0.1 }
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
  const p = PRECIOS[t.model]
  if (!p) return null
  // Los cacheados se cobran aparte y mucho más barato: sumarlos al input infla la factura.
  // El proveedor los reporta DENTRO de inputTokens, así que hay que restarlos, no sumarlos.
  const cacheados = t.cachedInputTokens ?? 0
  const frescos = Math.max(0, t.inputTokens - cacheados)
  const precioCache = p.cached ?? p.in
  return (frescos * p.in + cacheados * precioCache + t.outputTokens * p.out) / 1_000_000
}
