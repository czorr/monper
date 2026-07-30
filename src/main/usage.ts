import { join } from 'path'
import { app } from 'electron'
import { readJson, writeJson } from './jsonfile'
import type { TurnoUso, ResumenUso, UsoPorDia, UsoPorModelo } from '../shared/types'
import { costeDe } from '../shared/precios'

/**
 * Consumo del agente: qué gastó cada turno y cuánto cuesta.
 *
 * Existe porque hasta ahora no se contaba **nada**. La primera noticia de que te habías quedado
 * sin crédito era un error del proveedor a mitad de tarea — se arregla enseñándolo venir.
 *
 * Se guarda un registro por turno, no un acumulado: un contador que solo sube no deja
 * responder "¿qué hice ayer?" ni "¿qué modelo me está saliendo caro?", que son las dos
 * preguntas por las que alguien abre esta pantalla.
 */

/** Días que se conservan. Un año de turnos son unos pocos MB y el fichero se lee entero. */
const DIAS = 90

let file = ''
let turnos: TurnoUso[] = []
let fileLimite = ''
/** Dólares/día que el agente puede gastar. 0 = sin techo. */
let limite = 0

/** `YYYY-MM-DD` en hora LOCAL: "hoy" es el día del usuario, no el de UTC. */
function dia(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function initUsage(): void {
  file = join(app.getPath('userData'), 'usage.json')
  turnos = readJson<TurnoUso[]>(file, [], 'el consumo del agente')
  // En fichero aparte y no dentro de usage.json: ese es una lista que se poda y se reescribe
  // entera, y el techo que puso el usuario no puede perderse en una poda.
  fileLimite = join(app.getPath('userData'), 'usage-limit.json')
  limite = readJson<{ diario: number }>(fileLimite, { diario: 0 }, 'el límite de gasto').diario || 0
  podar()
}

export function limiteDiario(): number { return limite }
export function setLimiteDiario(v: number): void {
  limite = Number.isFinite(v) && v > 0 ? v : 0
  writeJson(fileLimite, { diario: limite }, 'el límite de gasto')
}

function podar(): void {
  const corte = Date.now() - DIAS * 24 * 60 * 60 * 1000
  const antes = turnos.length
  turnos = turnos.filter((t) => t.at >= corte)
  if (turnos.length !== antes) persist()
}

function persist(): void {
  writeJson(file, turnos, 'el consumo del agente', false)
}

/**
 * Anota un turno. Un turno sin tokens NO se guarda: el proveedor no siempre reporta uso
 * (abortos, errores antes de llamar al modelo) y guardar ceros ensuciaría las medias con
 * turnos que nunca existieron.
 */
export function anotarTurno(t: Omit<TurnoUso, 'at'> & { at?: number }): void {
  if (!t.inputTokens && !t.outputTokens) return
  turnos.push({ ...t, at: t.at ?? Date.now() })
  podar()
  persist()
}

export function turnosDe(desdeMs: number): TurnoUso[] {
  return turnos.filter((t) => t.at >= desdeMs)
}

/** Gasto estimado de HOY. Es lo que compara el límite antes de dejar arrancar un turno. */
export function gastoDeHoy(): number {
  const hoy = dia(Date.now())
  return turnos.filter((t) => dia(t.at) === hoy).reduce((s, t) => s + (costeDe(t) ?? 0), 0)
}

export function resumen(dias = 30): ResumenUso {
  const desde = Date.now() - dias * 24 * 60 * 60 * 1000
  const v = turnosDe(desde)

  const porDia = new Map<string, UsoPorDia>()
  const porModelo = new Map<string, UsoPorModelo>()
  let sinPrecio = false

  for (const t of v) {
    const d = dia(t.at)
    const c = costeDe(t)
    if (c === null) sinPrecio = true

    const acumDia = porDia.get(d) ?? { dia: d, turnos: 0, pasos: 0, inputTokens: 0, outputTokens: 0, coste: 0 }
    acumDia.turnos++
    acumDia.pasos += t.steps
    acumDia.inputTokens += t.inputTokens
    acumDia.outputTokens += t.outputTokens
    acumDia.coste += c ?? 0
    porDia.set(d, acumDia)

    const acumMod = porModelo.get(t.model) ?? { model: t.model, turnos: 0, inputTokens: 0, outputTokens: 0, coste: 0, conPrecio: c !== null }
    acumMod.turnos++
    acumMod.inputTokens += t.inputTokens
    acumMod.outputTokens += t.outputTokens
    acumMod.coste += c ?? 0
    porModelo.set(t.model, acumMod)
  }

  return {
    dias,
    turnos: v.length,
    pasos: v.reduce((s, t) => s + t.steps, 0),
    fallidos: v.filter((t) => !t.ok).length,
    inputTokens: v.reduce((s, t) => s + t.inputTokens, 0),
    outputTokens: v.reduce((s, t) => s + t.outputTokens, 0),
    cachedInputTokens: v.reduce((s, t) => s + (t.cachedInputTokens ?? 0), 0),
    coste: v.reduce((s, t) => s + (costeDe(t) ?? 0), 0),
    hayModelosSinPrecio: sinPrecio,
    gastoHoy: gastoDeHoy(),
    porDia: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    porModelo: [...porModelo.values()].sort((a, b) => b.coste - a.coste || b.turnos - a.turnos)
  }
}

export function borrarUso(): void {
  turnos = []
  persist()
}
