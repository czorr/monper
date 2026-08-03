import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { test, expect } from '@playwright/test'
import {
  initWidgets, listWidgets, crearPendiente, completarWidget, marcarError, reintentar, quitarWidget,
  registrarDatos, registrarFallo, marcarVisto, validarDatos, validarFuente
} from '../src/main/widgets'

/**
 * Widgets del new tab. Dos cosas se juegan aquí:
 *
 * 1. `validarDatos` es la frontera: el extractor lo escribió un modelo y corre sobre una web
 *    que puede decir cualquier cosa. Lo que no tenga forma conocida no entra, y un enlace que
 *    no sea http(s) tampoco — es la línea entre "widget" y "vector de inyección".
 * 2. El ciclo del brillo compara contra lo VISTO, no contra la última extracción: tres cambios
 *    sin mirar siguen siendo UN "esto se movió".
 */

let base = ''

test.beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'monper-widgets-'))
  initWidgets(join(base, 'widgets.json'))
})
test.afterEach(() => { rmSync(base, { recursive: true, force: true }) })

// ---- validarDatos: la frontera ----

test('una métrica bien formada pasa; la basura no', () => {
  const r = validarDatos({ tipo: 'metrica', valor: '$8.01', etiqueta: 'Tesla', delta: { texto: '+1.24%', signo: 'sube' } })
  expect(r).toEqual({ tipo: 'metrica', valor: '$8.01', etiqueta: 'Tesla', delta: { texto: '+1.24%', signo: 'sube' }, serie: undefined, forma: 'linea' })
  expect(validarDatos({ tipo: 'metrica', valor: '' })).toBeNull()
  expect(validarDatos({ tipo: 'metrica' })).toBeNull()
  expect(validarDatos('un string')).toBeNull()
  expect(validarDatos(null)).toBeNull()
  expect(validarDatos({ tipo: 'otra-cosa', valor: 'x' })).toBeNull()
})

test('un signo inventado cae en neutro, no pinta de verde lo que baja', () => {
  // El color del delta sale del signo. Si un signo raro colara como "sube", una caída se
  // pintaría en verde: peor que no pintar nada.
  const r = validarDatos({ tipo: 'metrica', valor: '1', delta: { texto: '-3%', signo: 'ROJO' } })
  if (r?.tipo !== 'metrica') throw new Error('debió ser métrica')
  expect(r.delta?.signo).toBe('neutro')
})

test('la serie se limpia de valores no numéricos', () => {
  /**
   * Un NaN dentro rompe el `path` del SVG y deja la tarjeta en blanco SIN decir por qué —
   * exactamente el fallo invisible que no queremos.
   */
  const r = validarDatos({ tipo: 'metrica', valor: '1', serie: [1, '2', null, 'x', 4, Infinity] })
  if (r?.tipo !== 'metrica') throw new Error('debió ser métrica')
  expect(r.serie).toEqual([1, 2, 4])
})

test('una serie de menos de dos puntos no es un gráfico', () => {
  // Con un solo punto no hay línea que dibujar: mejor la cifra sola que un gráfico vacío.
  const r = validarDatos({ tipo: 'metrica', valor: '1', serie: [5] })
  if (r?.tipo !== 'metrica') throw new Error('debió ser métrica')
  expect(r.serie).toBeUndefined()
})

test('el progreso se recorta a 0..100 en vez de rechazarse', () => {
  // Un 103% del sitio es un dato bueno mal escalado: tirarlo perdería el widget entero.
  expect(validarDatos({ tipo: 'progreso', porcentaje: 103 })).toMatchObject({ porcentaje: 100 })
  expect(validarDatos({ tipo: 'progreso', porcentaje: -8 })).toMatchObject({ porcentaje: 0 })
  expect(validarDatos({ tipo: 'progreso', porcentaje: '73' })).toMatchObject({ porcentaje: 73 })
  expect(validarDatos({ tipo: 'progreso', porcentaje: 'muchos' })).toBeNull()
})

