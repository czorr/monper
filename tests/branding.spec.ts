import { test, expect } from '@playwright/test'
import { launch, api, waitForState, serve, html, type Harness } from './helpers'

/**
 * Nuestras páginas (settings, downloads, error, new tab) no tienen dominio: `file://` no
 * tiene hostname. Ese hueco muestra la marca en vez de un "New tab" o un "localhost".
 */

let h: Harness

test.beforeAll(async () => { h = await launch() })
test.afterAll(async () => { await h?.close() })

test('en una página interna la pill muestra el logo completo de Titanio', async () => {
  await api(h.win, 'openSettings')
  // Se espera por `internal`, no por la URL: el main vacía la url de nuestras páginas.
  await waitForState(h.win, (s) => (s.tabs.find((t) => t.id === s.activeId) as { internal?: string } | undefined)?.internal === 'settings')
  const marca = h.win.locator('button:has(.titanio-logo)').first()
  await expect(marca).toBeVisible()
  await expect(marca.getByRole('img', { name: 'Titanio' })).toBeVisible()
})

test('en un sitio real la pill muestra el dominio, sin iso', async () => {
  const site = await serve({ '/': html('Un sitio') })
  try {
    await api(h.win, 'newTab')
    await api(h.win, 'go', site.url + '/')
    await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'Un sitio')
    const dominio = h.win.locator('button', { hasText: '127.0.0.1' }).first()
    await expect(dominio).toBeVisible()
    await expect(dominio.locator('.titanio-logo')).toHaveCount(0)
    await expect(h.win.locator('header button:has(.titanio-logo)')).toHaveCount(0)
  } finally {
    await site.close()
  }
})

test('la pestaña de una página interna lleva el iso', async () => {
  await api(h.win, 'openSettings')
  // Se espera por `internal`, no por la URL: el main vacía la url de nuestras páginas.
  await waitForState(h.win, (s) => (s.tabs.find((t) => t.id === s.activeId) as { internal?: string } | undefined)?.internal === 'settings')
  // Antes esto fallaba: la condición era `!tab.url` y settings SÍ tiene URL.
  const isos = await h.win.locator('img[src*="titanio"]').count()
  expect(isos).toBeGreaterThan(0)
})

test('el título de la ventana sigue a la pestaña activa', async () => {
  // No se ve en la barra (frameless), pero sí en Mission Control y en el menú Ventana.
  // Antes ponía siempre "Titanio": las pestañas son WebContentsView y el título del chrome
  // no cambiaba solo.
  const site = await serve({ '/': html('Página X') })
  try {
    await api(h.win, 'newTab')
    await api(h.win, 'go', site.url + '/')
    await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'Página X')
    await expect
      .poll(() => h.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((w) => !w.getParentWindow())?.getTitle() ?? ''))
      .toBe('Página X — Titanio')
  } finally {
    await site.close()
  }
})

test('el logo completo hereda el color del contexto claro y oscuro', async () => {
  await api(h.win, 'openSettings')
  await waitForState(h.win, (s) => (s.tabs.find((t) => t.id === s.activeId) as { internal?: string } | undefined)?.internal === 'settings')
  await expect(h.win.locator('header .titanio-logo')).toBeVisible()
  // El logo vive en páginas internas. Se prueban ambos contextos de color sin navegar
  // a un sitio externo, donde la barra muestra el dominio y el logo no existe.
  const lumMarca = async (): Promise<number> =>
    h.win.evaluate(() => {
      const el = document.querySelector('header .titanio-logo')
      if (!el) return -1
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).backgroundColor)
      if (!m) return -1
      const [r, g, b] = m.slice(1).map(Number)
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    })

  try {
    await h.win.locator('header:has(.titanio-logo)').evaluate((el) => el.classList.add('on-light'))
    await expect.poll(lumMarca, { timeout: 8000 }).toBeLessThan(0.4)

    await h.win.locator('header:has(.titanio-logo)').evaluate((el) => el.classList.remove('on-light'))
    await expect.poll(lumMarca, { timeout: 8000 }).toBeGreaterThan(0.6)
  } finally {
    await h.win.locator('header:has(.titanio-logo)').evaluate((el) => el.classList.remove('on-light'))
  }
})

test('en una página interna el topbar va en claro sobre la vibrancy', async () => {
  // Nuestras páginas se dibujan translúcidas y mandan `pageColor: 'transparent'`. Eso no es
  // un color claro: detrás está la vibrancy oscura de la ventana. `luminance` no sabía leer
  // esa palabra, caía a blanco y ponía el topbar en modo claro — textos e iconos oscuros,
  // invisibles sobre el material.
  await api(h.win, 'openSettings')
  await waitForState(h.win, (s) => (s.tabs.find((t) => t.id === s.activeId) as { internal?: string } | undefined)?.internal === 'settings')

  const s = await waitForState(h.win, () => true)
  expect((s.active as { pageColor?: string } | null)?.pageColor).toBe('transparent')

  await expect(h.win.locator('header.on-light'), 'el topbar no debe entrar en modo claro').toHaveCount(0)
  const lum = await h.win.evaluate(() => {
    const el = document.querySelector('header .titanio-logo')
    if (!el) return -1
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).backgroundColor)
    if (!m) return -1
    const [r, g, b] = m.slice(1).map(Number)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  })
  expect(lum, 'el iso tiene que ir en claro').toBeGreaterThan(0.6)
})
