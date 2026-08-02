import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, api, waitForState, type Harness } from './helpers'

/**
 * La altura del topbar está escrita DOS veces: `--spacing-topbar` en styles.css (lo que mide la
 * banda en el DOM) y `TOPBAR_HEIGHT` en main (dónde empieza la vista de la página). Si se
 * separan, la web tapa el topbar o queda una franja muerta — y no lo avisa nadie.
 */
test('la altura del topbar coincide entre el CSS y el main', () => {
  const css = readFileSync(join(__dirname, '../src/renderer/src/styles.css'), 'utf-8')
  const ts = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf-8')
  const enCss = Number(/--spacing-topbar:\s*(\d+)px/.exec(css)?.[1])
  const enMain = Number(/const TOPBAR_HEIGHT = (\d+)/.exec(ts)?.[1])
  expect(enCss, 'no se encontró --spacing-topbar en styles.css').toBeGreaterThan(0)
  expect(enMain, 'no se encontró TOPBAR_HEIGHT en index.ts').toBeGreaterThan(0)
  expect(enMain, 'el CSS y el main discrepan sobre cuánto mide el topbar').toBe(enCss)
})

test('el semáforo comparte centro con la banda del topbar', () => {
  /**
   * Los botones de macOS miden 12px, así que su centro es y+6. Si no cae en el centro de la
   * banda, el semáforo y los iconos del topbar quedan a distinta altura en la misma línea —
   * ya pasó una vez, con tres centros distintos (23, 24 y 26).
   */
  const ts = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf-8')
  const alto = Number(/const TOPBAR_HEIGHT = (\d+)/.exec(ts)?.[1])
  expect(ts, 'el semáforo dejó de derivarse de TOPBAR_HEIGHT').toContain('TOPBAR_HEIGHT / 2 - 6')
  expect(alto / 2 - 6).toBeGreaterThan(0) // la cuenta tiene que dar un offset válido
})

test('la vista de la página empieza justo debajo del topbar', async () => {
  // La comprobación de verdad: que el número del main se traduzca en la posición real.
  const h: Harness = await launch()
  await api(h.win, 'newTab')
  await waitForState(h.win, (s) => s.tabs.length > 0)
  const r = await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.getParentWindow())!
    const v = (w.contentView.children as unknown as {
      getVisible: () => boolean; getBounds: () => { y: number }
    }[]).find((k) => k.getVisible())!
    return v.getBounds().y
  })
  const ts = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf-8')
  expect(r).toBe(Number(/const TOPBAR_HEIGHT = (\d+)/.exec(ts)?.[1]))
  await h.close()
})
