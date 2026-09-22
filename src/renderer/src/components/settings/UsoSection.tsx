import { useCallback, useEffect, useState, type JSX } from 'react'
import type { ResumenUso } from '@shared/types'
import IconChart from '~icons/tabler/chart-bar'
import IconAlert from '~icons/tabler/alert-triangle'
import { Card, SettingsHeader } from './ui'

const { titanioTab } = window

const RANGOS = [7, 30, 90] as const

/** Miles con separador, sin dependencias. Los tokens se cuentan por millones y así se leen. */
function num(n: number): string {
  return n.toLocaleString('es')
}
/** Céntimos importan: un turno suele costar menos de un centavo y redondear a 2 lo borra. */
function dinero(n: number): string {
  if (n === 0) return '$0'
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}

function Dato({ valor, label }: { valor: string; label: string }): JSX.Element {
  return (
    <div className="flex-1 px-4 py-3.5">
      <div className="text-[20px] font-semibold tracking-tight tabular-nums">{valor}</div>
      <div className="text-[12.5px] text-text-dim mt-0.5">{label}</div>
    </div>
  )
}

/**
 * Barras por día. SVG a mano y no una librería de gráficas: son treinta rectángulos, y meter
 * una dependencia de charts en el bundle del navegador para esto no se paga.
 */
