import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { test, expect } from '@playwright/test'
import {
  initMemoria, rutaSegura, listarMemoria, leerMemoria, escribirMemoria, borrarMemoria,
  memoriaHabilitada, setMemoriaHabilitada, contextoDeMemoria, MAX_CONTEXTO
} from '../src/main/memoria'

/**
 * Memoria del agente: ficheros markdown que escribe ÉL.
 *
 * Eso es lo que hace que estos tests importen más que los de una pantalla normal. Las rutas de
 * escritura las decide un modelo de lenguaje, y a un modelo se le puede colar cualquier cosa
 * desde una web que esté leyendo. Si `rutaSegura` falla, un `memory_write` sale de la carpeta y
 * llega al vault o a los ajustes. Por eso la mitad de este fichero es intentar escaparse.
 */

let base = ''
let dir = ''

test.beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'monper-memoria-'))
  dir = join(base, 'memory')
  initMemoria(dir, join(base, 'memory-settings.json'))
})
test.afterEach(() => { rmSync(base, { recursive: true, force: true }) })

test('arranca con su índice y su ficha de usuario', () => {
  // Una memoria vacía del todo no le dice al agente ni dónde escribir.
  const nombres = listarMemoria().map((n) => n.nombre)
  expect(nombres).toContain('MEMORY.md')
  expect(nombres).toContain('USER.md')
})

test('las semillas NO se reescriben al arrancar otra vez', () => {
  // Es el fallo que borraría todo lo aprendido en cada reinicio, y en silencio.
  escribirMemoria('MEMORY.md', '# Memoria\n\nEl usuario odia el modo claro.')
  initMemoria(dir, join(base, 'memory-settings.json'))
  expect(leerMemoria('MEMORY.md')).toContain('odia el modo claro')
})

test('no se puede escribir fuera de la carpeta de memoria', () => {
  /**
   * El test que justifica el módulo. Cada una de estas rutas es un intento real de salir: subir
   * con `..`, camuflarlo en medio, absoluta, o de Windows.
   */
  for (const mala of [
    '../vault.secrets.json.md',
    '../../.ssh/id_rsa.md',
    'notas/../../fuera.md',
    'notas/../../../perfiles.json.md',
    '/etc/hosts.md',
    'C:/Windows/system.md',
    './../escapada.md'
  ]) {
    expect(rutaSegura(mala), `se aceptó una ruta que sale de la carpeta: ${mala}`).toBeNull()
    expect(escribirMemoria(mala, 'x'), `se escribió fuera con ${mala}`).toBe(false)
  }
  // Y de verdad no hay nada fuera: la comprobación anterior podría pasar y el fichero existir.
  expect(existsSync(join(base, 'fuera.md'))).toBe(false)
  expect(existsSync(join(base, 'escapada.md'))).toBe(false)
})

test('solo se aceptan ficheros .md', () => {
  // La UI solo sabe enseñar markdown, y abrir la puerta a cualquier extensión convierte la
  // memoria en un sistema de ficheros con el que el agente puede dejar cosas ejecutables.
  expect(rutaSegura('notas.txt')).toBeNull()
  expect(rutaSegura('script.js')).toBeNull()
  expect(rutaSegura('sin-extension')).toBeNull()
  expect(rutaSegura('notas.md')).not.toBeNull()
})

test('se puede escribir en subcarpetas, y se crean solas', () => {
  // Sin esto el agente tendría que meterlo todo en la raíz, y la memoria sería ilegible.
  expect(escribirMemoria('sitios/github.md', '# GitHub\n\nusuario: czorr')).toBe(true)
  expect(leerMemoria('sitios/github.md')).toContain('czorr')
  const carpeta = listarMemoria().find((n) => n.nombre === 'sitios')
  expect(carpeta?.tipo).toBe('carpeta')
  expect(carpeta?.hijos?.map((h) => h.nombre)).toEqual(['github.md'])
})

