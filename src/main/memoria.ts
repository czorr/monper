import { join, resolve, dirname, relative, sep } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'fs'
import { readJson, writeJson } from './jsonfile'

/**
 * Memoria del agente: ficheros markdown que **escribe él mismo**.
 *
 * Es el patrón de *working memory* de Mastra, pero con el disco como almacén en vez de una base
 * de datos. `@mastra/core/memory` solo trae la parte abstracta; la implementación con storage
 * vive en `@mastra/memory` y arrastra adaptadores y una BD — para lo que queremos, que es que el
 * agente recuerde cosas entre sesiones, un puñado de `.md` en una carpeta hace lo mismo y además:
 *
 * - **Se puede leer y editar a mano.** Una memoria que el usuario no puede abrir es una caja
 *   negra que decide cosas sobre él. Aquí es texto, en su carpeta, y la UI la enseña entera.
 * - Es exactamente la forma que ya tienen las skills, así que se lee igual y se prueba igual.
 * - Se puede versionar, copiar o borrar con el Finder.
 *
 * `MEMORY.md` es el índice y lo único que entra SIEMPRE en el prompt: es la memoria de trabajo.
 * Lo demás son ficheros que el agente abre cuando los necesita, y por eso `MEMORY.md` debe
 * apuntar a ellos. Si todo entrara en cada turno, la memoria costaría dinero en cada mensaje y
 * crecería hasta comerse la ventana de contexto.
 */

/** Techo por fichero. Una memoria no es un almacén de documentos. */
const MAX_FICHERO = 64 * 1024
/** Techo de lo que entra en el prompt en cada turno. */
export const MAX_CONTEXTO = 8 * 1024

const SEMILLA_MEMORY = `# Memoria

Lo que Monper recuerda entre sesiones. Este fichero entra en **todos** los turnos, así que
mantenlo corto: un índice, no un archivo. Lo largo va en otros \`.md\` y aquí solo su enlace.

## Sobre el usuario

Ver [USER.md](USER.md).

## Notas

_(vacío)_
`

const SEMILLA_USER = `# Usuario

Lo que sabemos de la persona que usa Monper. Lo escribe el agente cuando se entera de algo que
le servirá otro día, y se puede editar a mano.

_(vacío)_
`

interface Ajustes {
  enabled: boolean
}

let dir = ''
let ficheroAjustes = ''
let ajustes: Ajustes = { enabled: true }

export function initMemoria(carpeta: string, ajustesFile: string): void {
  dir = carpeta
  ficheroAjustes = ajustesFile
  ajustes = readJson<Ajustes>(ficheroAjustes, { enabled: true }, 'los ajustes de memoria')
  try {
    mkdirSync(dir, { recursive: true })
    // Las semillas solo si no existen: reescribirlas borraría lo que el agente ya aprendió.
    if (!existsSync(join(dir, 'MEMORY.md'))) writeFileSync(join(dir, 'MEMORY.md'), SEMILLA_MEMORY)
    if (!existsSync(join(dir, 'USER.md'))) writeFileSync(join(dir, 'USER.md'), SEMILLA_USER)
  } catch (e) {
    // Sin carpeta no hay memoria. No es fatal —el agente sigue funcionando— pero tiene que verse.
    console.error('[memoria] no se pudo preparar', dir, e instanceof Error ? e.message : e)
  }
}

export function dirMemoria(): string { return dir }

/**
 * Resuelve una ruta relativa DENTRO de la carpeta de memoria, o null.
 *
 * Es la función más importante del módulo: las rutas las escribe el agente, o sea un modelo de
 * lenguaje al que se le puede colar cualquier cosa desde una web. Sin esto, un
 * `memory_write('../../vault.secrets.json', …)` sale de la carpeta y llega al vault. Se compara
 * la ruta ya resuelta, no la cadena: `a/../../b` parece inocente y no lo es.
 */
export function rutaSegura(rel: string): string | null {
  const limpio = String(rel ?? '').trim()
  if (!limpio || limpio.startsWith('/') || /^[a-zA-Z]:/.test(limpio)) return null
  // Solo markdown: es lo que la UI sabe enseñar y lo único que la memoria necesita.
  if (!limpio.toLowerCase().endsWith('.md')) return null
  const abs = resolve(dir, limpio)
  const dentro = relative(dir, abs)
  if (!dentro || dentro.startsWith('..') || dentro.startsWith(sep) || resolve(dir, dentro) !== abs) return null
  return abs
}