test('una lista se recorta a 5 y tira las filas sin texto', () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ texto: `fila ${i}` }))
  const r = validarDatos({ tipo: 'lista', items: [...items, { texto: '' }, { meta: 'sin texto' }] })
  expect(r?.tipo).toBe('lista')
  if (r?.tipo === 'lista') expect(r.items).toHaveLength(5)
})

test('una lista vacía no es un widget', () => {
  expect(validarDatos({ tipo: 'lista', items: [] })).toBeNull()
  expect(validarDatos({ tipo: 'lista', items: [{ texto: '  ' }] })).toBeNull()
})

test('un enlace que no sea http(s) se tira: javascript: no entra al new tab', () => {
  // El extractor corre sobre una página hostil que puede fabricar estos items.
  const r = validarDatos({
    tipo: 'lista',
    items: [{ texto: 'ok', url: 'https://x.test/a' }, { texto: 'malo', url: 'javascript:alert(1)' }, { texto: 'raro', url: 'file:///etc/passwd' }]
  })
  if (r?.tipo !== 'lista') throw new Error('debió ser lista')
  expect(r.items[0].url).toBe('https://x.test/a')
  expect(r.items[1].url, 'un javascript: sobrevivió a la validación').toBeUndefined()
  expect(r.items[2].url).toBeUndefined()
})

test('los textos larguísimos se recortan', () => {
  const r = validarDatos({ tipo: 'metrica', valor: 'x'.repeat(500) })
  if (r?.tipo !== 'metrica') throw new Error('debió ser métrica')
  expect(r.valor.length).toBeLessThanOrEqual(24)
})

// ---- el ciclo de vida ----

test('crear dos veces la misma URL no duplica', () => {
  crearPendiente('https://x.test/', 'X', null)
  crearPendiente('https://x.test/', 'X', null)
  expect(listWidgets()).toHaveLength(1)
})

test('al completarse no brilla: lo primero que ves no puede llegar "cambiado"', () => {
  const w = crearPendiente('https://x.test/', 'X', null)
  const r = completarWidget(w.id, 'Rayados', 'return 1', { tipo: 'metrica', valor: '2-1' })
  expect(r?.changed).toBe(false)
  expect(r?.creando).toBe(false)
})

test('el brillo compara contra lo VISTO, no contra la última extracción', () => {
  const w = crearPendiente('https://x.test/', 'X', null)
  completarWidget(w.id, 'X', 'return 1', { tipo: 'metrica', valor: 'A' })
  registrarDatos(w.id, { tipo: 'metrica', valor: 'B' })
  registrarDatos(w.id, { tipo: 'metrica', valor: 'C' })
  expect(listWidgets()[0].changed).toBe(true)
  // Y si vuelve a valer lo que viste, se apaga solo: no hay nada nuevo que enseñarte.
  registrarDatos(w.id, { tipo: 'metrica', valor: 'A' })
  expect(listWidgets()[0].changed).toBe(false)
})

test('marcar visto apaga y fija la nueva referencia', () => {
  const w = crearPendiente('https://x.test/', 'X', null)
  completarWidget(w.id, 'X', 'return 1', { tipo: 'metrica', valor: 'A' })
  registrarDatos(w.id, { tipo: 'metrica', valor: 'B' })
  marcarVisto(w.id)
  expect(listWidgets()[0].changed).toBe(false)
  registrarDatos(w.id, { tipo: 'metrica', valor: 'B' })
  expect(listWidgets()[0].changed, 'B ya estaba visto: no debe brillar').toBe(false)
})

test('un dato bueno pone a cero la cuenta de fallos', () => {
  const w = crearPendiente('https://x.test/', 'X', null)
  completarWidget(w.id, 'X', 'return 1', { tipo: 'metrica', valor: 'A' })
  registrarFallo(w.id)
  registrarFallo(w.id)
  expect(listWidgets()[0].fallos).toBe(2)
  registrarDatos(w.id, { tipo: 'metrica', valor: 'A' })
  expect(listWidgets()[0].fallos, 'un acierto debe perdonar los fallos anteriores').toBe(0)
})

