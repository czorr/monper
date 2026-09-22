import { useEffect, useRef, useState, type JSX } from 'react'
import { t as tr, useLocale } from '@renderer/lib/i18n'
import { Avatar, Select } from '@renderer/components/ui'
import { PROFILE_ICONS, SEARCH_ENGINES, type BrowserProfile, type ProfilePreferences, type ProfileSettings } from '@shared/profiles'
import type { ModelOption } from '@shared/types'
import IconPlus from '~icons/tabler/plus'
import IconCamera from '~icons/tabler/camera'
import { SettingsHeader, Button } from './ui'

const api = window.titanioTab
const field = 'w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-text outline-none focus:border-text-dim transition-colors'
const colors = ['#64748b', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#d97706', '#059669', '#0891b2']
const themes = [null, '#164e63', '#14532d', '#7c2d12', '#4c1d95']

function initials(name: string): string { return name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || '?' }
function errorText(error: unknown): string { return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : tr('No se pudieron guardar los cambios.') }

async function avatarFrom(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 10_000_000) throw new Error(tr('Elige una imagen de menos de 10 MB.'))
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const context = canvas.getContext('2d')
    if (!context) throw new Error(tr('No se pudo usar esa imagen.'))
    const scale = Math.max(256 / image.width, 256 / image.height)
    context.drawImage(image, (256 - image.width * scale) / 2, (256 - image.height * scale) / 2, image.width * scale, image.height * scale)
    return canvas.toDataURL('image/png')
  } finally { URL.revokeObjectURL(url) }
}

