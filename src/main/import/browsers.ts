import { existsSync, readFileSync, copyFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { execFileSync } from 'child_process'
import { pbkdf2Sync, createDecipheriv } from 'crypto'
import { nombreDeUrl } from '../../shared/url'

/**
 * Importar de tu navegador anterior.
 *
 * Es el feature que decide si alguien se queda: nadie se cambia de navegador si empieza sin
 * marcadores, sin historial y sin contraseñas. Y en Monper importa el doble — **el vault
 * vacío desperdicia toda la tesis del producto**. Con las contraseñas dentro, el agente puede
 * entrar en tus sitios el primer día; sin ellas, el usuario tiene que reconstruir su vida
 * antes de ver para qué sirve.
 *
 * Sin dependencias nuevas: `node:sqlite` viene en el Node 24 que trae Electron 43, así que las
 * bases de datos de Chromium se leen directamente. Añadir `better-sqlite3` habría metido un
 * módulo nativo que hay que recompilar por ABI en cada empaquetado.
 */

export type NavegadorId = 'chrome' | 'arc' | 'brave' | 'edge' | 'safari'

export interface Navegador {
  id: NavegadorId
  nombre: string
  /** Está instalado y tiene un perfil legible. */
  disponible: boolean
}

export interface MarcadorImportado { title: string; url: string }
export interface VisitaImportada { url: string; title: string; visitedAt: number }
export interface CredencialImportada { url: string; username: string; password: string }

/**
 * Perfiles de Chromium: todos guardan lo mismo en el mismo formato.
 *
 * `app` es el nombre del bundle en /Applications, y hace falta: desinstalar un navegador
 * **no borra su carpeta de perfil**. Detectando solo el perfil, se ofrecía importar de Chrome
 * y de Arc en una máquina donde ninguno de los dos estaba instalado — carpetas huérfanas de
 * hace meses. Se comprueban las dos cosas.
 */
const CHROMIUM: Record<Exclude<NavegadorId, 'safari'>, { nombre: string; dir: string; app: string }> = {
  chrome: { nombre: 'Google Chrome', dir: 'Google/Chrome/Default', app: 'Google Chrome' },
  arc: { nombre: 'Arc', dir: 'Arc/User Data/Default', app: 'Arc' },
  brave: { nombre: 'Brave', dir: 'BraveSoftware/Brave-Browser/Default', app: 'Brave Browser' },
  edge: { nombre: 'Microsoft Edge', dir: 'Microsoft Edge/Default', app: 'Microsoft Edge' }
}

const soporte = (): string => join(homedir(), 'Library', 'Application Support')
const perfil = (id: Exclude<NavegadorId, 'safari'>): string => join(soporte(), CHROMIUM[id].dir)

/** Las dos rutas donde macOS instala apps: para todos, y solo para este usuario. */
export function appInstalada(nombre: string): boolean {
  return existsSync(`/Applications/${nombre}.app`) || existsSync(join(homedir(), `Applications/${nombre}.app`))
}

/**
 * Solo se ofrece un navegador si **la app está instalada Y tiene perfil**.
 *
 * Las dos condiciones por separado dan falsos positivos en direcciones opuestas: solo el
 * perfil ofrece navegadores desinstalados; solo la app ofrece uno recién instalado que nunca
 * se ha abierto y del que no hay nada que traer.
 */
export function navegadoresDisponibles(): Navegador[] {
  const out: Navegador[] = []
  for (const id of Object.keys(CHROMIUM) as Exclude<NavegadorId, 'safari'>[]) {
    const c = CHROMIUM[id]
    out.push({ id, nombre: c.nombre, disponible: appInstalada(c.app) && existsSync(join(perfil(id), 'Bookmarks')) })
  }
  out.push({
    id: 'safari',
    nombre: 'Safari',
    disponible: appInstalada('Safari') && existsSync(join(homedir(), 'Library/Safari/Bookmarks.plist'))
  })
  return out
}

// ---------------------------------------------------------------- marcadores

interface NodoChromium { type?: string; name?: string; url?: string; children?: NodoChromium[] }

function aplanarChromium(n: NodoChromium, out: MarcadorImportado[]): void {
  // Chromium guarda muchos marcadores SIN nombre (los que arrastras a la barra). Caer a la
  // URL cruda llenaba el sidebar de `https://supabase.com/dashboard/…`; ver nombreDeUrl.
  if (n.type === 'url' && n.url && /^https?:/i.test(n.url)) out.push({ title: n.name?.trim() || nombreDeUrl(n.url), url: n.url })
  for (const h of n.children ?? []) aplanarChromium(h, out)
}

/**
 * Los marcadores de Safari viven en un plist BINARIO. En vez de meter un parser, se usa
 * `plutil`, que viene con macOS: convierte a JSON y se lee como cualquier otra cosa.
 */
function marcadoresSafari(): MarcadorImportado[] {
  const p = join(homedir(), 'Library/Safari/Bookmarks.plist')
  if (!existsSync(p)) return []
  let json: string
  try {
    json = execFileSync('plutil', ['-convert', 'json', '-o', '-', p], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    // La carpeta de Safari está protegida por TCC: sin Acceso a Disco Completo, esto falla.
    // Es el caso normal, no una excepción, y hay que poder contarlo.
    throw new Error(
      'macOS no deja leer los marcadores de Safari. Concede a Monper Acceso a Disco Completo ' +
      `en Ajustes → Privacidad y seguridad, y reinícialo. (${e instanceof Error ? e.message.slice(0, 80) : e})`
    )
  }
  const out: MarcadorImportado[] = []
  const recorrer = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    const o = n as Record<string, unknown>
    const url = typeof o['URLString'] === 'string' ? (o['URLString'] as string) : null
    if (url && /^https?:/i.test(url)) {
      const meta = o['URIDictionary'] as Record<string, unknown> | undefined
      out.push({ title: ((meta?.['title'] as string) || '').trim() || nombreDeUrl(url), url })
    }
    for (const h of (o['Children'] as unknown[]) ?? []) recorrer(h)
  }
  recorrer(JSON.parse(json))
  return out
}

export function leerMarcadores(id: NavegadorId): MarcadorImportado[] {
  if (id === 'safari') return marcadoresSafari()
  const p = join(perfil(id), 'Bookmarks')
  if (!existsSync(p)) return []
  const raiz = JSON.parse(readFileSync(p, 'utf8')) as { roots?: Record<string, NodoChromium> }
  const out: MarcadorImportado[] = []
  for (const r of Object.values(raiz.roots ?? {})) if (r && typeof r === 'object') aplanarChromium(r, out)
  return out
}

// ---------------------------------------------------------------- SQLite de Chromium

/**
 * Chromium mantiene sus .db ABIERTAS y con WAL: leerlas en sitio da "database is locked" si el
 * otro navegador está corriendo, y pedirle al usuario que cierre Chrome para importar es
 * perder a la mitad. Se copia a un temporal —con sus `-wal` y `-shm`, o se leerían datos a
 * medias— y se lee la copia.
 */
function conCopia<T>(origen: string, fn: (ruta: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'monper-import-'))
  try {
    const destino = join(dir, 'db')
    copyFileSync(origen, destino)
    for (const sufijo of ['-wal', '-shm']) {
      if (existsSync(origen + sufijo)) copyFileSync(origen + sufijo, destino + sufijo)
    }
    return fn(destino)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function consultar(ruta: string, sql: string): Record<string, unknown>[] {
  // `node:sqlite` viene con el Node de Electron: cero dependencias nuevas.
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
  const db = new DatabaseSync(ruta, { readOnly: true })
  try {
    return db.prepare(sql).all() as Record<string, unknown>[]
  } finally {
    db.close()
  }
}

/**
 * Chromium cuenta microsegundos desde 1601; JavaScript milisegundos desde 1970.
 *
 * Llega como TEXTO a propósito. `last_visit_time` ronda 1.3e16, que **supera
 * `Number.MAX_SAFE_INTEGER`**, y `node:sqlite` se niega a convertirlo: revienta con
 * "Value is too large to be represented as a JavaScript number" y tumba la importación
 * entera. Salió a la primera al probarlo contra un Chrome real. Se castea en SQL y se divide
 * antes de que la magnitud importe.
 */
const EPOCA_CHROMIUM = 11644473600000
function aMilisegundos(texto: string): number {
  const micro = Number(texto || 0)
  return micro > 0 ? Math.round(micro / 1000) - EPOCA_CHROMIUM : 0
}

export function leerHistorial(id: NavegadorId, limite = 5000): VisitaImportada[] {
  if (id === 'safari') return [] // History.db de Safari está bajo TCC; ver marcadoresSafari
  const p = join(perfil(id), 'History')
  if (!existsSync(p)) return []
  const filas = conCopia(p, (ruta) =>
    consultar(ruta, `SELECT url, title, CAST(last_visit_time AS TEXT) AS visitado FROM urls WHERE url LIKE 'http%' ORDER BY last_visit_time DESC LIMIT ${Math.min(50_000, limite)}`)
  )
  return filas.map((f) => ({
    url: String(f['url']),
    title: String(f['title'] ?? ''),
    visitedAt: aMilisegundos(String(f['visitado'] ?? ''))
  }))
}

// ---------------------------------------------------------------- contraseñas

/**
 * La clave con la que Chromium cifra sus contraseñas vive en el Llavero de macOS.
 *
 * Pedirla dispara el diálogo del sistema ("Monper quiere acceder a…"), y eso **es lo
 * correcto**: importar contraseñas tiene que requerir un permiso explícito del usuario, no
 * pasar en silencio porque pulsó un botón nuestro.
 */
function claveLlavero(servicio: string, cuenta: string): Buffer {
  const pass = execFileSync('security', ['find-generic-password', '-w', '-s', servicio, '-a', cuenta], {
    encoding: 'utf8'
  }).trim()
  // Parámetros fijos de Chromium en macOS; no son configurables y no han cambiado.
  return pbkdf2Sync(pass, 'saltysalt', 1003, 16, 'sha1')
}

const SERVICIO: Record<Exclude<NavegadorId, 'safari'>, [string, string]> = {
  chrome: ['Chrome Safe Storage', 'Chrome'],
  arc: ['Arc Safe Storage', 'Arc'],
  brave: ['Brave Safe Storage', 'Brave'],
  edge: ['Microsoft Edge Safe Storage', 'Microsoft Edge']
}

export function leerCredenciales(id: NavegadorId): CredencialImportada[] {
  if (id === 'safari') {
    // Safari guarda en el Llavero, y macOS NO deja leer esos items sin interacción del
    // usuario item por item. No es una limitación nuestra: es el diseño de macOS.
    throw new Error('Safari guarda sus contraseñas en el Llavero y macOS no permite exportarlas. Usa el vault a mano.')
  }
  const p = join(perfil(id), 'Login Data')
  if (!existsSync(p)) return []

  let clave: Buffer
  try {
    clave = claveLlavero(...SERVICIO[id])
  } catch (e) {
    throw new Error(
      `No se pudo leer la clave de ${CHROMIUM[id].nombre} en el Llavero. ` +
      `Si salió un diálogo del sistema, hay que permitirlo. (${e instanceof Error ? e.message.slice(0, 60) : e})`
    )
  }

  const filas = conCopia(p, (ruta) =>
    consultar(ruta, "SELECT origin_url, username_value, password_value FROM logins WHERE blacklisted_by_user = 0")
  )

  const out: CredencialImportada[] = []
  for (const f of filas) {
    const cifrado = f['password_value'] as Buffer | Uint8Array | null
    const usuario = String(f['username_value'] ?? '')
    const url = String(f['origin_url'] ?? '')
    if (!cifrado || !usuario || !url) continue
    const buf = Buffer.from(cifrado)
    // Solo `v10`: es lo que usa Chromium en macOS. Otro prefijo significa otro esquema y
    // descifrarlo a ciegas produciría basura que acabaría guardada como si fuera la contraseña.
    if (buf.subarray(0, 3).toString() !== 'v10') continue
    try {
      // IV de 16 espacios, fijo en Chromium.
      const d = createDecipheriv('aes-128-cbc', clave, Buffer.alloc(16, 0x20))
      const claro = Buffer.concat([d.update(buf.subarray(3)), d.final()]).toString('utf8')
      if (claro) out.push({ url, username: usuario, password: claro })
    } catch {
      // Una credencial que no descifra se salta: no debe tumbar la importación entera.
    }
  }
  return out
}
