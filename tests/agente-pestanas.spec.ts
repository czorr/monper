import { test, expect } from '@playwright/test'
import { SYSTEM } from '../src/main/agent/mastra'

/**
 * Dónde trabaja el agente: ¿la pestaña del usuario o una suya?
 *
 * "navega a youtube" debe reusar la pestaña actual; "abre youtube" debe abrir una del agente.
 * Eso NO se consigue con un modelo más listo: se consigue con un contrato explícito, porque el
 * modelo elige la herramienta por lo que dice su descripción. Antes las dos describían el
 * mecanismo ("carga una URL en la activa" / "abre una nueva") y ninguna decía CUÁNDO, así que
 * las dos encajaban igual de bien en cualquier frase.
 *
 * Estos tests NO prueban al modelo —eso necesita un proveedor de verdad—. Prueban que el
 * contrato sigue ahí, que es lo que un refactor puede llevarse por delante sin que nadie lo note
 * hasta que un usuario pierde la página que estaba leyendo.
 */

test('el prompt distingue mover al usuario de traerle algo', () => {
  expect(SYSTEM).toContain('DÓNDE TRABAJAS')
  // Los tres casos: la página actual, el verbo de movimiento y el encargo aparte.
  expect(SYSTEM).toMatch(/navega a|ve a/i)
  expect(SYSTEM).toMatch(/abre/i)
  expect(SYSTEM).toContain('open_tab')
})

test('el prompt fija el desempate hacia el error barato', () => {
  /**
   * La asimetría es el argumento entero: navegar la pestaña activa destruye lo que el usuario
   * estaba leyendo y no lo recupera; una pestaña de más se cierra en un clic. Si alguien
   * invierte este desempate, que sea a propósito.
   */
  expect(SYSTEM).toMatch(/ante la duda|desempate/i)
  expect(SYSTEM.toLowerCase()).toContain('destruye')
})

test('el prompt cierra el agujero de run_js', () => {
  // Dentro de run_js `page` es SIEMPRE la pestaña activa, así que un page.goto() ahí navega la
  // del usuario. Como el prompt pide preferir run_js, sin esta instrucción la regla de arriba
  // no se podría cumplir por el camino que el propio prompt recomienda.
  expect(SYSTEM).toContain('page.goto')
  expect(SYSTEM).toMatch(/antes a la tool open_tab|llama ANTES/i)
})