function Barras({ r }: { r: ResumenUso }): JSX.Element {
  const dias = r.porDia
  if (dias.length === 0) return <></>
  const max = Math.max(...dias.map((d) => d.coste), 0.0001)
  return (
    <div className="flex items-end gap-1 h-24 px-4 py-3">
      {dias.map((d) => (
        <div
          key={d.dia}
          title={`${d.dia} · ${d.turnos} turnos · ${dinero(d.coste)}`}
          className="flex-1 min-w-[3px] rounded-t bg-white/25 hover:bg-white/45 transition-colors"
          // Mínimo de 2px: un día con gasto pequeño pero real no puede verse igual que uno vacío.
          style={{ height: `${Math.max(d.coste > 0 ? 2 : 0, (d.coste / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

/**
 * Settings → Billing y Statistics.
 *
 * Es un componente con dos caras porque los dos leen exactamente lo mismo: hasta ahora no se
 * contaba **nada**, y la primera noticia de que te habías quedado sin crédito era un error del
 * proveedor a mitad de tarea. `foco` decide qué se enseña arriba — el dinero o el trabajo.
 *
 * El coste es **estimado**: sale de una tabla de precios que se mantiene a mano. Un modelo sin
 * tarifa conocida no inventa una; enseña sus tokens y se avisa de que el total es un mínimo.
 */
export default function UsoSection({ foco }: { foco: 'billing' | 'stats' }): JSX.Element {
  const [r, setR] = useState<ResumenUso | null>(null)
  const [dias, setDias] = useState<number>(30)
  const [limite, setLimite] = useState(0)
  const [editandoLimite, setEditandoLimite] = useState('')
  const [error, setError] = useState('')

  const leer = useCallback(async (d: number): Promise<void> => {
    try {
      setR(await titanioTab.usageSummary(d))
      const l = await titanioTab.usageLimit()
      setLimite(l)
      setEditandoLimite(l ? String(l) : '')
      setError('')
    } catch (e) {
      console.error('[uso] no se pudo leer el consumo:', e)
      setError('No se pudo cargar el consumo. Reinicia Titanio e inténtalo de nuevo.')
    }
  }, [])
  useEffect(() => { void leer(dias) }, [leer, dias])
  // El resumen cambia solo con cada turno del agente: si no se escuchara, esta pantalla se
  // quedaría con el número de cuando la abriste mientras el agente sigue trabajando.
  useEffect(() => titanioTab.onUsageChanged(setR), [])

  const guardarLimite = async (): Promise<void> => {
    const v = Number(editandoLimite.replace(',', '.'))
    const l = await titanioTab.usageLimit(Number.isFinite(v) && v > 0 ? v : 0)
    setLimite(l)
    setEditandoLimite(l ? String(l) : '')
  }

  const vacio = !r || r.turnos === 0

  return (
    <div>
      <SettingsHeader
        title={foco === 'billing' ? 'Billing' : 'Statistics'}
        description={foco === 'billing' ? 'Gasto estimado de tus proveedores de IA.' : 'Uso del agente por fecha y modelo.'}
        actions={
        <div className="flex items-center gap-1 shrink-0 p-0.5 rounded-xl bg-white/[0.05]">
          {RANGOS.map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={'h-7 px-2.5 rounded-lg text-[12.5px] transition-colors ' +
                (dias === d ? 'bg-white/[0.14] text-text' : 'text-text-dim hover:text-text')}
            >
              {d}d
            </button>
          ))}
        </div>
        }
      />

      {error && <div className="mb-5 text-[12.5px] text-amber-400">{error}</div>}

      {vacio ? (
        <div className="py-16 flex flex-col items-center gap-2 text-center">
          <IconChart className="w-6 h-6 text-text-faint" />
          <div className="text-[13.5px] text-text-dim">Sin consumo registrado en este período</div>
        </div>
      ) : (
        <>
          <Card>
            <div className="flex divide-x divide-white/[0.05]">
              {foco === 'billing' ? (
                <>
                  <Dato valor={dinero(r!.coste)} label={`Gasto estimado · ${dias} días`} />
                  <Dato valor={dinero(r!.gastoHoy)} label="Hoy" />
                  <Dato valor={num(r!.inputTokens + r!.outputTokens)} label="Tokens" />
                </>
              ) : (
                <>
                  <Dato valor={num(r!.turnos)} label="Turnos" />
                  <Dato valor={num(r!.pasos)} label="Acciones en páginas" />
                  <Dato valor={num(r!.fallidos)} label="Turnos con error" />
                </>
              )}
            </div>
            <Barras r={r!} />
          </Card>

          {r!.hayModelosSinPrecio && (
            <div className="mt-3 flex items-start gap-2 text-[12.5px] text-text-faint">
              <IconAlert className="w-4 h-4 shrink-0 mt-px text-amber-400" />
              <span>
                La estimación excluye los modelos sin tarifa disponible. Sus tokens sí están incluidos.
              </span>
            </div>
          )}

          <section className="mt-9">
            <h2 className="text-[13px] font-medium text-text-faint mb-3">Por modelo</h2>
            <Card>
              {r!.porModelo.map((m) => (
                <div key={m.model} className="flex items-center gap-3.5 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] text-text truncate">{m.model}</div>
                    <div className="text-[12.5px] text-text-dim mt-0.5">
                      {num(m.turnos)} {m.turnos === 1 ? 'turno' : 'turnos'} · {num(m.inputTokens + m.outputTokens)} tokens
                    </div>
                  </div>
                  <div className="text-[13.5px] tabular-nums shrink-0 text-text-dim">
                    {m.conPrecio ? dinero(m.coste) : <span className="text-text-faint">sin tarifa</span>}
                  </div>
                </div>
              ))}
            </Card>
          </section>
        </>
      )}

      {foco === 'billing' && (
        <section className="mt-9">
          <h2 className="text-[13px] font-medium text-text-faint mb-3">Límite de gasto</h2>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-4">
            <p className="text-[13px] text-text-dim mb-3 leading-relaxed">
              Al alcanzar el límite diario estimado, el agente no inicia nuevos turnos.
              El turno en curso puede superar el límite.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[14px] text-text-dim">$</span>
              <input
                value={editandoLimite}
                onChange={(e) => setEditandoLimite(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void guardarLimite() }}
                placeholder="sin límite"
                inputMode="decimal"
                className="w-28 h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[13.5px] text-text outline-none focus:border-white/30 select-text"
              />
              <span className="text-[13px] text-text-dim">al día</span>
              <button onClick={() => void guardarLimite()} className="h-9 px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-[12.5px] text-text transition-colors">
                Guardar
              </button>
            </div>
            {limite > 0 && (
              <p className="text-[12.5px] text-text-faint mt-3">
                Hoy llevas {dinero(r?.gastoHoy ?? 0)} de {dinero(limite)}.
              </p>
            )}
          </div>
        </section>
      )}

      {!vacio && (
        <button
          onClick={async () => setR(await titanioTab.usageClear())}
          className="mt-9 h-8 px-3 rounded-lg text-[12.5px] text-text-faint hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Borrar el historial de consumo
        </button>
      )}
    </div>
  )
}
