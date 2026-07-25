import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, waitForState, type Harness } from './helpers'

let h: Harness

test.beforeAll(async () => { h = await launch() })
test.afterAll(async () => { await h?.close() })

test('arranca y abre la ventana de chrome', async () => {
  expect(await h.app.evaluate(({ app }) => app.getName())).toBe('Monper')
  expect(await h.win.title()).toBeTruthy()
})

test('expone window.monper al renderer', async () => {
  const keys = await h.win.evaluate(() =>
    Object.keys((window as never as Record<string, object>)['monper'] ?? {})
  )
  expect(keys).toContain('newTab')
  expect(keys).toContain('onState')
})

test('abre con una pestaña y una activa', async () => {
  const s = await waitForState(h.win, (s) => s.tabs.length > 0)
  expect(s.tabs.length).toBeGreaterThan(0)
  expect(s.activeId).not.toBeNull()
})

test('el sidebar se renderiza con el botón de colapsar', async () => {
  await expect(h.win.locator('[title*="Colapsar sidebar"]')).toBeVisible()
})

test('la versión de la app coincide con package.json', async () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
  expect(await h.app.evaluate(({ app }) => app.getVersion())).toBe(pkg.version)
})

test('el chrome no acumula errores de consola al arrancar', async () => {
  const errors: string[] = []
  h.win.on('console', (m) => {
    if (m.type() !== 'error') return
    // Los fallos de red de recursos externos no son errores nuestros: los marcadores por
    // defecto piden su favicon a t1.gstatic.com y alguno devuelve 404 según el día. Este
    // test es sobre NUESTRO código; si se afirma sobre eso, falla por causas ajenas.
    if (/Failed to load resource/i.test(m.text())) { console.log('  (recurso externo)', m.text()); return }
    errors.push(m.text())
  })
  await h.win.reload()
  await h.win.waitForLoadState('domcontentloaded')
  await expect(h.win.locator('[title*="Colapsar sidebar"]')).toBeVisible()
  expect(errors, errors.join(' | ')).toEqual([])
})
