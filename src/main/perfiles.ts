import { t as tr } from '../shared/i18n'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { writeJson } from './jsonfile'
import { PARTICION_NORMAL } from './particiones'
import { z } from 'zod'
import { defaultProfilePreferences, PROFILE_ICONS, type ProfilePreferences, type BrowserProfile, type ProfileSettings } from '../shared/profiles'

/**
 * Perfiles: varias identidades de navegación en la misma app.
 *
 * Decisión tomada con el usuario (ver docs/incognito-y-perfiles.md): **un solo perfil activo en
 * toda la app**, no uno por ventana. Cambiar de perfil reinicia la app, que es lo único honesto:
 * media docena de módulos leen su JSON UNA vez al arrancar (historial, marcadores, favicons,
 * permisos), y cambiarlos en caliente sería inventarse un `reinit` en cada uno para ahorrarle al
 * usuario un segundo. La sesión de pestañas se guarda antes de salir y cada perfil restaura la
 * suya, así que no se pierde nada.
 *
 * Alcance, también decidido: por perfil van cookies/sesión web, historial, marcadores,
 * favicons, permisos, pestañas, apariencia y preferencias del agente. Compartidos siguen el
 * vault (una sola caja fuerte del Mac), las conexiones de IA, los chats y el consumo.
 */

/** El perfil de siempre. Sus ficheros se quedan en la raíz de `userData`: cero migración. */
export const PERFIL_POR_DEFECTO = 'default'

export interface Perfil {
  id: string
  nombre: string
  avatar: string | null
  preferences?: ProfilePreferences
}

interface Datos {
  activo: string
  perfiles: Perfil[]
}

const POR_DEFECTO: Datos = {
  activo: PERFIL_POR_DEFECTO,
  perfiles: [{ id: PERFIL_POR_DEFECTO, get nombre() { return tr("Tú") }, avatar: null }]
}

let datos: Datos = POR_DEFECTO
/**
 * Carpeta base (el `userData` de Electron). Se INYECTA en `initPerfiles` en vez de leerse de
 * `app` aquí: así este módulo no depende de Electron y sus decisiones —qué carpeta y qué
 * partición le toca a cada perfil, qué ids chocan, qué pasa al borrar el activo— se pueden
 * probar sin levantar la app. Es lo mismo que hace `precios.ts` con la aritmética del dinero.
 */
let base = ''

function ficheroLista(): string {
  // En la raíz a propósito: es la lista DE perfiles, no dato de ninguno.
  return join(base, 'perfiles.json')
}

function guardar(next = datos): void {
  const result = writeJson(ficheroLista(), next, 'la lista de perfiles', false)
  if (!result.ok) throw new Error('No se pudieron guardar los perfiles.')
  datos = next
}

const color = z.string().regex(/^#[0-9a-f]{6}$/i)
const preferencesSchema = z.object({
  color, icon: z.enum(PROFILE_ICONS), tint: color.nullable(),
  homePage: z.string().refine((value) => {
    if (!value) return true
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password } catch { return false }
  }),
  newTab: z.enum(['titanio', 'home']), startup: z.enum(['restore', 'home']),
  searchEngine: z.enum(['google', 'duckduckgo', 'bing', 'brave']),
  agent: z.object({
    defaultModel: z.object({ providerId: z.string().min(1), id: z.string().min(1) }).nullable(),
    instructions: z.string().max(20000), browserTools: z.boolean(), skills: z.boolean(), mcp: z.boolean()
  })
})

export function preferencesFor(id = datos.activo): ProfilePreferences {
  const raw = datos.perfiles.find((p) => p.id === id)?.preferences
  const defaults = defaultProfilePreferences()
  const parsed = preferencesSchema.safeParse({ ...defaults, ...raw, agent: { ...defaults.agent, ...raw?.agent } })
  return parsed.success ? parsed.data : defaults
}

export function profileSettings(): ProfileSettings {
  return { activeId: datos.activo, profiles: datos.perfiles.map((p) => ({ ...p, preferences: preferencesFor(p.id) })) }
}

