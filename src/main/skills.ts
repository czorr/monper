import { join, dirname, basename, relative, isAbsolute } from 'path'
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync, renameSync, unlinkSync, realpathSync } from 'fs'
import { randomUUID } from 'crypto'
import { readJson, writeJson } from './jsonfile'
import { app } from 'electron'
import { faviconFor, resolveFavicon } from './favicons'
import { mcpCapabilities } from './mcp/client'
import type { SkillMeta, SkillDetail } from '../shared/types'

// Skills built-in (empaquetadas con la app) + del usuario (userData/skills).
function builtinDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'skills') : join(app.getAppPath(), 'resources/skills')
}
function userDir(): string { return join(app.getPath('userData'), 'skills') }
/** Carpeta local donde viven las skills (para abrirla en Finder). */
export function skillsDir(): string { return builtinDir() }
function enabledFile(): string { return join(app.getPath('userData'), 'skills-enabled.json') }

let enabled: Record<string, boolean> = {}

function loadEnabled(): void {
  enabled = readJson(enabledFile(), {} as typeof enabled, 'las skills activas')
}
function saveEnabled(): void { writeJson(enabledFile(), enabled, 'las skills activas') }

export function initSkills(): void {
  try { mkdirSync(userDir(), { recursive: true }) } catch (e) {
    // Sin esta carpeta no se pueden crear skills propias; las de fábrica siguen yendo.
    console.error('[skills] no se pudo crear', userDir(), e instanceof Error ? e.message : e)
  }
  loadEnabled()
}

// Parser mínimo de frontmatter YAML (name, description, keywords: [..]).
function parseFrontmatter(md: string): { data: Record<string, unknown>; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { data: {}, body: md }
  const data: Record<string, unknown> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let raw = line.slice(i + 1).trim()
    if (raw.startsWith('[') && raw.endsWith(']')) {
      data[key] = raw.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    } else {
      data[key] = raw.replace(/^["']|["']$/g, '')
    }
  }
  return { data, body: m[2] }
}

interface Loaded extends SkillDetail { file: string }

function readSkill(dir: string, id: string, builtin: boolean): Loaded | null {
  const original = join(dir, id, 'SKILL.md')
  const local = join(userDir(), id, 'SKILL.md')
  const customized = builtin && existsSync(original) && existsSync(local)
  const file = customized ? local : original
  if (!existsSync(file)) return null
  let raw = ''
  try { raw = readFileSync(file, 'utf-8') } catch { return null }
  const { data, body } = parseFrontmatter(raw)
  const kw = data.keywords
  let updated = ''
  try { updated = statSync(file).mtime.toISOString().slice(0, 10) } catch { /* sin fecha: se queda vacía */ }
  return {
    id, builtin, file, customized,
    name: (data.name as string) || id,
    description: (data.description as string) || '',
    keywords: Array.isArray(kw) ? (kw as string[]) : typeof kw === 'string' && kw ? [kw] : [],
    author: (data.author as string) || (builtin ? 'Titanio' : 'Tú'),
    // Identidad visual: dominio del servicio o glifo. Ver SkillMeta.
    host: ((data.host as string) || '').trim() || null,
    icon: ((data.icon as string) || '').trim() || null,
    favicon: null,
    requires: ((data.requires as string) || '').trim() || null,
    available: true,
    updated,
    enabled: enabled[id] ?? true,
    body
  }
}

function allLoaded(): Loaded[] {
  const out: Loaded[] = []
  const scan = (dir: string, builtin: boolean): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const s = readSkill(dir, entry.name, builtin)
      if (s && !out.some((x) => x.id === s.id)) out.push(s)
    }
  }
  scan(builtinDir(), true)
  scan(userDir(), false)
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function toMeta(s: Loaded): SkillMeta {
  return {
    id: s.id, name: s.name, description: s.description, keywords: s.keywords,
    enabled: s.enabled, builtin: s.builtin, author: s.author, updated: s.updated,
    customized: s.customized,
    host: s.host, icon: s.icon, favicon: s.host ? faviconFor(`https://${s.host}`) : null,
    requires: s.requires, available: cubierta(s.requires)
  }
}

