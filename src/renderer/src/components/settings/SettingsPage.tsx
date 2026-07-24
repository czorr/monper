import { useEffect, useRef, useState, type JSX } from 'react'
import type { Profile } from '@shared/types'
import { Avatar } from '@renderer/components/ui'
import IconSparkles from '~icons/tabler/sparkles'
import IconCamera from '~icons/tabler/camera'
import IconSettings from '~icons/tabler/settings'
import IconShield from '~icons/tabler/shield-lock'
import IconInfo from '~icons/tabler/info-circle'
import IconUser from '~icons/tabler/user'
import IconBolt from '~icons/tabler/bolt'
import ProvidersSection from './ProvidersSection'
import SkillsSection from './SkillsSection'
import { Card, Group, Row, Pill } from './ui'

const { monperTab } = window

type Cat = 'general' | 'account' | 'ai' | 'skills' | 'privacy' | 'about'

const NAV: { id: Cat; label: string; icon: JSX.Element }[] = [
  { id: 'general', label: 'General', icon: <IconSettings /> },
  { id: 'account', label: 'Account', icon: <IconUser /> },
  { id: 'ai', label: 'AI', icon: <IconSparkles /> },
  { id: 'skills', label: 'Skills', icon: <IconBolt /> },
  { id: 'privacy', label: 'Privacy', icon: <IconShield /> },
  { id: 'about', label: 'About', icon: <IconInfo /> }
]

const CATS: Cat[] = ['general', 'account', 'ai', 'skills', 'privacy', 'about']
function initialCat(): Cat {
  const h = window.location.hash.replace(/^#/, '') as Cat
  return CATS.includes(h) ? h : 'ai'
}

export default function SettingsPage(): JSX.Element {
  const [cat, setCat] = useState<Cat>(initialCat)

  return (
    <div className="h-full flex bg-bg text-text select-text">
      {/* Sub-nav de settings */}
      <nav className="w-[230px] shrink-0 border-r border-white/[0.06] px-3 py-6 overflow-y-auto [&::-webkit-scrollbar]:w-0">
        <div className="px-2 mb-2 text-[12px] font-medium text-text-faint">Settings</div>
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setCat(n.id)}
            className={
              'flex items-center gap-2.5 w-full h-9 px-2.5 rounded-lg text-[14px] text-left transition-colors [&>svg]:w-[18px] [&>svg]:h-[18px] ' +
              (cat === n.id ? 'bg-white/[0.08] text-text' : 'text-text-dim hover:bg-white/[0.04] hover:text-text')
            }
          >
            {n.icon}
            {n.label}
          </button>
        ))}
      </nav>

      {/* Contenido */}
      <main className="flex-1 overflow-hidden">
        {cat === 'skills' ? (
          <SkillsSection />
        ) : (
          <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:w-0">
            <div className="max-w-[680px] mx-auto px-8 py-12">
              {cat === 'ai' && <AIPage />}
              {cat === 'account' && <AccountPage />}
              {cat === 'general' && <GeneralPage />}
              {cat === 'privacy' && <PrivacyPage />}
              {cat === 'about' && <AboutPage />}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function AIPage(): JSX.Element {
  return (
    <>
      <h1 className="text-[30px] font-semibold tracking-tight mb-9">AI</h1>
      <ProvidersSection />
      <Group title="Chat settings">
        <Card>
          <Row label="Modelo por defecto" desc="El último proveedor usado se convierte en el default">
            <Pill>Proveedor activo</Pill>
          </Row>
          <Row label="Comportamiento de seguimiento" desc="Encolar mensajes mientras el agente corre, o corregir en caliente">
            <Pill>Queue ⌄</Pill>
          </Row>
        </Card>
      </Group>
    </>
  )
}

// Redimensiona una imagen a un cuadrado (cover) y devuelve un data URL JPEG.
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const S = 160
        const canvas = document.createElement('canvas')
        canvas.width = S; canvas.height = S
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('no ctx')); return }
        const scale = Math.max(S / img.width, S / img.height)
        const w = img.width * scale, h = img.height * scale
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

