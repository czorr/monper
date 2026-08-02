import { test, expect } from '@playwright/test'
import { launch, type Harness } from './helpers'

/**
 * Que las secciones de Settings no se empalmen.
 *
 * `ImportSection` se incrusta DENTRO de General en vez de ser una pestaña propia, y su botón
 * y su resumen quedaban fuera de todo `<Group>` — o sea, sin el `mb-9` que separa una sección
 * de la siguiente. Resultado: "Importar" pegado al título "Navegación".
 *
 * Se mide la distancia real entre elementos, no se comparan capturas: un test de píxeles se
 * rompe con cada retoque de estilo y no dice qué falló.
 */

let h: Harness

test.beforeAll(async () => {
  h = await launch()
  await h.app.evaluate(({ Menu }) => {
    const a = Menu.getApplicationMenu()?.items.flatMap((i) => i.submenu?.items ?? [])
    ;(a?.find((i) => i.label === 'Settings…') ?? a?.find((i) => i.label === 'Ajustes…'))?.click()
  })
  await expect.poll(async () => h.app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().some((w) => w.getURL().includes('settings.html'))
  ), { timeout: 10_000 }).toBe(true)
})
test.afterAll(async () => { await h?.close() })

/** Ejecuta código dentro de la página de Settings. */
async function enSettings<T>(codigo: string): Promise<T> {
  return h.app.evaluate(async ({ webContents }, codigo) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('settings.html'))
    if (!wc) throw new Error('Settings no está abierto')
    return (await wc.executeJavaScript(codigo, true)) as T
  }, codigo) as Promise<T>
}

test('en General, el botón de importar no se empalma con la sección siguiente', async () => {
  await enSettings(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'General')
    if (b) b.click()
  })()`)
  await new Promise((r) => setTimeout(r, 600))

  const hueco = await enSettings<number>(`(() => {
    const boton = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Importar'))
    const titulos = [...document.querySelectorAll('h2')]
    const siguiente = titulos.find((t) => t.textContent.trim() === 'Navegación')
    if (!boton || !siguiente) return -1
    return siguiente.getBoundingClientRect().top - boton.getBoundingClientRect().bottom
  })()`)

  expect(hueco, 'no se encontraron el botón de importar o la sección Navegación').toBeGreaterThan(-1)
  // El mismo aire que deja un <Group> entre secciones (mb-9 = 36px). Con margen de holgura
  // para no atarse al píxel exacto.
  expect(hueco, 'Importar quedó pegado a la sección siguiente').toBeGreaterThanOrEqual(24)
})

test('ninguna etiqueta del nav sale cortada', async () => {
  // "Notification Use" no cabía y salía como "Notification U…". Un nav que trunca sus propias
  // opciones parece roto, y encima esconde de qué va la sección.
  const r = await enSettings<{ total: number; cortadas: string[] }>(`(() => {
    // El nav son los botones que llevan un <span> de etiqueta con truncado.
    const botones = [...document.querySelectorAll('button')]
      .map((b) => b.querySelector('span.truncate'))
      .filter(Boolean)
    return {
      total: botones.length,
      cortadas: botones.filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent.trim())
    }
  })()`)
  // Sin esto el test pasaría en vacío si el selector dejara de encontrar el nav: comprobar
  // "ninguno está cortado" sobre una lista vacía es siempre cierto y no prueba nada.
  expect(r.total, 'el selector no encontró el nav — el test estaría pasando en vacío').toBeGreaterThan(10)
  expect(r.cortadas, 'hay etiquetas del nav que no caben').toEqual([])
})
