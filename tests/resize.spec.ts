import { test, expect } from '@playwright/test'
import { launch, api, type Harness } from './helpers'

/**
 * El borde de redimensionar. Su geometría no es libre: la vista de la página se dibuja
 * ENCIMA del DOM y empieza justo en el borde, así que todo lo que quede del lado del
 * contenido no recibe el ratón. La zona activa tiene que vivir del lado del chrome.
 */

let h: Harness

test.beforeAll(async () => { h = await launch() })
test.afterAll(async () => { await h?.close() })

const handle = (): ReturnType<Harness['win']['locator']> => h.win.locator('.group\\/rz').first()

test('el indicador está oculto en reposo y aparece al hover', async () => {
  const marca = handle().locator('span').first()
  await expect(marca).toHaveCSS('opacity', '0')
  await handle().hover()
  await expect(marca).toHaveCSS('opacity', '1')
})

test('la zona activa cae entera en el chrome, no bajo la vista de la página', async () => {
  // Si parte de la zona queda sobre el contenido, esos píxeles no reciben el ratón: es lo
  // que hacía difícil apuntar al borde.
  const panels = await api<{ sidebar: number }>(h.win, 'getPanels')
  const box = await handle().boundingBox()
  expect(box).toBeTruthy()
  expect(box!.width, 'la zona debe ser cómoda de apuntar').toBeGreaterThanOrEqual(10)
  // El borde está en x = ancho del sidebar; la zona termina ahí, no lo cruza.
  expect(Math.round(box!.x + box!.width)).toBeLessThanOrEqual(panels.sidebar)
})

test('arrastrar el borde cambia el ancho del sidebar', async () => {
  const antes = (await api<{ sidebar: number }>(h.win, 'getPanels')).sidebar
  const box = (await handle().boundingBox())!
  await h.win.mouse.move(box.x + box.width - 1, box.y + 300)
  await h.win.mouse.down()
  await h.win.mouse.move(box.x + box.width + 60, box.y + 300, { steps: 8 })
  await h.win.mouse.up()
  await expect
    .poll(async () => (await api<{ sidebar: number }>(h.win, 'getPanels')).sidebar)
    .toBeGreaterThan(antes)
})
