import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { test, expect } from '@playwright/test'
import {
  initPerfiles, dirDePerfil, rutaDePerfil, particionDelPerfil, listaPerfiles, perfilActivo,
  perfilActivoId, crearPerfil, renombrarPerfil, activarPerfil, borrarPerfil, PERFIL_POR_DEFECTO
} from '../src/main/perfiles'
import { PARTICION_INCOGNITO, PARTICION_NORMAL, particionDe } from '../src/main/particiones'

/**
 * Perfiles: varias identidades de navegación en la misma app.
 *
 * Se prueban **sin levantar Electron**: `perfiles.ts` recibe su carpeta base en `initPerfiles`
 * en vez de pedírsela a `app`, justo para esto (misma idea que `precios.ts` con el dinero). Lo
 * que hay aquí son las dos cosas que no se pueden equivocar: el AISLAMIENTO —un perfil que
 * comparte historial con otro no es un perfil— y la MIGRACIÓN —un perfil nuevo que se lleve por
 * delante los marcadores de años del usuario es peor que no tener perfiles.
 */

let base = ''

test.beforeEach(() => {
  // Carpeta limpia por test: el módulo tiene estado y encadenar tests lo haría ilegible.
  base = mkdtempSync(join(tmpdir(), 'monper-perfiles-'))
  initPerfiles(base)
})
test.afterEach(() => { rmSync(base, { recursive: true, force: true }) })

test('el perfil por defecto guarda sus datos donde SIEMPRE los ha guardado', () => {
  /**
   * Es la decisión que evita una migración entera. Si su carpeta fuera `userData/perfiles/default`,
   * los `history.json`, `bookmarks.json` y `favicons.json` que el usuario ya tiene quedarían
   * huérfanos el día que actualice, y vería la app en blanco sin que nada explicara por qué.
   */
  expect(dirDePerfil(PERFIL_POR_DEFECTO), 'el perfil por defecto se movió de sitio').toBe(base)
  expect(rutaDePerfil('history.json')).toBe(join(base, 'history.json'))
})

test('un perfil nuevo tiene su propia carpeta, creada de verdad', () => {
  const p = crearPerfil('Trabajo')
  const dir = dirDePerfil(p.id)
  expect(dir).not.toBe(base)
  expect(dir.startsWith(join(base, 'perfiles'))).toBe(true)
  // Si la carpeta no existiera, el primer `writeJson` del historial fallaría por ENOENT.
  expect(existsSync(dir), 'la carpeta del perfil no se creó').toBe(true)
})

test('los ficheros de estado siguen al perfil activo', () => {
  // Es lo que separa de verdad un perfil de otro: el mismo nombre de fichero, otra carpeta.
  const p = crearPerfil('Personal')
  const enDefecto = rutaDePerfil('bookmarks.json')
  activarPerfil(p.id)
  const enPersonal = rutaDePerfil('bookmarks.json')
  expect(enPersonal).not.toBe(enDefecto)
  expect(enPersonal.endsWith('bookmarks.json')).toBe(true)
})

test('cada perfil navega en su propia sesión de Chromium', () => {
  /**
   * Sin esto "perfiles" serían solo dos carpetas de marcadores: seguirías con la misma cuenta de
   * Google en los dos, que es exactamente lo que la gente quiere separar.
   */
  expect(particionDelPerfil()).toBe(PARTICION_NORMAL)
  const p = crearPerfil('Trabajo')
  activarPerfil(p.id)
  expect(particionDelPerfil()).not.toBe(PARTICION_NORMAL)
  // Persistente: un perfil no es incógnito, sus cookies tienen que seguir ahí mañana.
  expect(particionDelPerfil().startsWith('persist:')).toBe(true)
})

test('incógnito manda sobre el perfil: nunca cae en una partición persistente', () => {
  // Estar en "Trabajo" y abrir incógnito no puede escribir en las cookies de Trabajo.
  expect(particionDe(true, 'persist:monper-trabajo')).toBe(PARTICION_INCOGNITO)
  expect(particionDe(false, 'persist:monper-trabajo')).toBe('persist:monper-trabajo')
})

test('activar un perfil que no existe se rechaza y no deja el activo a medias', () => {
  // Guardar un activo imposible dejaría la app leyendo una carpeta fantasma en el siguiente
  // arranque: el usuario vería sus cosas desaparecer sin que nada dijera por qué.
  const antes = perfilActivoId()
  expect(activarPerfil('no-existe')).toBe(false)
  expect(perfilActivoId()).toBe(antes)
})

test('el perfil por defecto no se puede borrar', () => {
  // Es donde viven los datos de antes de que existieran los perfiles.
  expect(borrarPerfil(PERFIL_POR_DEFECTO)).toBe(false)
  expect(listaPerfiles().some((p) => p.id === PERFIL_POR_DEFECTO)).toBe(true)
})

test('borrar el perfil activo devuelve al de por defecto', () => {
  const p = crearPerfil('Temporal')
  activarPerfil(p.id)
  expect(borrarPerfil(p.id)).toBe(true)
  expect(perfilActivoId(), 'la app se quedó apuntando a un perfil que ya no existe').toBe(PERFIL_POR_DEFECTO)
  expect(listaPerfiles().some((x) => x.id === p.id)).toBe(false)
})

