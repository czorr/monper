import { readJson, writeJson } from './jsonfile'

/**
 * Widgets del new tab: el dato de un sitio, extraído con TU sesión y pintado como tarjeta.
 *
 * No son iframes ni capturas: al crear uno, el agente escribe UNA VEZ un extractor (un snippet
 * del REPL, igual que las rutinas) que devuelve datos con forma fija. Refrescar es correr ese
 * snippet headless — determinista y sin gastar un token. El modelo solo vuelve a intervenir si
 * el sitio cambia su HTML y el extractor se rompe.
 *
 * Este módulo es el almacén y las decisiones puras (validar formas, detectar cambios). La
 * generación y la ejecución viven en index.ts: necesitan Electron.
 */

/** Hacia dónde se movió el número. Decide el color, así que no se deduce del texto. */
export type Signo = 'sube' | 'baja' | 'neutro'

export type DatosWidget =
  /**
   * Un número que importa, con su variación y —si el sitio la da— su historia reciente.
   * `serie` es lo que convierte la tarjeta en un gráfico en vez de en una cifra suelta.
   */
  | {
      tipo: 'metrica'
      valor: string
      etiqueta?: string
      delta?: { texto: string; signo: Signo }
      serie?: number[]
      forma?: 'linea' | 'barras'
    }
  /** Una proporción: batería, progreso de un objetivo, % de algo. */
  | { tipo: 'progreso'; porcentaje: number; valor?: string; etiqueta?: string }
  /** Filas: titulares, PRs, correos. */
  | { tipo: 'lista'; items: { texto: string; meta?: string; url?: string }[] }

export interface Widget {
  id: string
  /** Lo que el usuario pidió, en sus palabras. Vacío si el widget nació de una página. */
  peticion?: string
  url: string
  /** Título del widget (lo pone el modelo al crearlo; "Rayados", no "mediotiempo.com"). */
  title: string
  favicon: string | null
  /** El snippet del REPL que extrae los datos. Escrito por el modelo, corre sin él. */
  extractor: string
  datos: DatosWidget | null
  /** JSON de lo último que el usuario vio: contra esto se decide si el widget "brilla". */
  vistoJson: string
  updatedAt: number
  changed: boolean
  /** Fallos seguidos del extractor. A partir de 2, el sitio probablemente cambió su HTML. */
  fallos: number
  creando?: boolean
  /**
   * Por qué no hay datos. Un widget que falla y desaparece es la peor versión de "no funciona":
   * el usuario pidió algo, no pasó nada y nadie dijo nada. Se queda la tarjeta, con el motivo
   * y un botón de reintentar.
   */
  error?: string
}

let file = ''
let widgets: Widget[] = []

export function initWidgets(fichero: string): void {
  file = fichero
  widgets = readJson<Widget[]>(file, [], 'los widgets del new tab')
    .filter((w) => w && typeof w.url === 'string')
    // Un "creando" que sobrevivió a un cierre es un cadáver: la generación murió con la app.
    .filter((w) => !w.creando)
}

function guardar(): void { writeJson(file, widgets, 'los widgets del new tab', false) }

export function listWidgets(): Widget[] { return widgets.map((w) => ({ ...w })) }
export function widgetDe(url: string): Widget | null { return widgets.find((w) => w.url === url) ?? null }

/** Alta en estado "creando": el new tab enseña el hueco mientras el modelo escribe el extractor. */
export function crearPendiente(url: string, title: string, favicon: string | null, peticion?: string): Widget {
  const ya = url ? widgetDe(url) : null
  if (ya) return { ...ya }
  const w: Widget = {
    id: Math.random().toString(36).slice(2, 10),
    peticion,
    url, title: title || peticion || url, favicon: favicon || null,
    extractor: '', datos: null, vistoJson: '', updatedAt: 0, changed: false, fallos: 0, creando: true, error: undefined
  }
  widgets = [...widgets, w]
  guardar()
  return { ...w }
}

/**
 * El modelo terminó: entra la fuente que eligió, el extractor y los primeros datos. Nunca
 * brilla al nacer.
 */
export function completarWidget(
  id: string, title: string, extractor: string, datos: DatosWidget,
  fuente?: { url: string; favicon?: string | null }
): Widget | null {
  if (!widgets.some((w) => w.id === id)) return null
  const json = JSON.stringify(datos)
  widgets = widgets.map((w) => (w.id === id
    ? {
        ...w, title: title || w.title, extractor, datos, vistoJson: json,
        url: fuente?.url || w.url,
        favicon: fuente?.favicon ?? w.favicon,
        updatedAt: Date.now(), changed: false, fallos: 0, creando: false, error: undefined
      }
    : w))
  guardar()
  return { ...widgets.find((w) => w.id === id)! }
}

/**
 * La generación falló. La tarjeta NO se borra: se queda con el motivo, para que el usuario
 * sepa qué pasó y pueda reintentar. Borrarla en silencio era el bug de "no funciona y no dice
 * nada" — ver docs/errores-silenciosos.md.
 */
export function marcarError(id: string, error: string): void {
  widgets = widgets.map((w) => (w.id === id ? { ...w, creando: false, error } : w))
  guardar()
}

/** Vuelve a poner el widget en "creando" para un reintento. */
export function reintentar(id: string): Widget | null {
  const w = widgets.find((x) => x.id === id)
  if (!w) return null
  widgets = widgets.map((x) => (x.id === id ? { ...x, creando: true, error: undefined } : x))
  guardar()
  return { ...widgets.find((x) => x.id === id)! }
}

