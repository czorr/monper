import type { WebContents } from 'electron'
// Consumimos la librería desde su fuente: vite la empaqueta y tsc la tipa, sin
// necesitar dist/ compilado ni publicarla. (Para publicar, se build por separado.)
import { pageFromWebContents } from '../../../packages/titaniowright/src/electron'
import type { Page } from '../../../packages/titaniowright/src'
import { buildGlobals } from './globals'

// Constructor de funciones async (no expuesto directamente en el runtime).
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...a: unknown[]) => Promise<unknown>

const MAX_OUT = 4000

function fmt(v: unknown): string {
  if (typeof v === 'string') return v
  try {
    const s = JSON.stringify(v, null, 2)
    return s.length > MAX_OUT ? s.slice(0, MAX_OUT) + `\n…(+${s.length - MAX_OUT} chars)` : s
  } catch {
    return String(v)
  }
}

/**
 * Ejecuta código del agente en un REPL con `page` (titaniowright), `state`
 * (persiste entre llamadas del mismo run) y `log()`. El código corre en el
 * proceso main (Node): puede usar await, fetch, etc., y orquesta la página vía
 * titaniowright. Es el núcleo del "coding agent".
 */
export async function runRepl(
  wc: WebContents,
  code: string,
  state: Record<string, unknown>
): Promise<string> {
  const page = pageFromWebContents(wc, { actionDelay: 150 })
  const logs: string[] = []
  const log = (...args: unknown[]): void => {
    logs.push(args.map(fmt).join(' '))
  }

  let result: unknown
  try {
    result = await execInRepl(page, wc, code, { state, log })
  } catch (e) {
    const msg = e instanceof Error ? e.stack || e.message : String(e)
    return `ERROR en ejecución: ${msg}${logs.length ? '\n\nlogs:\n' + logs.join('\n') : ''}`
  }

  const parts: string[] = []
  if (logs.length) parts.push('logs:\n' + logs.join('\n'))
  if (result !== undefined) parts.push('result:\n' + fmt(result))
  return parts.join('\n\n') || 'OK (sin valor de retorno).'
}

/**
 * Núcleo del REPL: ejecuta `code` con `page` (titaniowright), `state`, `log()` y todos
 * los globals de las skills, y devuelve el valor CRUDO. Lo usan tanto la tool del
 * agente (runRepl, que formatea) como las rutinas (que necesitan el valor tal cual).
 */
export async function execInRepl(
  page: Page,
  wc: WebContents,
  code: string,
  opts: { state?: Record<string, unknown>; log?: (...a: unknown[]) => void } = {}
): Promise<unknown> {
  const globals = buildGlobals(page, wc)
  const gNames = Object.keys(globals)
  const gValues = gNames.map((k) => globals[k])
  const fn = new AsyncFunction('page', 'state', 'log', ...gNames, code)
  return fn(page, opts.state ?? {}, opts.log ?? ((): void => {}), ...gValues)
}