test('el árbol pone las carpetas primero', () => {
  // Es lo que espera cualquiera que haya visto un explorador de ficheros.
  escribirMemoria('zeta.md', 'z')
  escribirMemoria('carpeta/a.md', 'a')
  const tipos = listarMemoria().map((n) => n.tipo)
  expect(tipos[0]).toBe('carpeta')
})

test('leer algo que no existe devuelve null, no revienta', () => {
  expect(leerMemoria('no-existe.md')).toBeNull()
})

test('MEMORY.md no se puede borrar', () => {
  // Es la raíz del índice: sin él, la memoria no tiene por dónde empezar. Vaciarlo sí se puede.
  expect(borrarMemoria('MEMORY.md')).toBe(false)
  expect(leerMemoria('MEMORY.md')).not.toBeNull()
  expect(escribirMemoria('MEMORY.md', '# Memoria\n')).toBe(true)
})

test('borrar un fichero normal sí funciona', () => {
  escribirMemoria('temporal.md', 'x')
  expect(borrarMemoria('temporal.md')).toBe(true)
  expect(leerMemoria('temporal.md')).toBeNull()
})

test('el prompt solo lleva MEMORY.md, no la memoria entera', () => {
  /**
   * Si entrara todo en cada turno, la memoria costaría dinero en cada mensaje y acabaría
   * comiéndose la ventana de contexto — que es justo el problema que viene a resolver.
   */
  escribirMemoria('MEMORY.md', '# Memoria\n\n- Prefiere respuestas cortas.')
  escribirMemoria('users/luis.md', 'ESTO-NO-DEBE-ENTRAR-EN-EL-PROMPT')
  const ctx = contextoDeMemoria()
  expect(ctx).toContain('respuestas cortas')
  expect(ctx, 'un fichero que no es el índice se coló en el prompt').not.toContain('ESTO-NO-DEBE-ENTRAR')
})

test('el índice recién sembrado NO entra en el prompt', () => {
  // Meter una plantilla vacía en cada turno gasta tokens y le dice al modelo que hay memoria
  // cuando no la hay.
  expect(contextoDeMemoria()).toBe('')
})

test('el contexto va recortado', () => {
  // Un MEMORY.md que crece sin freno se llevaría por delante la ventana de contexto.
  escribirMemoria('MEMORY.md', '# Memoria\n' + 'x'.repeat(MAX_CONTEXTO * 2))
  expect(contextoDeMemoria().length).toBeLessThanOrEqual(MAX_CONTEXTO)
})

test('apagada, la memoria no aporta nada al prompt', () => {
  escribirMemoria('MEMORY.md', '# Memoria\n\n- Algo que recordar.')
  expect(contextoDeMemoria()).not.toBe('')
  setMemoriaHabilitada(false)
  expect(memoriaHabilitada()).toBe(false)
  expect(contextoDeMemoria(), 'la memoria apagada seguía entrando en el prompt').toBe('')
})

test('el interruptor sobrevive al reinicio', () => {
  // Apagarla y que vuelva sola en el siguiente arranque sería lo contrario de un ajuste.
  setMemoriaHabilitada(false)
  initMemoria(dir, join(base, 'memory-settings.json'))
  expect(memoriaHabilitada()).toBe(false)
})

test('el listado ignora lo que no es markdown', () => {
  // La carpeta es del usuario y puede acabar con un .DS_Store o con notas sueltas: enseñarlas
  // en un árbol que solo sabe abrir .md daría filas que no hacen nada al pulsarlas.
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '.DS_Store'), 'x')
  writeFileSync(join(dir, 'notas.txt'), 'x')
  const nombres = listarMemoria().map((n) => n.nombre)
  expect(nombres).not.toContain('.DS_Store')
  expect(nombres).not.toContain('notas.txt')
})

test('un fichero enorme se corta al guardar', () => {
  // El agente puede volcarle una página entera; la memoria no es un almacén de documentos.
  escribirMemoria('grande.md', 'y'.repeat(200_000))
  expect(readFileSync(join(dir, 'grande.md'), 'utf-8').length).toBeLessThanOrEqual(64 * 1024)
})
