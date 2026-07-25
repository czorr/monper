import { test, expect } from '@playwright/test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { launch, api, waitForState, serve, html } from './helpers'

/**
 * Banco de medidas, no tests de aprobado/suspenso.
 *
 * Existe para que "el browser va lento" deje de ser una opinión: imprime números
 * reproducibles y los compara contra un techo generoso. Si algún día un cambio duplica el
 * arranque o el cambio de pestaña, esto lo dice — pero los umbrales son deliberadamente
 * flojos para que el CI no se vuelva un adivino (la máquina de CI es más lenta y variable).
 *
 *   pnpm test:only tests/perf.spec.ts
 *
 * Los números que importan salen por consola; guárdalos antes de optimizar algo.
 */

/** Mediana: más honesta que la media cuando una muestra se va por el techo. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function report(label: string, samples: number[]): number {
  const med = median(samples)
  const max = Math.max(...samples)
  console.log(`  ${label.padEnd(38)} mediana ${med.toFixed(0).padStart(5)}ms   peor ${max.toFixed(0)}ms   (n=${samples.length})`)
  return med
}

/**
 * First contentful paint, esperando la entrada. Un `?? 0` de fallback ya metió dos veces
 * medianas falsas de "0ms" en este banco: la medida se espera o falla, no se inventa.
 */
async function medirFcp(win: Awaited<ReturnType<typeof launch>>['win']): Promise<number> {
  const v = await win.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const leer = (): number | undefined =>
          (performance.getEntriesByName('first-contentful-paint')[0] ??
            performance.getEntriesByType('paint')[0])?.startTime
        const ya = leer()
        if (ya !== undefined) return resolve(ya)
        const t0 = Date.now()
        const iv = setInterval(() => {
          const x = leer()
          if (x !== undefined) { clearInterval(iv); resolve(x) }
          else if (Date.now() - t0 > 5000) { clearInterval(iv); reject(new Error('sin entrada de paint')) }
        }, 50)
      })
  )
  expect(v, 'first contentful paint no puede ser 0').toBeGreaterThan(0)
  return v
}

test('arranque: hasta que el chrome es interactivo', async () => {
  const samples: number[] = []
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now()
    // Sin el listener de estado: ese instala un reload que falsearía la medida al alza.
    const h = await launch({}, undefined, { skipStateListener: true })
    // "Interactivo" = el sidebar está pintado y la fila de pestañas existe.
    await h.win.locator('[title*="Colapsar sidebar"]').waitFor()
    samples.push(Date.now() - t0)
    await h.close()
  }
  // Incluye lanzar Electron desde cero (que en dev no es lo que ve el usuario al abrir la app).
  expect(report('arranque → chrome interactivo', samples)).toBeLessThan(8000)
})

test('pintado del chrome (aislado del arranque de Electron)', async () => {
  // El wall-clock de `launch()` lo domina spawnear Electron (~900ms) y tapa cualquier
  // mejora de nuestro bundle. Esto mide solo lo nuestro: desde que la ventana empieza a
  // cargar hasta el primer pixel pintado, medido por el propio Chromium.
  const pinturas: number[] = []
  for (let i = 0; i < 3; i++) {
    const h = await launch({}, undefined, { skipStateListener: true })
    await h.win.locator('[title*="Colapsar sidebar"]').waitFor()
    pinturas.push(await medirFcp(h.win))
    await h.close()
  }
  expect(report('first contentful paint', pinturas)).toBeLessThan(1500)
})

test('arranque de la app EMPAQUETADA (el que ve el usuario)', async () => {
  // El de desarrollo no es comparable: carga desde el dev server y sin asar. Este test se
  // salta si no hay build empaquetada, para no romper el CI.
  const exe = join(process.cwd(), 'release/mac-arm64/Monper.app/Contents/MacOS/Monper')
  test.skip(!existsSync(exe), 'no hay build empaquetada (pnpm dist:dir --mac --arm64)')

  const arranques: number[] = []
  const pinturas: number[] = []
  for (let i = 0; i < 4; i++) {
    const t0 = Date.now()
    const h = await launch({}, undefined, { skipStateListener: true, exe })
    await h.win.locator('[title*="Colapsar sidebar"]').waitFor()
    arranques.push(Date.now() - t0)
    pinturas.push(await medirFcp(h.win))
    await h.close()
  }
  report('EMPAQUETADA: arranque → interactivo', arranques)
  report('EMPAQUETADA: first contentful paint', pinturas)
  expect(median(arranques), 'la app empaquetada tarda demasiado en arrancar').toBeLessThan(10_000)
})

