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
  // El iso, no solo el texto. Ya no es un <img>: es un span con el PNG como máscara para
  // poder recolorearlo (ver MonperMark).
  await expect(marca.locator('.monper-mark')).toBeVisible()
})

test('en un sitio real la pill muestra el dominio, sin iso', async () => {
  const site = await serve({ '/': html('Un sitio') })
  try {
    await api(h.win, 'newTab')
    await api(h.win, 'go', site.url + '/')
    await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'Un sitio')
    const dominio = h.win.locator('button', { hasText: '127.0.0.1' }).first()
    await expect(dominio).toBeVisible()
    await expect(dominio.locator('.monper-mark')).toHaveCount(0)
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

test('el iso se oscurece en páginas de fondo claro', async () => {
  // El PNG es blanco sobre transparente y el topbar toma el color real de la página: sobre
  // un sitio claro el iso desaparecía. MonperMark usa el alfa como máscara y lo rellena con
  // `currentColor`, así que hereda los tokens que `.on-light` ya redefine.
  const claro = await serve({ '/': '<!doctype html><meta charset="utf-8"><title>Claro</title><body style="margin:0;background:#ffffff;height:100vh"></body>' })
  const oscuro = await serve({ '/': '<!doctype html><meta charset="utf-8"><title>Oscuro</title><body style="margin:0;background:#101014;height:100vh"></body>' })

  /** Luminancia del relleno del iso (0 = negro, 1 = blanco). */
  const lumMarca = async (): Promise<number> =>
    h.win.evaluate(() => {
      const el = document.querySelector('.monper-mark')
      if (!el) return -1
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).backgroundColor)
      if (!m) return -1
      const [r, g, b] = m.slice(1).map(Number)
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    })

  try {
    await api(h.win, 'newTab')
    await api(h.win, 'go', claro.url + '/')
    await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'Claro')
    await expect.poll(lumMarca, { timeout: 8000 }).toBeLessThan(0.4)

    await api(h.win, 'go', oscuro.url + '/')
    await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'Oscuro')
    await expect.poll(lumMarca, { timeout: 8000 }).toBeGreaterThan(0.6)
  } finally {
    await claro.close()
    await oscuro.close()
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
    const el = document.querySelector('.monper-mark')
    if (!el) return -1
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).backgroundColor)
    if (!m) return -1
    const [r, g, b] = m.slice(1).map(Number)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  })
  expect(lum, 'el iso tiene que ir en claro').toBeGreaterThan(0.6)
})
