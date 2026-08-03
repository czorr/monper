import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'fs'
import { readJson, writeJson } from './jsonfile'

/**
 * Vigías: las páginas que el usuario vigila desde el new tab (el "muro vivo").
 *
 * Cada vigía es una URL que se recarga en segundo plano CON su sesión (headless) y se captura.
 * `cambio.png` guarda lo último capturado; `visto.png`, lo que el usuario tenía delante la
 * última vez que miró. La diferencia entre ambos es lo que hace brillar un portal.
 *
 * Este módulo no toca Electron: la captura y la decodificación de PNG viven en index.ts y aquí
 * llegan como buffers. Es lo que permite probar el diff y el almacén sin levantar la app.
 */

export interface Vigia {
  id: string
  url: string
  title: string
  favicon: string | null
  addedAt: number
  /** Última captura buena. 0 = nunca (aún sin portal que enseñar). */
  capturedAt: number
  /** La captura difiere de lo último que el usuario vio. */
  changed: boolean
}

/** Por debajo de esta fracción de píxeles distintos, una página "no cambió". Absorbe relojes,
 *  carruseles pequeños y anti-aliasing; un cambio real (un email nuevo, un precio) lo supera. */
const UMBRAL = 0.015
/** Diferencia mínima por canal para contar un píxel como distinto (ruido de compresión). */
const RUIDO = 24

let dir = ''
let vigias: Vigia[] = []

function fichero(): string { return join(dir, 'vigias.json') }
/** Rutas de las dos capturas de un vigía. */
export function rutasDeCaptura(id: string): { actual: string; visto: string } {
  return { actual: join(dir, `${id}.png`), visto: join(dir, `${id}.visto.png`) }
}

export function initVigias(carpeta: string): void {
  dir = carpeta
  try { mkdirSync(dir, { recursive: true }) } catch (e) {
    console.error('[vigias] no se pudo crear', dir, e instanceof Error ? e.message : e)
  }
  vigias = readJson<Vigia[]>(fichero(), [], 'los vigías del muro').filter((v) => v && typeof v.url === 'string')
}

function guardar(): void { writeJson(fichero(), vigias, 'los vigías del muro', false) }

export function listVigias(): Vigia[] { return vigias.map((v) => ({ ...v })) }

export function vigiaDe(url: string): Vigia | null {
  return vigias.find((v) => v.url === url) ?? null
}

export function vigilar(url: string, title: string, favicon: string | null): Vigia {
  const ya = vigiaDe(url)
  if (ya) return { ...ya }
  const v: Vigia = {
    id: Math.random().toString(36).slice(2, 10),
    url, title: title || url, favicon: favicon || null,
    addedAt: Date.now(), capturedAt: 0, changed: false
  }
  vigias = [...vigias, v]
  guardar()
  return { ...v }
}

export function dejarDeVigilar(id: string): boolean {
  const v = vigias.find((x) => x.id === id)
  if (!v) return false
  vigias = vigias.filter((x) => x.id !== id)
  guardar()
  const r = rutasDeCaptura(id)
  try { rmSync(r.actual, { force: true }); rmSync(r.visto, { force: true }) } catch { /* ya no estaban */ }
  return true
}

/**
 * ¿Cambió la página entre dos capturas? Bitmaps RGBA crudos, mismas dimensiones.
 *
 * Píxel a píxel con dos tolerancias: `RUIDO` por canal (la compresión y el anti-aliasing mueven
 * los valores sin que nada cambie) y `UMBRAL` sobre el total (un reloj en una esquina no es un
 * cambio). Tamaños distintos = cambió: la página creció o encogió, y eso ES un cambio.
 */
export function hayCambio(a: Buffer, b: Buffer, ancho: number, alto: number): boolean {
  if (a.length !== b.length) return true
  const total = ancho * alto
  if (!total || a.length < total * 4) return true
  const techo = Math.floor(total * UMBRAL)
  let distintos = 0
  for (let i = 0; i < total * 4; i += 4) {
    if (
      Math.abs(a[i] - b[i]) > RUIDO ||
      Math.abs(a[i + 1] - b[i + 1]) > RUIDO ||
      Math.abs(a[i + 2] - b[i + 2]) > RUIDO
    ) {
      if (++distintos > techo) return true
    }
  }
  return false
}

/**
 * Registra una captura nueva. `cambio` viene calculado de fuera (necesita decodificar PNG, que
 * es cosa de Electron). En la primera captura no hay "visto": se copia y se arranca en paz.
 */
export function registrarCaptura(id: string, png: Buffer, cambio: boolean): Vigia | null {
  const v = vigias.find((x) => x.id === id)
  if (!v) return null
  const r = rutasDeCaptura(id)
  try {
    writeFileSync(r.actual, png)
    if (!existsSync(r.visto)) { copyFileSync(r.actual, r.visto); cambio = false }
  } catch (e) {
    console.error('[vigias] no se pudo guardar la captura de', v.url, e instanceof Error ? e.message : e)
    return null
  }
  vigias = vigias.map((x) => (x.id === id ? { ...x, capturedAt: Date.now(), changed: cambio } : x))
  guardar()
  return { ...vigias.find((x) => x.id === id)! }
}

/** El usuario miró este portal: lo actual pasa a ser lo visto y se apaga el brillo. */
export function marcarVisto(id: string): void {
  const v = vigias.find((x) => x.id === id)
  if (!v) return
  const r = rutasDeCaptura(id)
  try { if (existsSync(r.actual)) copyFileSync(r.actual, r.visto) } catch { /* sin captura aún */ }
  vigias = vigias.map((x) => (x.id === id ? { ...x, changed: false } : x))
  guardar()
}

export function capturaActual(id: string): Buffer | null {
  const r = rutasDeCaptura(id)
  try { return existsSync(r.actual) ? readFileSync(r.actual) : null } catch { return null }
}

export function capturaVista(id: string): Buffer | null {
  const r = rutasDeCaptura(id)
  try { return existsSync(r.visto) ? readFileSync(r.visto) : null } catch { return null }
}
