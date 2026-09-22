import { useEffect, useState, type JSX } from 'react'
import type { ProviderInfo, ProviderKind } from '@shared/types'
import IconPlus from '~icons/tabler/plus'
import IconX from '~icons/tabler/x'
import { Group, Card } from './ui'
import ProviderIcon from '@renderer/components/ui/ProviderIcon'

const { titanioTab } = window

const KIND_SHORT: Record<ProviderKind, string> = { anthropic: 'Claude', openai: 'OpenAI-compatible' }

export default function ProvidersSection(): JSX.Element {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [adding, setAdding] = useState(false)

  useEffect(() => { titanioTab.listProviders().then(setProviders) }, [])

  const remove = async (id: string): Promise<void> => setProviders(await titanioTab.removeProvider(id))
  const activate = async (id: string): Promise<void> => setProviders(await titanioTab.setActiveProvider(id))

  return (
    <Group title="Providers">
      <Card>
        {providers.map((p) => (
          <div key={p.id} className="group flex items-center gap-3.5 px-4 py-3.5">
            <span className="w-9 h-9 rounded-xl grid place-items-center bg-white/[0.06] text-text-dim shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px]">
              <ProviderIcon kind={p.kind} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-text leading-tight">{p.label}</div>
              <div className="text-[12.5px] text-text-dim mt-0.5 truncate">
                {KIND_SHORT[p.kind]}{p.baseUrl ? ` · ${p.baseUrl.replace(/^https?:\/\//, '')}` : ' · API key'}
              </div>
            </div>
            {!p.hasKey && <span className="text-[11px] text-amber-400 mr-1">sin clave</span>}
            <button
              onClick={() => remove(p.id)}
              className="w-7 h-7 grid place-items-center rounded-lg text-text-faint opacity-0 group-hover:opacity-100 hover:bg-white/[0.08] hover:text-red-400 transition [&>svg]:w-4 [&>svg]:h-4"
              title="Quitar"
            >
              <IconX />
            </button>
            <button
              onClick={() => activate(p.id)}
              title={p.active ? 'Proveedor activo' : 'Usar este proveedor'}
              className={'w-[18px] h-[18px] rounded-full border shrink-0 grid place-items-center transition-colors ' + (p.active ? 'border-white' : 'border-white/25 hover:border-white/50')}
            >
              {p.active && <span className="w-[9px] h-[9px] rounded-full bg-white" />}
            </button>
          </div>
        ))}

        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-2.5 w-full px-4 py-3.5 text-[14px] text-text-dim hover:text-text hover:bg-white/[0.02] transition-colors [&>svg]:w-[18px] [&>svg]:h-[18px]"
        >
          <span className="w-9 h-9 rounded-xl grid place-items-center text-text-faint shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px]"><IconPlus /></span>
          Connect
        </button>
      </Card>

      {adding && <ConnectForm onDone={(next) => { setProviders(next); setAdding(false) }} />}
    </Group>
  )
}

function ConnectForm({ onDone }: { onDone: (next: ProviderInfo[]) => void }): JSX.Element {
  const [kind, setKind] = useState<ProviderKind>('anthropic')
  const [label, setLabel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (!apiKey.trim() || busy) return
    setBusy(true)
    try {
      const next = await titanioTab.addProvider({ label, kind, baseUrl: baseUrl.trim() || undefined }, apiKey.trim())
      onDone(Array.isArray(next) ? next : [])
      // Se le pregunta al proveedor qué modelos tiene, para no depender de la lista de fábrica.
      void titanioTab.refreshModels()
    } catch (err) {
      console.error('addProvider error:', err)
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full h-10 px-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13.5px] text-text outline-none focus:border-white/25 placeholder:text-text-faint transition-colors'

  return (
    <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 flex flex-col gap-3">
      {/* selector de tipo segmentado */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] w-fit">
        {(['anthropic', 'openai'] as ProviderKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={'flex items-center gap-2 px-3.5 h-8 rounded-lg text-[13px] transition-colors [&>svg]:w-4 [&>svg]:h-4 ' + (kind === k ? 'bg-white/[0.10] text-text' : 'text-text-dim hover:text-text')}
          >
            <ProviderIcon kind={k} />
            {k === 'anthropic' ? 'Claude' : 'OpenAI'}
          </button>
        ))}
      </div>

      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nombre (opcional)" className={field} />
      {/* La URL es OPCIONAL y se dice: sin ella va a la API de OpenAI. Antes el campo salía a
          secas y parecía obligatorio, así que conectar OpenAI a pelo parecía imposible. */}
      {kind === 'openai' && (
        <div>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" className={field} />
          <p className="mt-1.5 px-1 text-[12px] text-text-faint">
            Opcional para OpenAI. Para otros servicios compatibles, introduce su URL de API.
          </p>
        </div>
      )}
      <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" className={field} />

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={submit}
          disabled={!apiKey.trim() || busy}
          className="text-[13.5px] font-medium px-4 h-10 rounded-xl bg-white/90 text-black hover:bg-white disabled:opacity-40 disabled:bg-white/20 disabled:text-text transition-colors"
        >
          {busy ? 'Conectando…' : 'Connect'}
        </button>
      </div>
    </div>
  )
}
