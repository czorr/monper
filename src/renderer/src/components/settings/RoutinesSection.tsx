import { useEffect, useState, type JSX } from 'react'
import type { Routine } from '@shared/types'
import IconPlus from '~icons/tabler/plus'
import IconTrash from '~icons/tabler/trash'
import IconRefresh from '~icons/tabler/refresh'
import IconAlert from '~icons/tabler/alert-triangle'
import { SettingsHeader, Button, Toggle } from './ui'

const { titanioTab } = window

const PRESETS = [
  { label: 'Cada 15 min', minutes: 15 },
  { label: 'Cada hora', minutes: 60 },
  { label: 'Cada 6 horas', minutes: 360 },
  { label: 'Una vez al día', minutes: 1440 }
]

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
      <Button
        onClick={() => titanioTab.runRoutine(r.id)}
        title="Revisar ahora"
        className="w-8 h-8 grid place-items-center rounded-lg text-text-faint hover:text-text hover:bg-white/[0.08] opacity-0 group-hover:opacity-100 [&>svg]:w-4 [&>svg]:h-4"
      >
        <IconRefresh />
      </Button>
      <Button
        onClick={() => titanioTab.removeRoutine(r.id)}
        title="Eliminar"
        className="w-8 h-8 grid place-items-center rounded-lg text-text-faint hover:text-red-400 hover:bg-white/[0.08] opacity-0 group-hover:opacity-100 [&>svg]:w-4 [&>svg]:h-4"
      >
        <IconTrash />
      </Button>
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
      <SettingsHeader
        title="Rutinas"
        description="Programa revisiones de una página y recibe un aviso cuando se cumpla tu condición. Titanio usa tu sesión iniciada."
        actions={!creating && (
          <Button variant="secondary" size="sm"
            onClick={() => setCreating(true)}
          >
            <IconPlus /> Nueva
          </Button>
        )}
      />

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
              <Button
                key={p.minutes}
                onClick={() => setMinutes(p.minutes)}
                className={'px-3 h-8 rounded-lg text-[12.5px] transition-colors ' + (minutes === p.minutes ? 'bg-white/[0.16] text-text' : 'bg-white/[0.04] text-text-dim hover:bg-white/[0.08]')}
              >
                {p.label}
              </Button>
            ))}
          </div>
          {error && <div className="text-[13px] text-red-400">{error}</div>}
          <div className="flex items-center gap-2">
            <Button variant="primary" size="md"
              onClick={create}
              disabled={busy || !url.trim() || !request.trim()}
            >
              {busy ? 'Analizando la página…' : 'Crear rutina'}
            </Button>
            <Button variant="ghost" size="md" onClick={() => { setCreating(false); setError('') }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {list.map((r) => <Row key={r.id} r={r} />)}
        {list.length === 0 && !creating && (
          <div className="text-[13.5px] text-text-faint py-10 text-center">
            No hay rutinas guardadas.
          </div>
        )}
      </div>
    </>
  )
}