export interface NodoMemoria {
  /** Ruta relativa a la carpeta de memoria, con `/` siempre. */
  path: string
  nombre: string
  tipo: 'fichero' | 'carpeta'
  bytes: number
  /** Última modificación, para que se vea qué ha tocado el agente últimamente. */
  at: number
  hijos?: NodoMemoria[]
}

/** El árbol entero, carpetas primero y por nombre — como lo enseña la UI. */
export function listarMemoria(base = dir, prefijo = ''): NodoMemoria[] {
  if (!dir || !existsSync(base)) return []
  let entradas: string[] = []
  try { entradas = readdirSync(base) } catch { return [] }
  const out: NodoMemoria[] = []
  for (const nombre of entradas) {
    if (nombre.startsWith('.')) continue
    const abs = join(base, nombre)
    const path = prefijo ? `${prefijo}/${nombre}` : nombre
    let st: ReturnType<typeof statSync>
    try { st = statSync(abs) } catch { continue }
    if (st.isDirectory()) {
      out.push({ path, nombre, tipo: 'carpeta', bytes: 0, at: st.mtimeMs, hijos: listarMemoria(abs, path) })
    } else if (nombre.toLowerCase().endsWith('.md')) {
      out.push({ path, nombre, tipo: 'fichero', bytes: st.size, at: st.mtimeMs })
    }
  }
  return out.sort((a, b) =>
    a.tipo !== b.tipo ? (a.tipo === 'carpeta' ? -1 : 1) : a.nombre.localeCompare(b.nombre)
  )
}

export function leerMemoria(rel: string): string | null {
  const abs = rutaSegura(rel)
  if (!abs || !existsSync(abs)) return null
  try { return readFileSync(abs, 'utf-8') } catch (e) {
    console.error('[memoria] no se pudo leer', rel, e instanceof Error ? e.message : e)
    return null
  }
}

/** Escribe (creando las carpetas que hagan falta). Devuelve false y lo dice si no pudo. */
export function escribirMemoria(rel: string, contenido: string): boolean {
  const abs = rutaSegura(rel)
  if (!abs) {
    console.error('[memoria] ruta rechazada:', rel)
    return false
  }
  const texto = String(contenido ?? '').slice(0, MAX_FICHERO)
  try {
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, texto)
    return true
  } catch (e) {
    console.error('[memoria] no se pudo escribir', rel, e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * Borra un fichero de memoria.
 *
 * `MEMORY.md` no se borra: es la raíz del índice y sin él la memoria no tiene por dónde empezar.
 * Vaciarlo sí se puede, que es lo que de verdad quiere quien pide borrarlo.
 */
export function borrarMemoria(rel: string): boolean {
  const abs = rutaSegura(rel)
  if (!abs || rel === 'MEMORY.md') return false
  try { rmSync(abs, { force: true }); return true } catch (e) {
    console.error('[memoria] no se pudo borrar', rel, e instanceof Error ? e.message : e)
    return false
  }
}

export function memoriaHabilitada(): boolean { return ajustes.enabled }

export function setMemoriaHabilitada(on: boolean): boolean {
  ajustes = { enabled: !!on }
  writeJson(ficheroAjustes, ajustes, 'los ajustes de memoria', false)
  return ajustes.enabled
}

/**
 * Lo que entra en el prompt del agente: solo `MEMORY.md`, y recortado.
 *
 * Devuelve '' si la memoria está apagada o si el fichero sigue en su semilla — meter un índice
 * vacío en cada turno solo gastaría tokens y le diría al modelo que hay memoria cuando no la hay.
 */
export function contextoDeMemoria(): string {
  if (!ajustes.enabled) return ''
  const md = leerMemoria('MEMORY.md')
  if (!md) return ''
  const cuerpo = md.trim()
  if (!cuerpo || cuerpo === SEMILLA_MEMORY.trim()) return ''
  return cuerpo.slice(0, MAX_CONTEXTO)
}