export function updateBrowserProfile(input: BrowserProfile): ProfileSettings {
  const existing = datos.perfiles.find((p) => p.id === input.id)
  if (!existing) throw new Error('El perfil ya no existe.')
  const nombre = z.string().trim().min(1).max(60).safeParse(input.nombre)
  const prefs = preferencesSchema.safeParse(input.preferences)
  if (!nombre.success || !prefs.success) throw new Error('Revisa el nombre, la URL de inicio y las preferencias del perfil.')
  if ((prefs.data.newTab === 'home' || prefs.data.startup === 'home') && !prefs.data.homePage) throw new Error('Introduce una página de inicio para esta opción.')
  if (input.avatar !== null && (typeof input.avatar !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(input.avatar) || input.avatar.length > 2_000_000)) throw new Error('El avatar debe ser una imagen PNG, JPEG o WebP de menos de 2 MB.')
  const next = { ...existing, nombre: nombre.data, avatar: input.avatar, preferences: prefs.data }
  guardar({ ...datos, perfiles: datos.perfiles.map((p) => p.id === input.id ? next : p) })
  return profileSettings()
}

/**
 * Carpeta de un perfil. La del perfil por defecto es la raíz de `userData`.
 *
 * Es lo que evita una migración: los `history.json`, `bookmarks.json`… que ya existen siguen
 * exactamente donde están y siguen siendo los del perfil de siempre. Un perfil nuevo nace con
 * su carpeta vacía, que es justo lo que se espera de un perfil nuevo.
 */
