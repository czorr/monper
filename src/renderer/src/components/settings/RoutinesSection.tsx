import { useEffect, useState, type JSX } from 'react'
import type { Routine } from '@shared/types'
import IconPlus from '~icons/tabler/plus'
import IconTrash from '~icons/tabler/trash'
import IconRefresh from '~icons/tabler/refresh'
import IconAlert from '~icons/tabler/alert-triangle'

const { titanioTab } = window

const PRESETS = [
  { label: 'Cada 15 min', minutes: 15 },
  { label: 'Cada hora', minutes: 60 },
  { label: 'Cada 6 horas', minutes: 360 },
  { label: 'Una vez al día', minutes: 1440 }
]

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      onClick={() => onChange(!on)}
      className={'w-9 h-5 rounded-full shrink-0 relative transition-colors ' + (on ? 'bg-emerald-500/90' : 'bg-white/15')}
    >
      <span className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ' + (on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

function ago(ts: number): string {
  if (!ts) return 'nunca'
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'hace un momento'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`
}

function Row({ r }: { r: Routine }): JSX.Element {
  return (
    <div className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] text-text truncate">{r.name}</span>
          {r.lastError && <IconAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
        </div>
        <div className="text-[12.5px] text-text-faint truncate">
          {r.lastValue ? `Ahora: ${r.lastValue}` : 'Sin lectura todavía'}
          <span> · revisado {ago(r.lastRun)}</span>
          {r.lastError && <span className="text-amber-400/80"> · {r.lastError}</span>}
        </div>
      </div>
      <button
        onClick={() => titanioTab.runRoutine(r.id)}
        title="Revisar ahora"
        className="w-8 h-8 grid place-items-center rounded-lg text-text-faint hover:text-text hover:bg-white/[0.08] opacity-0 group-hover:opacity-100 [&>svg]:w-4 [&>svg]:h-4"
      >
        <IconRefresh />
      </button>
      <button
        onClick={() => titanioTab.removeRoutine(r.id)}
        title="Eliminar"
        className="w-8 h-8 grid place-items-center rounded-lg text-text-faint hover:text-red-400 hover:bg-white/[0.08] opacity-0 group-hover:opacity-100 [&>svg]:w-4 [&>svg]:h-4"
      >
        <IconTrash />
      </button>
      <Toggle on={r.enabled} onChange={(v) => titanioTab.toggleRoutine(r.id, v)} />
    </div>
  )
}

export default function RoutinesSection(): JSX.Element {
  const [list, setList] = useState<Routine[]>([])
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [url, setUrl] = useState('')
  const [request, setRequest] = useState('')
  const [minutes, setMinutes] = useState(60)

  useEffect(() => { titanioTab.listRoutines().then(setList); return titanioTab.onRoutines(setList) }, [])

  const create = async (): Promise<void> => {
    setBusy(true); setError('')
    const r = await titanioTab.createRoutine({ url: url.trim(), request: request.trim(), minutes })
    setBusy(false)
    if (!r.ok) { setError(r.error || 'No se pudo crear.'); return }
    setCreating(false); setUrl(''); setRequest('')
  }

  const input = 'w-full h-11 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[14px] text-text outline-none focus:border-white/25 placeholder:text-text-faint transition-colors'

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-[30px] font-semibold tracking-tight">Rutinas</h1>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-white/[0.08] hover:bg-white/[0.13] text-[13.5px] [&>svg]:w-4 [&>svg]:h-4"
          >
            <IconPlus /> Nueva
          </button>
        )}
      </div>
      <p className="text-[13.5px] text-text-dim leading-relaxed mb-7">
        Titanio revisa una página cada cierto tiempo y te avisa cuando pasa lo que le pidas.
        Usa tu sesión iniciada, así que funciona también en páginas privadas.
      </p>

      {creating && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-3 mb-6">
          <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Página a vigilar (https://…)" />
          <input
            className={input}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Avísame cuando… (p. ej. el precio baje de 8000)"
          />
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.minutes}
                onClick={() => setMinutes(p.minutes)}
                className={'px-3 h-8 rounded-lg text-[12.5px] transition-colors ' + (minutes === p.minutes ? 'bg-white/[0.16] text-text' : 'bg-white/[0.04] text-text-dim hover:bg-white/[0.08]')}
              >
                {p.label}
              </button>
            ))}
          </div>
          {error && <div className="text-[13px] text-red-400">{error}</div>}
          <div className="flex items-center gap-2">
            <button
              onClick={create}
              disabled={busy || !url.trim() || !request.trim()}
              className="px-4 h-10 rounded-xl bg-white/90 text-black text-[13.5px] font-medium hover:bg-white disabled:opacity-40"
            >
              {busy ? 'Analizando la página…' : 'Crear rutina'}
            </button>
            <button onClick={() => { setCreating(false); setError('') }} className="px-4 h-10 rounded-xl text-[13.5px] text-text-dim hover:text-text hover:bg-white/[0.06]">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {list.map((r) => <Row key={r.id} r={r} />)}
        {list.length === 0 && !creating && (
          <div className="text-[13.5px] text-text-faint py-10 text-center">
            Aún no tienes rutinas. Crea una con “Nueva”.
          </div>
        )}
      </div>
    </>
  )
}
