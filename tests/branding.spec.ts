import { test, expect } from '@playwright/test'
import { launch, api, waitForState, serve, html, type Harness } from './helpers'

/**
 * Nuestras páginas (settings, downloads, error, new tab) no tienen dominio: `file://` no
 * tiene hostname. Ese hueco muestra la marca en vez de un "New tab" o un "localhost".
 */

let h: Harness

test.beforeAll(async () => { h = await launch() })
test.afterAll(async () => { await h?.close() })

test('en una página interna la pill dice Monper y lleva el iso', async () => {
  await api(h.win, 'openSettings')
  // Se espera por `internal`, no por la URL: el main vacía la url de nuestras páginas.
  await waitForState(h.win, (s) => (s.tabs.find((t) => t.id === s.activeId) as { internal?: string } | undefined)?.internal === 'settings')
  // Exacto, no substring: el topbar tiene un botón "Ask Monper" que lo pillaba de rebote.
  const marca = h.win.locator('button', { hasText: /^Monper$/ }).first()
  await expect(marca).toBeVisible()
  // El iso, no solo el texto.
  await expect(marca.locator('img')).toBeVisible()
})

test('en un sitio real la pill muestra el dominio, sin iso', async () => {
  const site = await serve({ '/': html('Un sitio') })
  try {
    await api(h.win, 'newTab')
    await api(h.win, 'go', site.url + '/')
    await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'Un sitio')
    const dominio = h.win.locator('button', { hasText: '127.0.0.1' }).first()
    await expect(dominio).toBeVisible()
    await expect(dominio.locator('img')).toHaveCount(0)
    await expect(h.win.locator('button', { hasText: /^Monper$/ })).toHaveCount(0)
  } finally {
    await site.close()
  }
})

test('la pestaña de una página interna lleva el iso', async () => {
  await api(h.win, 'openSettings')
  // Se espera por `internal`, no por la URL: el main vacía la url de nuestras páginas.
  await waitForState(h.win, (s) => (s.tabs.find((t) => t.id === s.activeId) as { internal?: string } | undefined)?.internal === 'settings')
  // Antes esto fallaba: la condición era `!tab.url` y settings SÍ tiene URL.
  const isos = await h.win.locator('img[src*="monper"]').count()
  expect(isos).toBeGreaterThan(0)
})

test('el título de la ventana sigue a la pestaña activa', async () => {
  // No se ve en la barra (frameless), pero sí en Mission Control y en el menú Ventana.
  // Antes ponía siempre "Monper": las pestañas son WebContentsView y el título del chrome
  // no cambiaba solo.
  const site = await serve({ '/': html('Página X') })
  try {
    await api(h.win, 'newTab')
    await api(h.win, 'go', site.url + '/')
    await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'Página X')
    await expect
      .poll(() => h.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((w) => !w.getParentWindow())?.getTitle() ?? ''))
      .toBe('Página X — Monper')
  } finally {
    await site.close()
  }
})
