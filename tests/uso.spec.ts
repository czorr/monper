import { test, expect } from '@playwright/test'
import { launch, type Harness } from './helpers'
import type { ResumenUso, TurnoUso } from '../src/shared/types'
import { costeDe, PRECIOS } from '../src/shared/precios'

/**
 * Consumo del agente (Settings → Billing / Statistics).
 *
 * Lo que se comprueba es la aritmética y las decisiones que la rodean, no la pantalla. Un
 * número mal calculado en una pantalla que se llama "Billing" es peor que no tener la pantalla:
 * el usuario toma decisiones de dinero con él.
 */

let h: Harness

test.beforeAll(async () => {
  h = await launch()
  await h.app.evaluate(({ Menu }) => {
    const buscar = (l: string): Electron.MenuItem | undefined =>
      Menu.getApplicationMenu()?.items.flatMap((i) => i.submenu?.items ?? []).find((i) => i.label === l)
    ;(buscar('Settings…') ?? buscar('Ajustes…') ?? buscar('Preferencias…'))?.click()
  })
  await expect.poll(async () => h.app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().some((w) => w.getURL().includes('settings.html'))
  ), { timeout: 10_000 }).toBe(true)
})
test.afterAll(async () => { await h?.close() })

async function enSettings<T>(metodo: string, ...args: unknown[]): Promise<T> {
  return h.app.evaluate(async ({ webContents }, { metodo, args }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('settings.html'))
    if (!wc) throw new Error('Settings no está abierto')
    return (await wc.executeJavaScript(`window.titanioTab.${metodo}(${args.map((a) => JSON.stringify(a)).join(',')})`)) as T
  }, { metodo, args }) as Promise<T>
}

test('un modelo sin tarifa conocida NO inventa un precio', async () => {
  // Es la decisión que más importa aquí: preferir un hueco a un número inventado. Si algún día
  // alguien "completa" la tabla de precios a ojo, este test debe caerse.
  const antes = await enSettings<ResumenUso>('usageSummary', 30)
  expect(antes).toBeTruthy()
  for (const m of antes.porModelo) {
    if (!m.conPrecio) expect(m.coste, `${m.model} no tiene tarifa y aun así suma dinero`).toBe(0)
  }
})

test('el resumen arranca coherente aunque no haya turnos', async () => {
  const r = await enSettings<ResumenUso>('usageSummary', 30)
  expect(r.turnos).toBeGreaterThanOrEqual(0)
  expect(r.coste).toBeGreaterThanOrEqual(0)
  expect(r.gastoHoy).toBeGreaterThanOrEqual(0)
  // El coste total nunca puede ser menor que el de hoy: hoy está dentro de los 30 días.
  if (r.dias >= 1) expect(r.coste + 1e-9).toBeGreaterThanOrEqual(r.gastoHoy)
  expect(Array.isArray(r.porDia)).toBe(true)
  expect(Array.isArray(r.porModelo)).toBe(true)
})

test('el límite de gasto se guarda y se puede quitar', async () => {
  expect(await enSettings<number>('usageLimit', 5)).toBe(5)
  expect(await enSettings<number>('usageLimit'), 'leer sin argumento no debe borrarlo').toBe(5)
  // 0 = sin techo. Es la forma de quitarlo, y tiene que sobrevivir a leerlo otra vez.
  expect(await enSettings<number>('usageLimit', 0)).toBe(0)
  expect(await enSettings<number>('usageLimit')).toBe(0)
})

test('un límite negativo o absurdo se trata como "sin límite", no como cero gasto', async () => {
  // Guardar -3 y luego comparar `gasto >= -3` bloquearía el agente para siempre.
  expect(await enSettings<number>('usageLimit', -3)).toBe(0)
  expect(await enSettings<number>('usageLimit', Number.NaN)).toBe(0)
})

test('borrar el consumo lo deja a cero, no rompe el resumen', async () => {
  const r = await enSettings<ResumenUso>('usageClear')
  expect(r.turnos).toBe(0)
  expect(r.coste).toBe(0)
  expect(r.porDia).toEqual([])
  expect(r.porModelo).toEqual([])
})

test('el chrome no puede leer ni tocar el consumo', async () => {
  // Es historial de uso del usuario: misma regla que marcadores o vault.
  const tipo = await h.win.evaluate(() => {
    const m = (window as never as Record<string, Record<string, unknown>>)['titanio']
    return typeof m?.['usageSummary']
  })
  expect(tipo).toBe('undefined')
})

