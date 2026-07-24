import type { WebContents } from 'electron'
// Consumimos la librería desde su fuente: vite la empaqueta y tsc la tipa, sin
// necesitar dist/ compilado ni publicarla. (Para publicar, se build por separado.)
import { pageFromWebContents } from '../../../packages/monperwright/src/electron'

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
 * Ejecuta código del agente en un REPL con `page` (monperwright), `state`
 * (persiste entre llamadas del mismo run) y `log()`. El código corre en el
 * proceso main (Node): puede usar await, fetch, etc., y orquesta la página vía
 * monperwright. Es el núcleo del "coding agent".
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

  let fn: (...a: unknown[]) => Promise<unknown>
  try {
    fn = new AsyncFunction('page', 'state', 'log', code)
  } catch (e) {
    return `ERROR de sintaxis: ${e instanceof Error ? e.message : String(e)}`
  }

  let result: unknown
  try {
    result = await fn(page, state, log)
  } catch (e) {
    const msg = e instanceof Error ? e.stack || e.message : String(e)
    return `ERROR en ejecución: ${msg}${logs.length ? '\n\nlogs:\n' + logs.join('\n') : ''}`
  }

  const parts: string[] = []
  if (logs.length) parts.push('logs:\n' + logs.join('\n'))
  if (result !== undefined) parts.push('result:\n' + fmt(result))
  return parts.join('\n\n') || 'OK (sin valor de retorno).'
}