test('borrar un perfil NO borra sus datos del disco', () => {
  /**
   * Decisión explícita, no un olvido: un click no puede tirar meses de historial y marcadores
   * sin vuelta atrás. El diálogo se lo promete al usuario, así que el código tiene que cumplirlo.
   */
  const p = crearPerfil('Con datos')
  const dir = dirDePerfil(p.id)
  writeFileSync(join(dir, 'bookmarks.json'), '[]')
  borrarPerfil(p.id)
  expect(existsSync(join(dir, 'bookmarks.json')), 'quitar el perfil se llevó por delante sus datos').toBe(true)
})

test('los ids no chocan aunque repitas el nombre', () => {
  // Dos perfiles con el mismo id compartirían carpeta y partición: serían el mismo perfil con
  // dos nombres, y el usuario creería que están separados.
  const ids = [crearPerfil('Igual').id, crearPerfil('Igual').id, crearPerfil('Igual').id]
  expect(new Set(ids).size, 'se repitió un id de perfil').toBe(3)
})

test('un perfil no puede colarse como el de por defecto llamándose así', () => {
  // `dirDePerfil('default')` es la raíz de userData: un perfil "nuevo" con ese id escribiría
  // encima de los datos de siempre.
  expect(crearPerfil('default').id).not.toBe(PERFIL_POR_DEFECTO)
})

test('un nombre que no deja letras usables sigue dando un id válido', () => {
  // "🙂" o "///" no pueden acabar en un id vacío: `join(base, 'perfiles', '')` es la carpeta de
  // perfiles entera, y el perfil escribiría encima de la de todos.
  const p = crearPerfil('🙂')
  expect(p.id.length).toBeGreaterThan(0)
  expect(dirDePerfil(p.id).startsWith(join(base, 'perfiles') + '/')).toBe(true)
})

test('el nombre y el avatar viven en la lista, no en un fichero aparte', () => {
  // Tenerlos en dos sitios era la vía rápida a que el menú dijera un nombre y los ajustes otro.
  renombrarPerfil(PERFIL_POR_DEFECTO, 'Luis')
  expect(perfilActivo().nombre).toBe('Luis')
  expect(listaPerfiles().find((p) => p.id === PERFIL_POR_DEFECTO)?.nombre).toBe('Luis')
  // Y sobrevive a releer el fichero: es lo que verá el siguiente arranque.
  initPerfiles(base)
  expect(perfilActivo().nombre).toBe('Luis')
})

test('renombrar con un nombre vacío no borra el que había', () => {
  renombrarPerfil(PERFIL_POR_DEFECTO, 'Luis')
  expect(renombrarPerfil(PERFIL_POR_DEFECTO, '   ')).toBeNull()
  expect(perfilActivo().nombre).toBe('Luis')
})

test('el perfil de antes de que hubiera perfiles no se pierde al actualizar', () => {
  /**
   * La migración. Un usuario que ya tenía su nombre y su avatar en `profile.json` no puede ver
   * cómo la novedad se los borra de la cara: el primer arranque con perfiles los absorbe.
   */
  const otra = mkdtempSync(join(tmpdir(), 'monper-migra-'))
  try {
    writeFileSync(join(otra, 'profile.json'), JSON.stringify({ name: 'Luis Carlos', avatar: 'data:image/png;base64,AA' }))
    initPerfiles(otra)
    expect(perfilActivo().nombre).toBe('Luis Carlos')
    expect(perfilActivo().avatar).toBe('data:image/png;base64,AA')
    expect(perfilActivoId()).toBe(PERFIL_POR_DEFECTO)
  } finally { rmSync(otra, { recursive: true, force: true }) }
})

test('una lista de perfiles corrupta no deja la app sin perfil', () => {
  // Un JSON roto no puede dejar `perfiles` vacío: el menú saldría sin nada donde pulsar y sin
  // forma de volver.
  const otra = mkdtempSync(join(tmpdir(), 'monper-roto-'))
  try {
    writeFileSync(join(otra, 'perfiles.json'), '{ esto no es json')
    initPerfiles(otra)
    expect(listaPerfiles().length).toBeGreaterThan(0)
    expect(perfilActivoId()).toBe(PERFIL_POR_DEFECTO)
  } finally { rmSync(otra, { recursive: true, force: true }) }
})

test('un activo que apunta a un perfil inexistente se corrige al arrancar', () => {
  // Pasa si alguien edita el JSON a mano o si un borrado se queda a medias. Sin esto, la app
  // arrancaría leyendo una carpeta que no está.
  const otra = mkdtempSync(join(tmpdir(), 'monper-colgado-'))
  try {
    writeFileSync(join(otra, 'perfiles.json'), JSON.stringify({
      activo: 'fantasma',
      perfiles: [{ id: PERFIL_POR_DEFECTO, nombre: 'Tú', avatar: null }]
    }))
    initPerfiles(otra)
    expect(perfilActivoId()).toBe(PERFIL_POR_DEFECTO)
  } finally { rmSync(otra, { recursive: true, force: true }) }
})
