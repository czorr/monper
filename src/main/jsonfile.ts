import { writeFileSync, readFileSync, renameSync, existsSync } from 'fs'

/**
 * Lectura y escritura de los JSON de estado (bookmarks, vault, historial, perfil…).
 *
 * Antes cada módulo tenía su `try { writeFileSync(...) } catch { /* noop *\/ }`. Eso
 * significa que si el disco falla —permisos, disco lleno, ruta que no existe— el usuario
 * pierde sus marcadores, sus API keys o un secreto del vault y NADIE se entera: ni él, ni
 * nosotros en un log. Aquí al menos queda dicho, con el nombre de lo que se perdió.
 *
 * La escritura es atómica (fichero temporal + rename) para que un cierre a mitad de
 * escritura no deje el JSON truncado: eso convertía "no se guardó lo último" en "se perdió
 * todo el fichero", porque al arrancar el parse falla y se cae al valor por defecto.
 */

export interface WriteResult {
  ok: boolean
  error?: string
}

/**
 * Guarda `data` como JSON. Devuelve si se pudo; quien llame decide si eso importa
 * (el vault sí, la última posición de la ventana no).
 */
export function writeJson(file: string, data: unknown, label: string, pretty = true): WriteResult {
  const tmp = `${file}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(data, null, pretty ? 2 : undefined))
    renameSync(tmp, file)
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error(`[estado] no se pudo guardar ${label} en ${file}: ${error}`)
    return { ok: false, error }
  }
}

/**
 * Lee un JSON y devuelve `fallback` si no existe o está corrupto.
 *
 * Que no exista es normal (primer arranque) y no se dice nada. Que exista y NO se pueda
 * leer es otra cosa: significa que el usuario tenía datos y los estamos ignorando, así que
 * eso sí se avisa.
 */
export function readJson<T>(file: string, fallback: T, label: string): T {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch (e) {
    console.error(`[estado] ${label} ilegible en ${file} (se usa el valor por defecto): ${e instanceof Error ? e.message : String(e)}`)
    return fallback
  }
}