export default function ProfilesSection({ onNavigate }: { onNavigate: (section: 'appearance' | 'skills' | 'mcps' | 'ai') => void }): JSX.Element {
  useLocale()
  const [state, setState] = useState<ProfileSettings | null>(null)
  const [draft, setDraft] = useState<BrowserProfile | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    Promise.all([api.profilesSettings(), api.profileModels()]).then(([next, choices]) => {
      if (!live) return
      setState(next); setDraft(next.profiles.find((p) => p.id === next.activeId) || next.profiles[0]); setModels(choices)
    }).catch((e) => { if (live) setError(errorText(e)) })
    return () => { live = false }
  }, [])

  const original = state?.profiles.find((p) => p.id === draft?.id)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original ?? null)
  const active = draft?.id === state?.activeId
  const prefs = draft?.preferences
  const update = (patch: Partial<ProfilePreferences>): void => {
    if (draft) { setDraft({ ...draft, preferences: { ...draft.preferences, ...patch } }); setNotice('') }
  }
  const updateAgent = (patch: Partial<ProfilePreferences['agent']>): void => {
    if (prefs) update({ agent: { ...prefs.agent, ...patch } })
  }
  const accept = (next: ProfileSettings, selected = draft?.id): void => {
    setState(next); setDraft(next.profiles.find((p) => p.id === selected) || next.profiles.find((p) => p.id === next.activeId)!); setConfirmDelete(false)
  }
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const modelValue = prefs?.agent.defaultModel ? JSON.stringify([prefs.agent.defaultModel.providerId, prefs.agent.defaultModel.id]) : ''

  return <>
    <SettingsHeader title={tr('Profiles')} description={tr('Un espacio propio para cada forma de trabajar.')} actions={
      <Button variant="secondary" size="md" disabled={busy || dirty} onClick={() => setCreating(!creating)}><IconPlus />{tr('Nuevo perfil')}</Button>
    } />
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-[13px] text-red-400">{error}</p>}
    {creating && <form className="flex gap-2 mb-5" onSubmit={(e) => { e.preventDefault(); void run(async () => { const next = await api.createBrowserProfile(name); accept(next, next.createdId); setName(''); setCreating(false) }) }}>
      <input autoFocus required maxLength={60} aria-label={tr('Nombre del perfil')} placeholder={tr('Nombre del perfil')} value={name} onChange={(e) => setName(e.target.value)} className={field} />
      <Button type="submit" variant="primary" size="md" disabled={busy || !name.trim()}>{tr('Crear')}</Button>
      <Button variant="secondary" size="md" disabled={busy} onClick={() => setCreating(false)}>{tr('Cancelar')}</Button>
    </form>}
    {!state || !draft || !prefs ? <p role="status" className="text-text-dim">{tr('Cargando perfiles…')}</p> : <>
      <div className="flex flex-wrap gap-2 mb-7" aria-label={tr('Profiles')}>
        {state.profiles.map((p) => <Button key={p.id} disabled={busy || dirty} aria-pressed={p.id === draft.id}
          onClick={() => { setDraft(p); setConfirmDelete(false); setNotice(''); setError('') }}
          className={'flex items-center gap-2 px-3 min-h-11 rounded-xl border text-[13px] ' + (p.id === draft.id ? 'border-white/20 bg-white/[0.08]' : 'border-white/[0.06] hover:bg-white/[0.04]')}>
          <Avatar initials={initials(p.nombre)} src={p.avatar} color={p.preferences.color} icon={p.preferences.icon} size="sm" />
          {p.nombre}{p.id === state.activeId && <span className="text-[10px] text-text-faint">{tr('Activo')}</span>}
        </Button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void run(async () => { accept(await api.saveBrowserProfile(draft)); setNotice(tr('Perfil guardado.')) }) }}>
        <fieldset disabled={busy} className="space-y-7 disabled:opacity-60">
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-5">
            <div className="flex items-center gap-4">
              <Avatar initials={initials(draft.nombre)} src={draft.avatar} color={prefs.color} icon={prefs.icon} size="lg" />
              <div className="flex-1 min-w-0"><label className="block text-[12px] text-text-dim mb-2" htmlFor="profile-name">{tr('Nombre del perfil')}</label><input id="profile-name" required maxLength={60} value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} className={field} /></div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="md" onClick={() => fileRef.current?.click()}><IconCamera />{tr('Cambiar foto')}</Button>
              {draft.avatar && <Button variant="ghost" size="md" onClick={() => setDraft({ ...draft, avatar: null })}>{tr('Quitar foto')}</Button>}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void run(async () => { setDraft({ ...draft, avatar: await avatarFrom(file) }) }) }} />
            </div>
            <div><h3 className="text-[12px] text-text-dim mb-3">{tr('Color del perfil')}</h3><div className="flex flex-wrap gap-1">{colors.map((color) => <Button key={color} aria-label={color} aria-pressed={prefs.color === color} onClick={() => update({ color })} className={'w-10 h-10 rounded-full grid place-items-center border-2 ' + (prefs.color === color ? 'border-white/70' : 'border-transparent')}><span className="w-6 h-6 rounded-full" style={{ background: color }} /></Button>)}</div></div>
            <div><h3 className="text-[12px] text-text-dim mb-3">{tr('Icono del perfil')}</h3><div className="flex flex-wrap gap-2">{PROFILE_ICONS.map((icon) => <Button key={icon} aria-label={icon} aria-pressed={prefs.icon === icon} onClick={() => { setDraft({ ...draft, avatar: null, preferences: { ...prefs, icon } }) }} className={'w-11 h-11 rounded-xl grid place-items-center border ' + (prefs.icon === icon && !draft.avatar ? 'border-white/40 bg-white/[0.08]' : 'border-white/[0.06]')}><Avatar initials={initials(draft.nombre)} color={prefs.color} icon={icon} /></Button>)}</div></div>
            <div><h3 className="text-[12px] text-text-dim mb-3">{tr('Tema del espacio')}</h3><div className="flex gap-2">{themes.map((tint, i) => <Button key={tint || 'default'} aria-label={tr('Tema {0}', i + 1)} aria-pressed={prefs.tint === tint} onClick={() => update({ tint })} className={'h-11 flex-1 rounded-xl border-2 ' + (prefs.tint === tint ? 'border-white/60' : 'border-white/[0.08]')} style={{ background: tint || '#27272a' }} />)}</div></div>
          </section>
          <section className="space-y-4"><h3 className="text-[15px] font-medium">{tr('Navegación del perfil')}</h3>
            <label className="block text-[12px] space-y-2"><span>{tr('Página de inicio')}</span><input type="url" value={prefs.homePage} onChange={(e) => update({ homePage: e.target.value })} placeholder="https://…" className={field} /></label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-[12px] space-y-2"><span>{tr('Al iniciar Titanio')}</span><Select className="w-full" value={prefs.startup} onChange={(e) => update({ startup: e.target.value as ProfilePreferences['startup'] })}><option value="restore">{tr('Restaurar pestañas')}</option><option value="home">{tr('Abrir página de inicio')}</option></Select></label>
              <label className="block text-[12px] space-y-2"><span>{tr('Nueva pestaña')}</span><Select className="w-full" value={prefs.newTab} onChange={(e) => update({ newTab: e.target.value as ProfilePreferences['newTab'] })}><option value="titanio">Titanio</option><option value="home">{tr('Página de inicio')}</option></Select></label>
            </div>
            <label className="block text-[12px] space-y-2"><span>{tr('Buscador')}</span><Select className="w-full" value={prefs.searchEngine} onChange={(e) => update({ searchEngine: e.target.value as ProfilePreferences['searchEngine'] })}>{Object.entries(SEARCH_ENGINES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></label>
          </section>
          <section className="space-y-4 border-t border-white/[0.07] pt-6"><h3 className="text-[15px] font-medium">{tr('Agente de este perfil')}</h3>
            <label className="block text-[12px] space-y-2"><span>{tr('Modelo predeterminado')}</span><Select className="w-full" value={modelValue} onChange={(e) => { const value = e.target.value; if (!value) updateAgent({ defaultModel: null }); else { const [providerId, id] = JSON.parse(value) as string[]; updateAgent({ defaultModel: { providerId, id } }) } }}><option value="">{tr('Recordar el último modelo')}</option>{models.map((m) => <option key={`${m.providerId}:${m.id}`} value={JSON.stringify([m.providerId, m.id])}>{m.provider?.label || m.providerId} · {m.name}</option>)}{modelValue && !models.some((m) => JSON.stringify([m.providerId, m.id]) === modelValue) && <option value={modelValue}>{prefs.agent.defaultModel?.id} · {tr('No disponible')}</option>}</Select></label>
            <label className="block text-[12px] space-y-2"><span>{tr('Instrucciones del perfil')}</span><textarea rows={5} maxLength={20000} value={prefs.agent.instructions} onChange={(e) => updateAgent({ instructions: e.target.value })} placeholder={tr('Cómo debe trabajar el agente en este espacio…')} className={field + ' resize-y'} /></label>
            {(['browserTools', 'skills', 'mcp'] as const).map((key) => <label key={key} className="flex items-center gap-3 min-h-11 text-[13px]"><input type="checkbox" checked={prefs.agent[key]} onChange={(e) => updateAgent({ [key]: e.target.checked })} className="w-4 h-4 accent-white" />{key === 'browserTools' ? tr('Permitir controlar el navegador') : key === 'skills' ? tr('Usar skills de este perfil') : tr('Usar herramientas MCP de este perfil')}</label>)}
            {active && <div className="flex flex-wrap gap-2">{(['ai', 'skills', 'mcps', 'appearance'] as const).map((section) => <Button key={section} variant="secondary" size="sm" disabled={dirty} onClick={() => onNavigate(section)}>{section === 'ai' ? tr('Conexiones de IA') : section === 'skills' ? 'Skills' : section === 'mcps' ? 'MCPs' : tr('Appearance')}</Button>)}</div>}
            <p className="text-[12px] text-text-faint leading-relaxed">{tr('Las conexiones de IA y el Vault son compartidos. La selección de modelos, las skills activas y los servidores MCP pertenecen a cada perfil.')}</p>
          </section>
        </fieldset>
        <div className="sticky bottom-0 mt-6 rounded-xl bg-[#202024] border border-white/[0.08] px-4 py-3 flex items-center justify-between gap-3">
          <span role="status" className="text-[12px] text-text-dim">{notice || (dirty ? tr('Cambios sin guardar') : active ? tr('Perfil activo') : '')}</span>
          <div className="flex gap-2">{dirty && <Button variant="secondary" size="md" disabled={busy} onClick={() => { setDraft(original!); setError('') }}>{tr('Descartar')}</Button>}<Button type="submit" variant="primary" size="md" disabled={busy || !dirty}>{busy ? tr('Guardando…') : tr('Guardar')}</Button></div>
        </div>
      </form>
      {!active && <div className="mt-6 space-y-3">
        <p className="text-[12px] text-text-dim">{tr('Cambiar de perfil reinicia Titanio y carga las pestañas de ese perfil.')}</p>
        <Button variant="secondary" size="md" disabled={busy || dirty} onClick={() => void run(async () => { await api.switchBrowserProfile(draft.id) })}>{tr('Usar este perfil')}</Button>
        {draft.id !== 'default' && <Button className="min-h-10 px-3 text-[13px] text-red-400" disabled={busy || dirty} onClick={() => setConfirmDelete(!confirmDelete)}>{tr('Quitar perfil')}</Button>}
        {confirmDelete && <div className="rounded-xl border border-red-400/20 p-4 text-[13px]"><p>{tr('Deja de aparecer en la lista. Sus datos (historial, marcadores, sesión) se quedan en el disco.')}</p><Button variant="danger" size="md" className="mt-3" disabled={busy} onClick={() => void run(async () => { accept(await api.deleteBrowserProfile(draft.id), state.activeId) })}>{tr('Confirmar eliminación')}</Button></div>}
      </div>}
    </>}
  </>
}
