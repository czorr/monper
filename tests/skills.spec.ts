import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Invariantes del icono de cada skill. No lanzan la app ni tocan la red a propósito:
 * resolver favicons de verdad depende de 15 sitios externos y en CI sería flaky. Lo que sí
 * se puede fijar sin red es que ninguna skill se quede sin identidad visual, que es la
 * regresión real — alguien añade una skill y se olvida del campo, o escribe un glifo que no
 * existe, y aparece un icono genérico sin que nada falle.
 */

const RAIZ = join(__dirname, '..', 'resources', 'skills')
const ICONO_TSX = join(__dirname, '..', 'src', 'renderer', 'src', 'components', 'settings', 'SkillIcon.tsx')

interface Skill { id: string; nombre: string | null; host: string | null; icon: string | null }

function skills(): Skill[] {
  return readdirSync(RAIZ, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(RAIZ, e.name, 'SKILL.md')))
    .map((e) => {
      const md = readFileSync(join(RAIZ, e.name, 'SKILL.md'), 'utf8')
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)?.[1] ?? ''
      const campo = (k: string): string | null => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fm)?.[1]?.trim() || null
      return { id: e.name, nombre: campo('name'), host: campo('host'), icon: campo('icon') }
    })
}

/** Los nombres del mapa curado. Se leen del fichero porque es un módulo de renderer con
 *  imports de `~icons/...` que este proyecto de tests no sabe resolver. */
function glifosCurados(): string[] {
  const src = readFileSync(ICONO_TSX, 'utf8')
  const bloque = /const GLIFOS[\s\S]*?\{([\s\S]*?)\n\}/.exec(src)?.[1] ?? ''
  return [...bloque.matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((m) => m[1])
}

test('todas las skills declaran su identidad visual', () => {
  const sin = skills().filter((s) => !s.host && !s.icon).map((s) => s.id)
  expect(sin, `sin host ni icon: ${sin.join(', ')}`).toEqual([])
})

test('cada glifo declarado existe en el mapa curado del renderer', () => {
  // `unplugin-icons` resuelve en build, así que el mapa es estático: un nombre que no esté
  // ahí no falla en compilación, simplemente cae al icono genérico y nadie se entera.
  const curados = glifosCurados()
  expect(curados.length, 'no se pudo leer el mapa GLIFOS').toBeGreaterThan(5)
  const huerfanos = skills().filter((s) => s.icon && !curados.includes(s.icon)).map((s) => `${s.id}→${s.icon}`)
  expect(huerfanos, `glifos que no están en SkillIcon.tsx: ${huerfanos.join(', ')}`).toEqual([])
})

test('una skill de servicio declara host, no glifo', () => {
  // Los dos campos son excluyentes por diseño: si vienen ambos gana `host`, y tener los dos
  // suele significar que alguien copió el frontmatter de otra skill.
  const ambos = skills().filter((s) => s.host && s.icon).map((s) => s.id)
  expect(ambos, `declaran host Y icon: ${ambos.join(', ')}`).toEqual([])
})

test('el nombre visible no es el id de la carpeta', () => {
  // La lista mostraba "google-gmail" y "x-twitter": identificadores, no nombres. `id` es la
  // carpeta y sirve para buscar; `name` es lo que lee una persona. El agente resuelve por
  // `id` O por `name`, así que renombrar es seguro y de paso mejora su prompt.
  const feos = skills()
    .filter((s) => !s.nombre || s.nombre.replace(/^["']|["']$/g, '') === s.id)
    .map((s) => s.id)
  expect(feos, `siguen usando el id como nombre: ${feos.join(', ')}`).toEqual([])
})