export function dirDePerfil(id: string): string {
  if (id === PERFIL_POR_DEFECTO) return base
  const dir = join(base, 'perfiles', id)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Ruta de un fichero de estado DEL PERFIL ACTIVO.
 *
 * Lo usan historial, marcadores, favicons, permisos y la sesión de pestañas. Lo que NO pase por
 * aquí es, por definición, compartido entre perfiles — y eso incluye el vault: es a propósito.
 */
export function rutaDePerfil(fichero: string): string {
  return join(dirDePerfil(datos.activo), fichero)
}

/** Partición de Chromium del perfil activo. Sin perfiles, es la de siempre. */
export function particionDelPerfil(): string {
  return datos.activo === PERFIL_POR_DEFECTO ? PARTICION_NORMAL : `persist:titanio-${datos.activo}`
}

export function initPerfiles(baseDir: string): void {
  base = baseDir
  const f = ficheroLista()
  if (existsSync(f)) {
    try {
      const d = JSON.parse(readFileSync(f, 'utf-8')) as Partial<Datos>
      const lista = Array.isArray(d.perfiles) ? d.perfiles.filter((p) => p && typeof p.id === 'string') : []
      if (lista.length) {
        // El activo tiene que existir: un id colgado dejaría la app leyendo una carpeta fantasma.
        const activo = lista.some((p) => p.id === d.activo) ? d.activo! : lista[0].id
        const needsMigration = lista.some((p) => !p.preferences)
        datos = { activo, perfiles: lista.map((p) => ({ ...p, preferences: p.preferences ?? legacyPreferences() })) }
        // Un fallo de escritura no convierte una lista válida en un archivo ilegible.
        if (needsMigration) writeJson(ficheroLista(), datos, 'la migración de perfiles', false)
        return
      }
    } catch (e) {
      console.error('[perfiles] perfiles.json ilegible, se arranca con el perfil por defecto:',
        e instanceof Error ? e.message : e)
    }
  }
  // Primer arranque con perfiles: se hereda el nombre y el avatar que ya tenía el usuario, para
  // que la novedad no le borre de la cara lo que había puesto.
  datos = { ...POR_DEFECTO, perfiles: [{ ...POR_DEFECTO.perfiles[0], ...leerPerfilAntiguo(), preferences: legacyPreferences() }] }
  writeJson(ficheroLista(), datos, 'la lista inicial de perfiles', false)
}

function legacyPreferences(): ProfilePreferences {
  const prefs = defaultProfilePreferences()
  try {
    const panels = JSON.parse(readFileSync(join(base, 'panels.json'), 'utf8'))
    if (typeof panels.tint === 'string' && /^#[0-9a-f]{6}$/i.test(panels.tint)) prefs.tint = panels.tint
  } catch { /* Primera instalación o apariencia antigua sin personalizar. */ }
  return prefs
}

/** El viejo `profile.json` (nombre + avatar, sin perfiles). Se lee una vez y se absorbe. */
function leerPerfilAntiguo(): Partial<Perfil> {
  try {
    const d = JSON.parse(readFileSync(join(base, 'profile.json'), 'utf-8'))
    return { nombre: (d.name as string) || undefined, avatar: (d.avatar as string) || null }
  } catch { return {} }
}

export function listaPerfiles(): Perfil[] {
  return datos.perfiles.map((p) => ({ ...p, preferences: preferencesFor(p.id) }))
}

export function perfilActivoId(): string {
  return datos.activo
}

export function perfilActivo(): Perfil {
  return datos.perfiles.find((p) => p.id === datos.activo) ?? datos.perfiles[0]
}

/** Ids que ya existen. Se genera uno legible para que la carpeta se pueda mirar a ojo. */
function idLibre(nombre: string): string {
  const slug = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'perfil'
  const occupied = (id: string): boolean => datos.perfiles.some((p) => p.id === id) || existsSync(join(base, 'perfiles', id))
  if (slug !== PERFIL_POR_DEFECTO && !occupied(slug)) return slug
  let n = 2
  while (occupied(`${slug}-${n}`)) n++
  return `${slug}-${n}`
}

export function crearPerfil(nombre: string): Perfil {
  const n = String(nombre || '').trim().slice(0, 60) || tr("Perfil")
  const p: Perfil = { id: idLibre(n), nombre: n, avatar: null, preferences: defaultProfilePreferences() }
  guardar({ ...datos, perfiles: [...datos.perfiles, p] })
  return p
}

export function renombrarPerfil(id: string, nombre: string): Perfil | null {
  const n = String(nombre || '').trim().slice(0, 60)
  if (!n) return null
  const p = datos.perfiles.find((x) => x.id === id)
  if (!p) return null
  guardar({ ...datos, perfiles: datos.perfiles.map((x) => (x.id === id ? { ...x, nombre: n } : x)) })
  return datos.perfiles.find((x) => x.id === id)!
}

export function setAvatarPerfil(id: string, avatar: string | null): Perfil | null {
  // Solo data URLs de imagen (o null para quitar): una URL remota aquí sería una baliza que se
  // pide cada vez que se abre el menú.
  const a = typeof avatar === 'string' && avatar.startsWith('data:image/') ? avatar : null
  const p = datos.perfiles.find((x) => x.id === id)
  if (!p) return null
  guardar({ ...datos, perfiles: datos.perfiles.map((x) => (x.id === id ? { ...x, avatar: a } : x)) })
  return datos.perfiles.find((x) => x.id === id)!
}

/**
 * Marca cuál será el perfil activo. NO cambia nada más: quien llame decide cuándo reiniciar.
 *
 * Devuelve false si el id no existe, en vez de guardar un activo imposible: al siguiente
 * arranque la app leería una carpeta que no está y el usuario perdería de vista sus cosas sin
 * que nada dijera por qué.
 */
export function activarPerfil(id: string): boolean {
  if (!datos.perfiles.some((p) => p.id === id)) return false
  if (datos.activo === id) return true
  guardar({ ...datos, activo: id })
  return true
}

/**
 * Borra un perfil de la lista. **No borra su carpeta**: los datos siguen en disco.
 *
 * Es deliberado. Un click no puede tirar el historial y los marcadores de meses sin vuelta
 * atrás; si algún día hay un "borrar también los datos", será una decisión aparte y explícita.
 * El perfil por defecto no se puede borrar: es donde viven los datos de antes de que hubiera
 * perfiles.
 */
export function borrarPerfil(id: string): boolean {
  if (id === PERFIL_POR_DEFECTO) return false
  if (!datos.perfiles.some((p) => p.id === id)) return false
  const perfiles = datos.perfiles.filter((p) => p.id !== id)
  const activo = datos.activo === id ? PERFIL_POR_DEFECTO : datos.activo
  guardar({ activo, perfiles })
  return true
}