/**
 * La aritmética del coste, sin levantar la app: `precios.ts` vive en shared justo para esto.
 * Es la parte que el usuario mira para decidir cuánto gasta, así que va con números a mano.
 */
// Por defecto un modelo de tarifa PLANA: los tests de aritmética no deben depender de si hoy
// cae dentro de un precio de lanzamiento. Eso se prueba aparte, con fechas explícitas.
const turno = (p: Partial<TurnoUso>): TurnoUso => ({
  at: Date.now(), kind: 'anthropic', model: 'claude-opus-5',
  inputTokens: 0, outputTokens: 0, steps: 0, ok: true, ...p
})

test('el coste sale de los precios reales, no de una aproximación', () => {
  // Opus 5: $5 por millón de input, $25 por millón de output.
  const c = costeDe(turno({ inputTokens: 1_000_000, outputTokens: 1_000_000 }))
  expect(c).toBeCloseTo(5 + 25, 6)
})

test('los tokens cacheados se cobran a su tarifa, no a la de input', () => {
  /**
   * Es la trampa de esta cuenta: el proveedor reporta los cacheados DENTRO de inputTokens. Si
   * se suman aparte se cobra dos veces, y si se ignoran se infla la factura — un turno con
   * mucha caché puede costar diez veces menos de lo que diría la cuenta ingenua.
   */
  const t = turno({ inputTokens: 1_000_000, cachedInputTokens: 900_000, outputTokens: 0 })
  // 100k frescos a $5/M + 900k cacheados a $0.50/M (la caché es la décima parte del input)
  expect(costeDe(t)).toBeCloseTo(0.1 * 5 + 0.9 * 0.5, 6)
  // Y siempre sale MÁS BARATO que si no hubiera caché.
  expect(costeDe(t)!).toBeLessThan(costeDe(turno({ inputTokens: 1_000_000 }))!)
})

test('un modelo desconocido devuelve null, que no es lo mismo que gratis', () => {
  expect(costeDe(turno({ model: 'modelo-que-no-existe', inputTokens: 999_999 }))).toBeNull()
})

test('ningún precio de la tabla es cero o negativo', () => {
  // Un cero colado en la tabla haría que un modelo de pago apareciera como gratis, que es
  // justo el error que este panel no se puede permitir.
  for (const [modelo, tramos] of Object.entries(PRECIOS)) {
    expect(tramos.length, `${modelo}: sin tarifas`).toBeGreaterThan(0)
    for (const p of tramos) {
      expect(p.in, `${modelo}: input`).toBeGreaterThan(0)
      expect(p.out, `${modelo}: output`).toBeGreaterThan(0)
      expect(p.out, `${modelo}: el output siempre cuesta más que el input`).toBeGreaterThan(p.in)
      if (p.cached !== undefined) {
        expect(p.cached, `${modelo}: la caché debe ser más barata que el input`).toBeLessThan(p.in)
        expect(p.cached).toBeGreaterThan(0)
      }
    }
  }
})

test('los tramos de fecha de un modelo no se solapan ni dejan hueco', () => {
  // Un solape haría que el coste dependiera del orden del array; un hueco dejaría turnos de
  // esa ventana sin tarifa, o sea contados como "sin precio" cuando sí lo tienen.
  for (const [modelo, tramos] of Object.entries(PRECIOS)) {
    const ordenados = [...tramos].sort((a, b) => (a.desde ?? -Infinity) - (b.desde ?? -Infinity))
    for (let i = 1; i < ordenados.length; i++) {
      expect(ordenados[i - 1].hasta, `${modelo}: tramo ${i - 1} sin fin`).toBeDefined()
      expect(ordenados[i].desde, `${modelo}: tramo ${i} sin inicio`).toBeDefined()
      expect(ordenados[i - 1].hasta, `${modelo}: hueco o solape entre tramos`).toBe(ordenados[i].desde)
    }
  }
})

test('el precio de lanzamiento de Sonnet 5 caduca solo', () => {
  // Aplicar la tarifa de lista a un turno cobrado al precio promocional infla la factura; y al
  // revés, dejar el promocional puesto la subestimaría para siempre. Se elige por la fecha del
  // turno, no por la de hoy: un turno de julio se cobró al precio de julio.
  const antes = new Date('2026-08-15T00:00:00Z').getTime()
  const despues = new Date('2026-09-15T00:00:00Z').getTime()
  const uno = (at: number): number =>
    costeDe(turno({ model: 'claude-sonnet-5', at, inputTokens: 1_000_000 }))!
  expect(uno(antes)).toBeCloseTo(2, 6)
  expect(uno(despues)).toBeCloseTo(3, 6)
})
