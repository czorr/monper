import { test, expect } from '@playwright/test'
import { congelable } from '../src/main/agent/mastra'
import type { BrowserControl } from '../src/main/agent/mastra'

/**
 * Parar al agente de verdad.
 *
 * El bug: se le encargaba una tarea, se pausaba a la mitad y se cerraba su pestaña — y la
 * pestaña **volvía a abrirse sola y seguía ejecutando acciones**, indefinidamente. La causa era
 * que `abortSignal` nunca llegaba al SDK: pausar solo hacía que nuestro bucle dejara de emitir,
 * mientras la generación y las herramientas seguían corriendo por debajo. `openTab` reabría la
 * pestaña que el usuario acababa de cerrar.
 *
 * Aquí se prueba la segunda capa, la que se puede probar sin proveedor: una herramienta que
 * llega tarde a la fiesta **no puede tocar nada**. Pausar significa que no se toca más, no que
 * no se pide más.
 */

/** Control de mentira que apunta lo que le piden. */
function espia(): { ctrl: BrowserControl; hechos: string[] } {
  const hechos: string[] = []
  return {
    hechos,
    ctrl: {
      getWc: () => { hechos.push('getWc'); return undefined },
      listTabs: () => { hechos.push('listTabs'); return [{ id: 1, title: 't', url: 'u', active: true }] },
      openTab: (url) => { hechos.push(`openTab:${url}`); return 42 },
      switchTab: (id) => { hechos.push(`switchTab:${id}`); return true },
      closeTab: (id) => { hechos.push(`closeTab:${id}`); return true },
      drainEvents: () => { hechos.push('drainEvents'); return ['algo'] }
    }
  }
}

test('sin pausa, el control pasa tal cual', () => {
  const { ctrl, hechos } = espia()
  const c = congelable(ctrl, new AbortController().signal)
  expect(c.openTab('https://ejemplo.test')).toBe(42)
  expect(c.switchTab(3)).toBe(true)
  expect(c.listTabs()).toHaveLength(1)
  expect(hechos).toContain('openTab:https://ejemplo.test')
})

test('tras pausar, abrir una pestaña LANZA en vez de abrirla', () => {
  // Es el corazón del bug: `openTab` reabría la pestaña que el usuario acababa de cerrar.
  // Lanza y no devuelve un id falso a propósito: el modelo tiene que enterarse de que paró.
  const { ctrl, hechos } = espia()
  const ac = new AbortController()
  const c = congelable(ctrl, ac.signal)
  ac.abort()

  expect(() => c.openTab('https://ejemplo.test')).toThrow(/par/i)
  expect(hechos, 'no debe haber llegado nada al navegador').toEqual([])
})

test('tras pausar, ninguna acción toca el navegador', () => {
  const { ctrl, hechos } = espia()
  const ac = new AbortController()
  const c = congelable(ctrl, ac.signal)
  ac.abort()

  expect(c.switchTab(3)).toBe(false)
  expect(c.closeTab(3)).toBe(false)
  expect(c.getWc()).toBeUndefined()
  expect(c.listTabs()).toEqual([])
  expect(c.drainEvents?.()).toEqual([])
  expect(hechos, 'una pausa tiene que congelar TODAS las acciones, no solo abrir').toEqual([])
})

test('la pausa a mitad de vuelo congela lo que quede', () => {
  // El caso real: la herramienta ya estaba en marcha cuando llegó la pausa. Lo que venga
  // después de ese instante no se ejecuta.
  const { ctrl, hechos } = espia()
  const ac = new AbortController()
  const c = congelable(ctrl, ac.signal)

  c.switchTab(1)
  ac.abort()
  c.switchTab(2)

  expect(hechos).toEqual(['switchTab:1'])
})
