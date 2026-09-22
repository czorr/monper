import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useEffect, useState, type JSX } from 'react'
import type { ModelOption, ProviderInfo, ProviderKind, ProviderSettings } from '@shared/types'
import IconPlus from '~icons/tabler/plus'
import IconArrowLeft from '~icons/tabler/arrow-left'
import IconCode from '~icons/tabler/code'
import { Button } from './ui'
import ProviderIcon from '@renderer/components/ui/ProviderIcon'

const { titanioTab } = window
const field = 'w-full h-11 px-3 rounded-xl bg-white/[0.04] border border-white/[0.09] text-[13px] text-text outline-none focus:border-text-dim placeholder:text-text-faint transition-colors'
const presets: { name: string; kind: ProviderKind; url?: string; description: string }[] = [
  { name: 'Anthropic', kind: 'anthropic', description: 'Claude' },
  { name: 'OpenAI', kind: 'openai', description: 'GPT' },
  { name: 'OpenRouter', kind: 'openai', url: 'https://openrouter.ai/api/v1', description: 'OpenAI-compatible' },
  { name: 'Personalizado', kind: 'openai', url: '', description: 'Azure · vLLM · …' }
]

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : tr('No se pudo guardar la conexión.')
}

export default function ProvidersSection(): JSX.Element {
  useLocale()
  const [state, setState] = useState<ProviderSettings | null>(null)
  const [editor, setEditor] = useState<{ provider?: ProviderInfo; revision: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    const load = (): void => { void titanioTab.providerSettings().then((next) => { if (live) setState(next) }).catch((e) => { if (live) setError(errorText(e)) }) }
    load()
    // También detecta guardados del editor externo mientras Ajustes sigue en primer plano.
    const timer = window.setInterval(load, 1500)
    return () => { live = false; window.clearInterval(timer) }
  }, [])

  if (editor) return <ConnectionEditor initial={editor.provider} revision={editor.revision} onBack={() => setEditor(null)} onSaved={(next) => { setState(next); setEditor(null) }} />

  return (
    <section className="mb-9">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[18px] font-medium tracking-tight">{tr('Conexiones de IA')}</h2>
          <p className="text-[13px] text-text-dim mt-1.5 leading-relaxed">{tr('Tus proveedores, tus modelos. Configúralos aquí o en titanio.jsonc.')}</p>
        </div>
        <Button variant="secondary" size="md" className="min-h-10 shrink-0" disabled={!state || !!state.error} onClick={() => { setError(''); setEditor({ revision: state!.revision }) }}>
          <IconPlus className="w-4 h-4" /> {tr('Añadir conexión')}
        </Button>
      </div>
      {(error || state?.error) && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-[13px] text-red-400">{error || state?.error}</p>}
      {!state ? <p role="status" className="py-8 text-text-dim">{tr('Cargando conexiones…')}</p> : state.providers.length === 0 ? (
        <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-8 text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-white/[0.05] grid place-items-center"><IconPlus className="w-5 h-5 text-text-dim" /></div>
          <h3 className="text-[15px] font-medium">{tr('Elige qué IA trabaja contigo')}</h3>
          <p className="text-[13px] text-text-dim mt-2 max-w-sm mx-auto leading-relaxed">{tr('Conecta una cuenta con su API key o utiliza tu propio endpoint.')}</p>
        </div>
      ) : <div className="space-y-3">{state.providers.map((p) => (
        <button key={p.id} type="button" disabled={!!state.error} onClick={() => setEditor({ provider: p, revision: state.revision })}
          className="w-full text-left rounded-2xl p-4 flex items-center gap-4 bg-white/[0.025] border border-white/[0.07] hover:bg-white/[0.055] focus-visible:outline-2 focus-visible:outline-text-dim transition-colors disabled:opacity-50">
          <span className="w-11 h-11 rounded-xl bg-white/[0.05] grid place-items-center shrink-0"><ProviderIcon provider={p} /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[14px] font-medium">{p.label}{p.active && <span className="text-[10px] font-normal text-text-dim rounded-full bg-white/[0.07] px-2 py-0.5">{tr('Proveedor activo')}</span>}</span>
            <span className="block truncate text-[12px] text-text-faint mt-1">{p.baseUrl || (p.kind === 'anthropic' ? 'api.anthropic.com' : 'api.openai.com')}</span>
            <span className={'block text-[12px] mt-2 ' + (p.hasKey ? 'text-text-dim' : 'text-amber-400')}>{p.hasKey ? tr('Credenciales configuradas') : tr('Credenciales pendientes')}{!!p.models?.length && ` · ${tr('{0} modelos definidos', p.models.length)}`}</span>
          </span>
          <span className="text-[12px] text-text-dim">{tr('Editar conexión')}</span>
        </button>
      ))}</div>}
      <div className="mt-5 flex items-start gap-3 rounded-xl bg-white/[0.025] p-4">
        <IconCode className="w-5 h-5 text-text-faint shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1"><p className="text-[13px]">titanio.jsonc</p><p className="text-[12px] text-text-dim mt-1">{tr('Los cambios se sincronizan automáticamente.')}</p><p className="text-[11px] text-text-faint break-all mt-1 font-mono">{state?.path}</p></div>
        <Button variant="secondary" size="md" className="min-h-10" onClick={() => { void titanioTab.openProviderConfig().catch((e) => setError(errorText(e))) }}>{tr('Abrir archivo')}</Button>
      </div>
    </section>
  )
}