function AccountPage(): JSX.Element {
  const [profile, setProfile] = useState<Profile>({ name: '', initials: '?', avatar: null })
  const [name, setName] = useState('')
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { monperTab.getProfile().then((p) => { setProfile(p); setName(p.name) }) }, [])

  const dirty = !!name.trim() && name.trim() !== profile.name
  const save = async (): Promise<void> => {
    const p = await monperTab.setProfile(name.trim())
    setProfile(p); setName(p.name); setSaved(true); setTimeout(() => setSaved(false), 1500)
  }
  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { setProfile(await monperTab.setAvatar(await fileToAvatar(f))) } catch { /* noop */ }
  }
  const removeAvatar = async (): Promise<void> => setProfile(await monperTab.setAvatar(null))

  return (
    <>
      <h1 className="text-[30px] font-semibold tracking-tight mb-9">Account</h1>

      <div className="flex items-center gap-4 mb-8">
        <div className="relative group/av cursor-pointer" onClick={() => fileRef.current?.click()}>
          <Avatar initials={profile.initials} src={profile.avatar} size="lg" />
          <div className="absolute inset-0 rounded-full grid place-items-center bg-black/50 opacity-0 group-hover/av:opacity-100 transition-opacity [&>svg]:w-5 [&>svg]:h-5 [&>svg]:text-white">
            <IconCamera />
          </div>
        </div>
        <div>
          <div className="text-[16px] font-medium">{profile.name || '—'}</div>
          <div className="flex items-center gap-3 mt-1">
            <button onClick={() => fileRef.current?.click()} className="text-[13px] text-text-dim hover:text-text transition-colors">Cambiar foto</button>
            {profile.avatar && <button onClick={removeAvatar} className="text-[13px] text-text-faint hover:text-red-400 transition-colors">Quitar</button>}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
      </div>

      <Group title="Nombre">
        <Card>
          <div className="p-4 flex flex-col gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save() }}
              placeholder="Tu nombre"
              className="w-full h-11 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[14px] text-text outline-none focus:border-white/25 placeholder:text-text-faint transition-colors"
            />
            <button
              onClick={save}
              disabled={!dirty && !saved}
              className="self-start px-4 h-10 rounded-xl bg-white/90 text-black text-[13.5px] font-medium hover:bg-white disabled:opacity-40 disabled:bg-white/20 disabled:text-text transition-colors"
            >
              {saved ? 'Guardado ✓' : 'Guardar'}
            </button>
          </div>
        </Card>
      </Group>
    </>
  )
}

function GeneralPage(): JSX.Element {
  return (
    <>
      <h1 className="text-[30px] font-semibold tracking-tight mb-9">General</h1>
      <Group title="Perfil">
        <Card>
          <Row
            icon={<IconUser />}
            label="Luis Carlos Zorrilla"
            desc="lc@luiszorrilla.com"
          />
        </Card>
      </Group>
      <Group title="Navegación">
        <Card>
          <Row label="Página de inicio" desc="Se abre al crear una pestaña nueva"><Pill>New tab</Pill></Row>
          <Row label="Buscador" desc="Motor de búsqueda del omnibox"><Pill>Google ⌄</Pill></Row>
        </Card>
      </Group>
    </>
  )
}

function PrivacyPage(): JSX.Element {
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)
  const clear = async (): Promise<void> => {
    if (!confirm('¿Borrar cookies, almacenamiento y caché de este perfil? Cerrarás sesión en todos los sitios.')) return
    setClearing(true)
    const ok = await monperTab.clearBrowsingData()
    setClearing(false); setCleared(ok)
    if (ok) setTimeout(() => setCleared(false), 3000)
  }
  return (
    <>
      <h1 className="text-[30px] font-semibold tracking-tight mb-9">Privacy</h1>
      <Group title="Datos">
        <Card>
          <Row label="Borrar datos de navegación" desc="Cookies, almacenamiento local y caché del perfil">
            <button
              onClick={clear}
              disabled={clearing}
              className="text-[13px] font-medium px-3.5 py-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
            >
              {clearing ? 'Borrando…' : cleared ? 'Listo ✓' : 'Borrar'}
            </button>
          </Row>
        </Card>
      </Group>
    </>
  )
}

function AboutPage(): JSX.Element {
  return (
    <>
      <h1 className="text-[30px] font-semibold tracking-tight mb-9">About</h1>
      <Group title="Aplicación">
        <Card>
          <Row label="Monper" desc="Navegador agéntico" />
          <Row label="Versión">
            <span className="text-[13px] text-text-dim tabular-nums">0.1.0</span>
          </Row>
        </Card>
      </Group>
    </>
  )
}