export function quitarWidget(id: string): boolean {
  const antes = widgets.length
  widgets = widgets.filter((w) => w.id !== id)
  if (widgets.length === antes) return false
  guardar()
  return true
}

/**
 * Resultado de un refresco. `changed` compara contra lo VISTO, no contra la última captura:
 * si el marcador cambió tres veces desde que miraste, sigue siendo un solo "esto se movió".
 */
export function registrarDatos(id: string, datos: DatosWidget): Widget | null {
  const w = widgets.find((x) => x.id === id)
  if (!w) return null
  const json = JSON.stringify(datos)
  widgets = widgets.map((x) => (x.id === id
    ? { ...x, datos, updatedAt: Date.now(), changed: json !== x.vistoJson, fallos: 0, error: undefined }
    : x))
  guardar()
  return { ...widgets.find((x) => x.id === id)! }
}

export function registrarFallo(id: string): void {
  widgets = widgets.map((x) => (x.id === id ? { ...x, fallos: x.fallos + 1, updatedAt: Date.now() } : x))
  guardar()
}

export function marcarVisto(id: string): void {
  widgets = widgets.map((x) => (x.id === id
    ? { ...x, changed: false, vistoJson: x.datos ? JSON.stringify(x.datos) : x.vistoJson }
    : x))
  guardar()
}

/** El extractor reparado por el modelo tras romperse el HTML del sitio. */
export function repararExtractor(id: string, extractor: string): void {
  widgets = widgets.map((x) => (x.id === id ? { ...x, extractor, fallos: 0 } : x))
  guardar()
}

/**
 * Valida lo que devolvió el extractor. El snippet lo escribió un modelo y corre sobre una web
 * que puede decir cualquier cosa: aquí se decide qué formas existen y se recorta todo lo demás.
 * Devolver null (no "lo que haya") es lo que permite contar un resultado malo como fallo.
 */
/**
 * La fuente que eligió el modelo para lo que el usuario pidió.
 *
 * Solo http(s): el modelo escribe esta URL y luego se CARGA con la sesión del usuario. Un
 * `file://` ahí sería leerle el disco, y un `javascript:` peor. Es la misma frontera que en los
 * enlaces de una lista, y por el mismo motivo.
 */
export function validarFuente(raw: unknown): { url: string; que: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (typeof d.url !== 'string' || !/^https?:\/\//i.test(d.url)) return null
  try { new URL(d.url) } catch { return null }
  return { url: d.url, que: typeof d.que === 'string' ? d.que.slice(0, 200) : '' }
}

export function validarDatos(raw: unknown): DatosWidget | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const texto = (v: unknown, max: number): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

  if (d.tipo === 'metrica') {
    const valor = texto(d.valor, 24)
    if (!valor) return null
    // La serie se recorta y se limpia de no-números: un NaN dentro rompería el path del SVG y
    // dejaría la tarjeta en blanco sin decir por qué.
    const serieCruda = Array.isArray(d.serie) ? d.serie : []
    const serie = serieCruda
      // `Number(null)` es 0 y `Number(true)` es 1: un hueco en la serie se convertiría en un
      // punto falso que deforma el gráfico. Solo números, o cadenas que sean un número.
      .map((n) => (typeof n === 'number' ? n : typeof n === 'string' && n.trim() ? Number(n) : NaN))
      .filter((n) => Number.isFinite(n))
      .slice(-40)
    const delta = d.delta && typeof d.delta === 'object' ? (d.delta as Record<string, unknown>) : null
    const dTexto = delta ? texto(delta.texto, 20) : undefined
    const signo: Signo = delta && ['sube', 'baja', 'neutro'].includes(String(delta.signo))
      ? (delta.signo as Signo) : 'neutro'
    return {
      tipo: 'metrica',
      valor,
      etiqueta: texto(d.etiqueta, 40),
      delta: dTexto ? { texto: dTexto, signo } : undefined,
      serie: serie.length >= 2 ? serie : undefined,
      forma: d.forma === 'barras' ? 'barras' : 'linea'
    }
  }

  if (d.tipo === 'progreso') {
    const n = typeof d.porcentaje === 'number' ? d.porcentaje : Number(d.porcentaje)
    if (!Number.isFinite(n)) return null
    // Se recorta a 0..100 en vez de rechazar: un 103% del sitio es un dato bueno mal escalado.
    return {
      tipo: 'progreso',
      porcentaje: Math.max(0, Math.min(100, Math.round(n))),
      valor: texto(d.valor, 24),
      etiqueta: texto(d.etiqueta, 40)
    }
  }

  if (d.tipo === 'lista' && Array.isArray(d.items)) {
    const items: { texto: string; meta?: string; url?: string }[] = []
    for (const bruto of d.items) {
      if (items.length >= 5) break
      if (!bruto || typeof bruto !== 'object') continue
      const i = bruto as Record<string, unknown>
      const t = texto(i.texto, 120)
      if (!t) continue
      items.push({
        texto: t,
        meta: texto(i.meta, 24),
        // Solo http(s): un extractor sobre una página hostil no puede colar javascript: aquí.
        url: typeof i.url === 'string' && /^https?:\/\//i.test(i.url) ? i.url : undefined
      })
    }
    return items.length ? { tipo: 'lista', items } : null
  }
  return null
}