function ConnectionEditor({ initial, revision, onBack, onSaved }: { initial?: ProviderInfo; revision: string; onBack: () => void; onSaved: (state: ProviderSettings) => void }): JSX.Element {
  useLocale()
  const [chosen, setChosen] = useState(!!initial)
  const [kind, setKind] = useState<ProviderKind>(initial?.kind || 'anthropic')
  const [label, setLabel] = useState(initial?.label || '')
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl || '')
  const [apiKey, setApiKey] = useState('')
  const [source, setSource] = useState(initial?.keySource === 'env' ? 'env' : 'vault')
  const [envVar, setEnvVar] = useState(initial?.envVar || '')
  const [models, setModels] = useState<ModelOption[]>(initial?.models || [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [discovered, setDiscovered] = useState<ModelOption[]>([])

  const save = async (): Promise<void> => {
    setBusy(true); setError('')
    try {
      onSaved(await titanioTab.saveProvider({ id: initial?.id, label, kind, baseUrl, models, envVar: source === 'env' ? envVar : undefined }, source === 'vault' ? apiKey : '', revision))
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const discover = async (): Promise<void> => {
    if (!initial) return
    setBusy(true); setError(''); setNotice('')
    try {
      const next = await titanioTab.discoverProvider(initial.id)
      setDiscovered(next)
      setNotice(next.length ? tr('{0} modelos disponibles. Selecciona los que quieras añadir.', next.length) : tr('El endpoint no devolvió modelos. Puedes añadir sus IDs manualmente.'))
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  return (
    <section className="mb-9">
      <Button className="min-h-10 flex items-center gap-2 text-[13px] text-text-dim mb-4" onClick={onBack} disabled={busy}><IconArrowLeft className="w-4 h-4" />{tr('Conexiones de IA')}</Button>
      <h2 className="text-[22px] font-medium tracking-tight">{initial ? tr('Editar conexión') : tr('Añadir conexión')}</h2>
      <p className="mt-2 mb-6 text-[13px] text-text-dim">{tr('La conexión y sus modelos se guardan en titanio.jsonc.')}</p>
      {!chosen ? <div className="grid grid-cols-2 gap-3">{presets.map((p) => (
        <Button key={p.name} className="text-left flex flex-col items-start gap-3 p-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.06] transition-colors" onClick={() => { setLabel(p.name === 'Personalizado' ? '' : p.name); setKind(p.kind); setBaseUrl(p.url || ''); setChosen(true) }}>
          <span className="w-10 h-10 rounded-xl bg-white/[0.05] grid place-items-center"><ProviderIcon provider={p.name === 'Personalizado' ? undefined : { label: p.name, kind: p.kind, baseUrl: p.url }} /></span>
          <span className="text-[14px] font-medium">{p.name === 'Personalizado' ? tr('Endpoint personalizado') : p.name}</span>
          <span className="text-[12px] text-text-dim">{p.description}</span>
        </Button>
      ))}</div> : <form onSubmit={(e) => { e.preventDefault(); void save() }} className="space-y-6">
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          <label className="block text-[13px] space-y-2"><span>{tr('Nombre de la conexión')}</span><input autoFocus required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Titanio AI" className={field} /></label>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <label className="block text-[13px] space-y-2"><span>{tr('Protocolo')}</span><select value={kind} onChange={(e) => setKind(e.target.value as ProviderKind)} className={field}><option value="anthropic">Anthropic</option><option value="openai">OpenAI-compatible</option></select></label>
            <label className="block text-[13px] space-y-2"><span>{tr('URL de la API')}</span><input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={kind === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'} className={field} /></label>
          </div>
          <p className="text-[12px] text-text-faint">{tr('Sin URL se utiliza la API oficial del protocolo elegido.')}</p>
          <div className="pt-2">
            <label className="block text-[13px] space-y-2"><span>{tr('Credenciales')}</span><select value={source} onChange={(e) => { setSource(e.target.value); setApiKey('') }} className={field}><option value="vault">{tr('API key · Vault cifrado')}</option><option value="env">{tr('Variable de entorno')}</option></select></label>
            {source === 'env' ? <label className="block mt-3 text-[12px] text-text-dim space-y-2"><span>{tr('Nombre de la variable')}</span><input required pattern="[A-Za-z_][A-Za-z0-9_]*" value={envVar} onChange={(e) => setEnvVar(e.target.value)} placeholder="TITANIO_API_KEY" className={field} /></label> : <label className="block mt-3 text-[12px] text-text-dim space-y-2"><span>{initial?.hasKey && initial.keySource === 'vault' ? tr('Deja vacío para conservar la clave actual.') : tr('La clave se guarda cifrada, no en el archivo.')}</span><input type="password" autoComplete="new-password" required={!initial?.hasKey || initial.keySource !== 'vault'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" className={field} /></label>}
            {source === 'env' && <p className="mt-2 text-[12px] text-text-faint">{tr('Debe estar disponible en el entorno que inicia Titanio.')}</p>}
          </div>
          <div className="pt-4 border-t border-white/[0.07]">
            <div className="flex items-center justify-between gap-3"><h3 className="text-[14px] font-medium">{tr('Modelos de esta conexión')}</h3>{initial && <Button type="button" variant="secondary" size="sm" className="min-h-10" disabled={busy || !initial.hasKey || baseUrl !== (initial.baseUrl || '') || kind !== initial.kind || !!apiKey || source !== (initial.keySource === 'env' ? 'env' : 'vault') || envVar !== (initial.envVar || '')} onClick={() => void discover()}>{tr('Buscar modelos')}</Button>}</div>
            <p className="text-[12px] text-text-dim mt-2 mb-3 leading-relaxed">{tr('Añade IDs para elegir tus modelos. Sin una lista propia, se utiliza el catálogo del proveedor.')}</p>
            {!initial && <p className="text-[12px] text-text-faint mb-3">{tr('Guarda la conexión para buscar modelos en su endpoint.')}</p>}
            {models.length > 0 && <div className="grid grid-cols-[1fr_1fr_40px] gap-2 text-[11px] text-text-faint mb-2"><span>{tr('ID del modelo')}</span><span>{tr('Nombre visible')}</span></div>}
            {models.map((m, i) => <div key={i} className="grid grid-cols-[1fr_1fr_40px] gap-2 mb-2"><input required aria-label={`${tr('ID del modelo')} ${i + 1}`} value={m.id} onChange={(e) => setModels(models.map((v, n) => n === i ? { ...v, id: e.target.value } : v))} className={field} placeholder="gemma-4-26b-a4b-it" /><input aria-label={`${tr('Nombre visible')} ${i + 1}`} value={m.name} onChange={(e) => setModels(models.map((v, n) => n === i ? { ...v, name: e.target.value } : v))} className={field} placeholder="Gemma" /><Button type="button" aria-label={`${tr('Quitar')} ${m.id || i + 1}`} className="min-h-10 text-text-dim hover:text-red-400" onClick={() => setModels(models.filter((_, n) => n !== i))}>×</Button></div>)}
            <Button type="button" className="min-h-10 text-[13px] text-text-dim flex items-center gap-2" onClick={() => setModels([...models, { id: '', name: '' }])}><IconPlus className="w-4 h-4" />{tr('Añadir modelo')}</Button>
            {notice && <p role="status" className="text-[12px] text-text-dim my-3">{notice}</p>}
            {discovered.length > 0 && <div className="max-h-52 overflow-y-auto rounded-xl border border-white/[0.07]">{discovered.map((m) => <Button key={m.id} type="button" disabled={models.some((v) => v.id === m.id)} className="min-h-10 w-full text-left px-3 text-[12px] text-text-dim hover:bg-white/[0.05] disabled:opacity-40 break-all" onClick={() => setModels([...models, m])}>{m.id}</Button>)}</div>}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-[13px] rounded-xl p-3 bg-red-500/10 text-red-400">{error}</p>}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/[0.07]">
          <div>{initial && <Button type="button" className="min-h-10 text-[12px] text-red-400" disabled={busy} onClick={() => setDeleting(!deleting)}>{tr('Eliminar conexión')}</Button>}</div>
          <div className="flex gap-2"><Button type="button" variant="secondary" size="md" className="min-h-10" disabled={busy} onClick={onBack}>{tr('Cancelar')}</Button><Button type="submit" variant="primary" size="md" className="min-h-10" disabled={busy}>{busy ? tr('Guardando…') : tr('Guardar conexión')}</Button></div>
        </div>
        {deleting && initial && <div className="rounded-xl bg-red-500/5 p-4 text-[13px]"><p>{tr('Se eliminará esta conexión de titanio.jsonc. Su clave seguirá en el Vault.')}</p><Button type="button" className="min-h-10 text-red-400 mt-2" disabled={busy} onClick={() => { setBusy(true); void titanioTab.deleteProvider(initial.id, revision).then(onSaved).catch((e) => setError(errorText(e))).finally(() => setBusy(false)) }}>{tr('Confirmar eliminación')}</Button></div>}
      </form>}
    </section>
  )
}