test('cuánto pesa el chrome al arrancar', () => {
  // Se mide en disco, no con Resource Timing: en `file://` `decodedBodySize` es 0 y la
  // medida salía como "0 KB", que es exactamente el tipo de número que engaña.
  const dir = join(process.cwd(), 'out/renderer')
  const htmlSrc = readFileSync(join(dir, 'index.html'), 'utf8')
  const chunks = [...new Set(htmlSrc.match(/assets\/[a-zA-Z0-9_-]+\.js/g) ?? [])]
  const total = chunks.reduce((n, c) => n + statSync(join(dir, c)).size, 0)
  const kb = Math.round(total / 1024)
  const top = chunks
    .map((c) => ({ c, kb: Math.round(statSync(join(dir, c)).size / 1024) }))
    .sort((a, b) => b.kb - a.kb)
    .slice(0, 4)
  console.log(`  ${'JS que carga el chrome (index.html)'.padEnd(38)} ${kb} KB en ${chunks.length} chunks`)
  for (const t of top) console.log(`      ${t.kb.toString().padStart(4)} KB  ${t.c}`)
  // El chrome es un sidebar y una topbar. Medio mega de JS no es lo que necesita.
  expect(kb, 'el chrome carga demasiado JS al arrancar').toBeLessThan(700)
})

test('interacciones: pestaña nueva, cambio de pestaña, navegación', async () => {
  const site = await serve({ '/a': html('A'), '/b': html('B') })
  const h = await launch()
  try {
    // --- pestaña nueva ---
    const nuevas: number[] = []
    const ids: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now()
      const id = await api<number>(h.win, 'newTab')
      await waitForState(h.win, (s) => s.activeId === id)
      nuevas.push(Date.now() - t0)
      ids.push(id)
    }
    // Los umbrales son canarios, no objetivos: el valor está en la mediana que se imprime.
    // Holgados a propósito porque el runner de CI es más lento y más variable que este Mac.
    expect(report('pestaña nueva → activa', nuevas)).toBeLessThan(800)

    // --- cambio de pestaña (lo que el usuario percibe como "flash gris") ---
    const cambios: number[] = []
    for (let i = 0; i < 6; i++) {
      const target = ids[i % ids.length]
      const t0 = Date.now()
      await api(h.win, 'selectTab', target)
      await waitForState(h.win, (s) => s.activeId === target)
      cambios.push(Date.now() - t0)
    }
    expect(report('cambio de pestaña', cambios)).toBeLessThan(600)

    // --- navegación a una página local (sin red) ---
    const navs: number[] = []
    for (let i = 0; i < 4; i++) {
      const path = i % 2 ? '/b' : '/a'
      const titulo = i % 2 ? 'B' : 'A'
      const t0 = Date.now()
      await api(h.win, 'go', site.url + path)
      await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === titulo)
      navs.push(Date.now() - t0)
    }
    expect(report('navegación (página local)', navs)).toBeLessThan(2000)
  } finally {
    await h.close()
    await site.close()
  }
})

test('memoria: coste de cada pestaña', async () => {
  const site = await serve({ '/': html('Peso') })
  const h = await launch()
  try {
    const mem = async (): Promise<number> =>
      h.app.evaluate(({ app }) =>
        app.getAppMetrics().reduce((n, m) => n + (m.memory?.workingSetSize ?? 0), 0)
      )
    const base = await mem()
    for (let i = 0; i < 5; i++) {
      await api(h.win, 'newTab')
      await api(h.win, 'go', site.url + '/')
      await waitForState(h.win, (s) => s.tabs.some((t) => t.title === 'Peso'))
    }
    const after = await mem()
    const porPestana = Math.round((after - base) / 5 / 1024)
    console.log(`  ${'base'.padEnd(38)} ${Math.round(base / 1024)} MB`)
    console.log(`  ${'por pestaña (5 páginas iguales)'.padEnd(38)} ${porPestana} MB`)
    expect(porPestana, 'cada pestaña cuesta demasiada memoria').toBeLessThan(150)
  } finally {
    await h.close()
    await site.close()
  }
})