export function listSkills(): SkillMeta[] { return allLoaded().map(toMeta) }

/**
 * Pide al propio sitio el favicon de las skills de servicio que aún no lo tengan.
 * `resolveFavicon` ya deduplica por host y por sesión, y trae su propio timeout.
 */
export async function resolveSkillFavicons(): Promise<void> {
  const hosts = [...new Set(allLoaded().map((s) => s.host).filter((h): h is string => !!h))]
  await Promise.all(hosts.map((h) => resolveFavicon(`https://${h}`)))
}
export function getSkill(id: string): SkillDetail | null {
  const s = allLoaded().find((x) => x.id === id)
  if (!s) return null
  return { ...toMeta(s), body: s.body, source: readFileSync(s.file, 'utf-8') }
}

export function skillFolder(id: string): string {
  const skill = allLoaded().find((s) => s.id === id)
  if (!skill) throw new Error('La skill ya no existe.')
  return dirname(skill.file)
}

/** Las ediciones se guardan fuera de la aplicación para sobrevivir a sus actualizaciones. */
export function saveSkill(id: string, source: string, expectedSource: string): SkillDetail {
  if (typeof id !== 'string' || !id || id === '.' || id === '..' || basename(id) !== id || /[\\\0]/.test(id)) {
    throw new Error('Identificador de skill no válido.')
  }
  if (typeof source !== 'string' || !source.trim() || Buffer.byteLength(source, 'utf8') > 1024 * 1024) {
    throw new Error('La skill debe tener contenido y ocupar menos de 1 MB.')
  }
  if (/^---(?:\r?\n|$)/.test(source) && !/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(source)) {
    throw new Error('Cierra los metadatos iniciales con una línea de tres guiones (---).')
  }
  const parsed = parseFrontmatter(source)
  for (const field of ['name', 'description', 'author', 'host', 'icon', 'requires']) {
    if (parsed.data[field] !== undefined && typeof parsed.data[field] !== 'string') {
      throw new Error(`El campo ${field} debe ser texto.`)
    }
  }
  const current = getSkill(id)
  if (!current) throw new Error('La skill ya no existe.')
  if (typeof expectedSource !== 'string' || current.source !== expectedSource) {
    throw new Error('La skill cambió desde que la abriste. Recarga el contenido antes de guardar.')
  }
  const directory = join(userDir(), id)
  mkdirSync(directory, { recursive: true })
  const inside = relative(realpathSync(userDir()), realpathSync(directory))
  if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('La carpeta de la skill debe estar dentro de tus skills locales.')
  const file = join(directory, 'SKILL.md')
  const temporary = join(directory, `.SKILL-${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, source, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    renameSync(temporary, file)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
  return getSkill(id)!
}
export function toggleSkill(id: string, on: boolean): SkillMeta[] {
  enabled[id] = !!on; saveEnabled()
  return listSkills()
}

/**
 * ¿Tenemos ahora mismo lo que la skill pide? Sin `requires`, siempre sí.
 *
 * Lo aportan los servidores MCP del usuario: `mcpCapabilities()` mira las herramientas que
 * exponen y deduce si hay ejecución de código o acceso a ficheros.
 */
function cubierta(requires: string | null): boolean {
  return !requires || mcpCapabilities().has(requires)
}

/**
 * Skills habilitadas con su cuerpo — para inyectar al agente.
 *
 * Se filtran también las que piden una capacidad que no tenemos. Esto NO es cosmético: las
 * de Office y PDF instruyen `python scripts/office/unpack.py` y una tool `bash`, y Titanio no
 * tiene ninguna de las dos (`run_js` es JavaScript dentro de la página). Pasárselas al
 * agente es garantizar que intente lo imposible o que se invente que lo hizo.
 */
export function enabledSkills(): SkillDetail[] {
  return allLoaded()
    .filter((s) => s.enabled && cubierta(s.requires))
    .map(({ file: _f, ...d }) => d)
}
