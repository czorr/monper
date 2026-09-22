import { test, expect } from '@playwright/test'
import { launch, api, waitForState, serve, html, type Harness } from './helpers'
import { itemsDeCorrector, MAX_SUGERENCIAS } from '../src/main/contextmenu'

/**
 * Imprimir y corrector ortográfico.
 *
 * Lo que NO se puede probar aquí y se dice para que nadie lo dé por cubierto: el diálogo de
 * impresión es del sistema y bloquearía la suite, y el subrayado del corrector vive dentro
 * del renderer de Chromium. Lo que sí se fija es que la capacidad esté encendida y accesible,
 * que es exactamente lo que faltaba: `spellcheck` no aparecía ni una vez en el código.
 */

let h: Harness
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  site = await serve({ '/': html('Escribir', '<textarea id="t"></textarea>') })
  h = await launch()
  await api(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/')
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'Escribir')
})
test.afterAll(async () => { await h?.close(); await site?.close() })

test('el menú ofrece las sugerencias del corrector', () => {
  /**
   * Lo que faltaba de verdad: el subrayado rojo salía pero el menú no ofrecía NADA, así que
   * había que borrar la palabra y reescribirla adivinando.
   *
   * `getLastWebPreferences` solo reporta un subconjunto y no incluye `spellcheck`, así que no
   * sirve para verificar que esté activo. Se prueba la decisión que sí es nuestra: qué se le
   * ofrece al usuario cuando Chromium marca una palabra.
   */
  const acciones = { reemplazar: () => {}, aprender: () => {} }
  const conSugerencias = itemsDeCorrector(
    { isEditable: true, misspelledWord: 'ortografia', dictionarySuggestions: ['ortografía', 'ortográfica'] },
    acciones
  )
  expect(conSugerencias.map((i) => i.label)).toEqual([
    'ortografía', 'ortográfica', 'Añadir “ortografia” al diccionario', undefined
  ])

  // Sin sugerencias se dice, no se deja el menú mudo: si no, no sabes si el corrector falla
  // o si esa palabra no tiene arreglo.
  const sinSugerencias = itemsDeCorrector(
    { isEditable: true, misspelledWord: 'xyzzy', dictionarySuggestions: [] },
    acciones
  )
  expect(sinSugerencias[0].label).toBe('Sin sugerencias')
  expect(sinSugerencias[0].enabled).toBe(false)

  // Se recorta: Chromium puede devolver muchas y taparían el resto del menú.
  const muchas = itemsDeCorrector(
    { isEditable: true, misspelledWord: 'x', dictionarySuggestions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
    acciones
  )
  expect(muchas.filter((i) => i.type !== 'separator' && !String(i.label).startsWith('Añadir'))).toHaveLength(MAX_SUGERENCIAS)

  // Fuera de un campo editable, o sin palabra marcada, no se ofrece nada.
  expect(itemsDeCorrector({ isEditable: false, misspelledWord: 'x', dictionarySuggestions: ['y'] }, acciones)).toEqual([])
  expect(itemsDeCorrector({ isEditable: true, misspelledWord: '', dictionarySuggestions: [] }, acciones)).toEqual([])
})

test('el corrector tiene un diccionario con el que trabajar', async () => {
  // En macOS lo resuelve el corrector del SISTEMA y la lista de Electron viene vacía: eso no
  // es un fallo. En el resto de plataformas una lista vacía sí significa que no corrige nada.
  const r = await h.app.evaluate(({ session }) => {
    const ses = session.fromPartition('persist:titanio')
    return { plataforma: process.platform, idiomas: ses.availableSpellCheckerLanguages.length }
  })
  if (r.plataforma === 'darwin') expect(r.plataforma).toBe('darwin')
  else expect(r.idiomas, 'sin idiomas disponibles no corrige nada').toBeGreaterThan(0)
})

test('Imprimir está en el menú, con ⌘P', async () => {
  const item = await h.app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    for (const top of menu?.items ?? []) {
      for (const sub of top.submenu?.items ?? []) {
        if (/imprimir/i.test(sub.label)) return { label: sub.label, accel: sub.accelerator ?? null }
      }
    }
    return null
  })
  expect(item, 'sin entrada de menú no hay forma de imprimir').toBeTruthy()
  expect(item!.accel).toBe('CmdOrCtrl+P')
})
