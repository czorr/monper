import { test, expect } from '@playwright/test'
import { launch, api, waitForState, serve, html, type Harness } from './helpers'

let h: Harness
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  site = await serve({ '/': html('Hola Monper'), '/otra': html('Otra página') })
  h = await launch()
})
test.afterAll(async () => { await h?.close(); await site?.close() })

test('crea una pestaña nueva y queda activa', async () => {
  const before = await waitForState(h.win, (s) => s.tabs.length > 0)
  const id = await api<number>(h.win, 'newTab')
  const after = await waitForState(h.win, (s) => s.tabs.length === before.tabs.length + 1)
  expect(after.activeId).toBe(id)
})

test('navega y refleja el título de la página en el estado', async () => {
  await api(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/')
  const s = await waitForState(h.win, (s) =>
    s.tabs.some((t) => t.title === 'Hola Monper')
  )
  expect(s.tabs.find((t) => t.id === s.activeId)?.title).toBe('Hola Monper')
})

test('cambia de pestaña con selectTab', async () => {
  const a = await api<number>(h.win, 'newTab')
  const b = await api<number>(h.win, 'newTab')
  await waitForState(h.win, (s) => s.activeId === b)
  await api(h.win, 'selectTab', a)
  const s = await waitForState(h.win, (s) => s.activeId === a)
  expect(s.activeId).toBe(a)
})

test('cierra una pestaña y desaparece del estado', async () => {
  const id = await api<number>(h.win, 'newTab')
  await waitForState(h.win, (s) => s.tabs.some((t) => t.id === id))
  await api(h.win, 'closeTab', id)
  const s = await waitForState(h.win, (s) => !s.tabs.some((t) => t.id === id))
  expect(s.tabs.some((t) => t.id === id)).toBe(false)
})

test('cerrar la última pestaña deja siempre una abierta', async () => {
  // Nunca debe quedarse en cero: la ventana sin contenido es un estado sin salida.
  let s = await waitForState(h.win, (s) => s.tabs.length > 0)
  for (const t of [...s.tabs]) await api(h.win, 'closeTab', t.id)
  s = await waitForState(h.win, (s) => s.tabs.length >= 1)
  expect(s.tabs.length).toBeGreaterThanOrEqual(1)
  expect(s.activeId).not.toBeNull()
})

test('reordena las pestañas', async () => {
  await api(h.win, 'newTab')
  await api(h.win, 'newTab')
  const s = await waitForState(h.win, (s) => s.tabs.length >= 3)
  const reversed = [...s.tabs.map((t) => t.id)].reverse()
  await api(h.win, 'reorderTabs', reversed)
  const after = await waitForState(h.win, (s) => s.tabs[0]?.id === reversed[0])
  expect(after.tabs.map((t) => t.id)).toEqual(reversed)
})

test('silencia y desilencia una pestaña', async () => {
  const id = await api<number>(h.win, 'newTab')
  await waitForState(h.win, (s) => s.tabs.some((t) => t.id === id))
  await api(h.win, 'toggleMute', id)
  const muted = await waitForState(h.win, (s) => !!s.tabs.find((t) => t.id === id)?.muted)
  expect(muted.tabs.find((t) => t.id === id)?.muted).toBe(true)
  await api(h.win, 'toggleMute', id)
  const un = await waitForState(h.win, (s) => !s.tabs.find((t) => t.id === id)?.muted)
  expect(un.tabs.find((t) => t.id === id)?.muted).toBeFalsy()
})

test('una URL que no resuelve muestra la página de error, no una pantalla en blanco', async () => {
  await api(h.win, 'newTab')
  await api(h.win, 'go', 'https://dominio-que-no-existe.monper-test')
  // La URL de la pestaña conserva lo que pidió el usuario (para que la omnibox lo muestre),
  // así que la señal de que se pintó la página de error es el título.
  const s = await waitForState(
    h.win,
    (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'Error',
    20_000
  )
  expect(s.tabs.find((t) => t.id === s.activeId)?.url).toContain('dominio-que-no-existe')
})

test('el efecto de pulsación no impide cerrar una pestaña', async () => {
  // La fila se hunde al pulsarla (`scale` + `translate-y`). Cuando ese efecto se aplicaba
  // también al pulsar sus BOTONES, el transform movía el botón de cerrar de debajo del
  // puntero y el click no llegaba a dispararse: parecía que cerrar no funcionaba.
  await api(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/')
  await waitForState(h.win, (s) => s.tabs.some((t) => t.title === 'Hola Monper'))
  const antes = (await waitForState(h.win, () => true)).tabs.length

  const fila = h.win.locator('.group\\/tab').first()
  await fila.hover()
  await fila.locator('[title="Cerrar"]').click()
  await expect.poll(async () => (await waitForState(h.win, () => true)).tabs.length).toBe(antes - 1)
})