test('si la creación falla, la tarjeta SE QUEDA con el motivo', () => {
  /**
   * Era el bug de "no funciona y no dice nada": pedías un widget, el modelo fallaba, el hueco
   * desaparecía y no había ni error ni rastro. Ahora el motivo se ve y se puede reintentar.
   */
  const w = crearPendiente('https://x.test/', 'X', null)
  marcarError(w.id, 'el extractor no devolvió datos con forma válida')
  const [v] = listWidgets()
  expect(v.creando).toBe(false)
  expect(v.error).toContain('forma válida')

  const r = reintentar(w.id)
  expect(r?.creando).toBe(true)
  expect(r?.error, 'reintentar tiene que limpiar el error anterior').toBeUndefined()
})

test('un "creando" no sobrevive al reinicio', () => {
  // La generación murió con la app: dejar el hueco girando para siempre sería mentir.
  crearPendiente('https://y.test/', 'Y', null)
  initWidgets(join(base, 'widgets.json'))
  expect(listWidgets(), 'un creando huérfano volvió del reinicio').toHaveLength(0)
})

test('quitar un widget completado lo quita de verdad', () => {
  const w = crearPendiente('https://x.test/', 'X', null)
  completarWidget(w.id, 'X', 'return 1', { tipo: 'metrica', valor: 'A' })
  expect(quitarWidget(w.id)).toBe(true)
  expect(listWidgets()).toHaveLength(0)
})

// ---- la fuente que elige el modelo ----

test('la fuente tiene que ser http(s): el modelo no puede mandarnos a leer el disco', () => {
  /**
   * Esta URL la escribe el modelo y luego se CARGA con la sesión del usuario. Un `file://` ahí
   * sería leerle el disco; un `javascript:` sería peor. Misma frontera que los enlaces de una
   * lista, y por el mismo motivo.
   */
  expect(validarFuente({ url: 'https://x.test/precio', que: 'el precio' })).toEqual({ url: 'https://x.test/precio', que: 'el precio' })
  expect(validarFuente({ url: 'file:///etc/passwd' })).toBeNull()
  expect(validarFuente({ url: 'javascript:alert(1)' })).toBeNull()
  expect(validarFuente({ url: 'x.test' }), 'sin esquema no se navega a ciegas').toBeNull()
  expect(validarFuente({ que: 'sin url' })).toBeNull()
  expect(validarFuente(null)).toBeNull()
})

test('un widget pedido por texto nace sin URL y la recibe al completarse', () => {
  // El orden importa: cuando pides "el precio del bitcoin" todavía no se sabe de dónde saldrá.
  // La tarjeta ya existe (con tu petición a la vista) y la fuente llega después.
  const w = crearPendiente('', 'el precio del bitcoin', null, 'el precio del bitcoin')
  expect(w.peticion).toBe('el precio del bitcoin')
  expect(w.url).toBe('')

  completarWidget(w.id, 'Bitcoin', 'return 1', { tipo: 'metrica', valor: '$64,120' }, { url: 'https://coin.test/btc', favicon: null })
  const [v] = listWidgets()
  expect(v.url).toBe('https://coin.test/btc')
  expect(v.title).toBe('Bitcoin')
})

test('dos peticiones distintas no se pisan aunque las dos empiecen sin URL', () => {
  // `crearPendiente` deduplica por URL; con '' las dos colisionarían y la segunda devolvería
  // la primera — te quedarías con un widget en vez de dos.
  crearPendiente('', 'bitcoin', null, 'bitcoin')
  crearPendiente('', 'clima', null, 'clima')
  expect(listWidgets()).toHaveLength(2)
})
