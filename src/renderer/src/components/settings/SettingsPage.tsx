import { useEffect, useRef, useState, type JSX } from 'react'
import { NO_UPDATE, type AppearanceData, type Profile, type UpdateState } from '@shared/types'
import { Avatar } from '@renderer/components/ui'
import IconSparkles from '~icons/tabler/sparkles'
import IconCamera from '~icons/tabler/camera'
import IconSettings from '~icons/tabler/settings'
import IconShield from '~icons/tabler/shield-lock'
import IconShieldCheck from '~icons/tabler/shield-check'
import IconInfo from '~icons/tabler/info-circle'
import IconUser from '~icons/tabler/user'
import IconBolt from '~icons/tabler/bolt'
import ProvidersSection from './ProvidersSection'
import SkillsSection from './SkillsSection'
import MemorySection from './MemorySection'
import QuickActionsSection from './QuickActionsSection'
import RoutinesSection from './RoutinesSection'
import PermissionsSection from './PermissionsSection'
import AdblockSection from './AdblockSection'
import PasswordSection from './PasswordSection'
import ArchivedChatsSection from './ArchivedChatsSection'
import UsoSection from './UsoSection'
import McpSection from './McpSection'
import ImportSection from './ImportSection'
import IconWand from '~icons/tabler/wand'
import IconClockBolt from '~icons/tabler/clock-bolt'
import IconPalette from '~icons/tabler/palette'
import IconCreditCard from '~icons/tabler/credit-card'
import IconKey from '~icons/tabler/key'
import IconCode from '~icons/tabler/code'
import IconFolder from '~icons/tabler/folder'
import IconBrain from '~icons/tabler/cpu'
import IconPlug from '~icons/tabler/plug'
import IconLock from '~icons/tabler/lock-check'
import IconChart from '~icons/tabler/chart-bar'
import IconArchive from '~icons/tabler/archive'
import IconBell from '~icons/tabler/bell'
import IconPuzzle from '~icons/tabler/puzzle'
import IconUsers from '~icons/tabler/users'
import IconMessage from '~icons/tabler/message'
import IconArrowUpRight from '~icons/tabler/arrow-up-right'
import { Card, Group, Row, Pill, Toggle, SettingsHeader, SettingsContent, Button } from './ui'

const { titanioTab } = window

type Cat =
  | 'general' | 'account' | 'appearance' | 'billing' | 'privacy' | 'password' | 'ai' | 'developers'
  | 'adblock' | 'projects' | 'skills' | 'memory' | 'mcps' | 'permissions' | 'actions' | 'routines'
  | 'statistics' | 'archived' | 'notifications' | 'about'

interface NavItem { id: Cat; label: string; icon: JSX.Element; soon?: boolean }
interface NavGroup { title?: string; items: NavItem[] }

// Las secciones sin implementar se identifican como pendientes.
const NAV: NavGroup[] = [
  {
    title: 'Settings',
    items: [
      { id: 'general', label: 'General', icon: <IconSettings /> },
      { id: 'account', label: 'Account', icon: <IconUser /> },
      { id: 'appearance', label: 'Appearance', icon: <IconPalette /> },
      { id: 'billing', label: 'Billing', icon: <IconCreditCard /> },
      { id: 'privacy', label: 'Privacy', icon: <IconShield /> },
      { id: 'adblock', label: 'Adblocker', icon: <IconShieldCheck /> },
      { id: 'password', label: 'Password', icon: <IconKey /> },
      { id: 'ai', label: 'AI', icon: <IconSparkles /> },
      { id: 'developers', label: 'Developers', icon: <IconCode />, soon: true },
      { id: 'about', label: 'About', icon: <IconInfo /> }
    ]
  },
  {
    title: 'Agent Settings',
    items: [
      { id: 'projects', label: 'Projects', icon: <IconFolder />, soon: true },
      { id: 'skills', label: 'Skills', icon: <IconBolt /> },
      { id: 'memory', label: 'Memory', icon: <IconBrain /> },
      { id: 'mcps', label: 'MCPs', icon: <IconPlug /> },
      { id: 'permissions', label: 'Permissions', icon: <IconLock /> },
      { id: 'actions', label: 'Quick actions', icon: <IconWand /> },
      { id: 'routines', label: 'Routines', icon: <IconClockBolt /> },
      { id: 'statistics', label: 'Statistics', icon: <IconChart /> },
      { id: 'archived', label: 'Chats', icon: <IconArchive /> },
      { id: 'notifications', label: 'Notifications', icon: <IconBell />, soon: true }
    ]
  }
]

const SOON: Partial<Record<Cat, { title: string }>> = {
  developers: { title: 'Developers' },
  projects: { title: 'Projects' },
  notifications: { title: 'Notifications' }
}

const ALL_CATS = NAV.flatMap((g) => g.items.map((i) => i.id))
function initialCat(): Cat {
  const h = window.location.hash.replace(/^#/, '') as Cat
  return ALL_CATS.includes(h) ? h : 'ai'
}

/** Estado de una sección que aún no está disponible. */
function ComingSoon({ cat }: { cat: Cat }): JSX.Element {
  const s = SOON[cat]
  if (!s) return <></>
  return (
    <>
      <SettingsHeader title={s.title} description="Esta sección aún no está disponible." />
    </>
  )
}

export default function SettingsPage(): JSX.Element {
  const [cat, setCat] = useState<Cat>(initialCat)

  return (
    <div className="h-full flex page-backdrop text-text select-text">
      {/* Sub-nav de settings */}
      <nav className="w-[230px] shrink-0 border-r border-white/[0.06] px-3 py-6 overflow-y-auto [&::-webkit-scrollbar]:w-0">
        {NAV.map((group, gi) => (
          <div key={group.title ?? gi} className={gi > 0 ? 'mt-5 pt-5 border-t border-white/[0.06]' : ''}>
            {group.title && <div className="px-2 mb-2 text-[12px] font-medium text-text-faint">{group.title}</div>}
            {group.items.map((n) => (
              <Button
                key={n.id}
                onClick={() => setCat(n.id)}
                className={
                  'flex items-center gap-2.5 w-full h-9 px-2.5 rounded-lg text-[14px] text-left transition-colors [&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:shrink-0 ' +
                  (cat === n.id ? 'bg-white/[0.08] text-text' : 'text-text-dim hover:bg-white/[0.04] hover:text-text')
                }
              >
                {n.icon}
                <span className="flex-1 truncate">{n.label}</span>
                {n.soon && <span className="text-[10px] uppercase tracking-wide text-text-faint shrink-0">Pendiente</span>}
              </Button>
            ))}
          </div>
        ))}

        {/* Accesos externos */}
        <div className="mt-5 pt-5 border-t border-white/[0.06]">
          {[
            { label: 'Extensions', icon: <IconPuzzle />, onClick: () => titanioTab.navigate('https://chromewebstore.google.com/category/extensions') },
            { label: 'Community', icon: <IconUsers />, onClick: () => titanioTab.navigate('https://github.com/czorr/titanio') },
            { label: 'Send feedback', icon: <IconMessage />, onClick: () => titanioTab.navigate('https://github.com/czorr/titanio/issues/new') }
          ].map((l) => (
            <Button
              key={l.label}
              onClick={l.onClick}
              className="flex items-center gap-2.5 w-full h-9 px-2.5 rounded-lg text-[14px] text-left text-text-dim hover:bg-white/[0.04] hover:text-text transition-colors [&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:shrink-0"
            >
              {l.icon}
              <span className="flex-1 truncate">{l.label}</span>
              <IconArrowUpRight className="w-3.5 h-3.5 text-text-faint shrink-0" />
            </Button>
          ))}
        </div>
      </nav>

      {/* Contenido */}
      <main className="flex-1 overflow-hidden">
        {cat === 'skills' ? (
          <SkillsSection />
        ) : cat === 'memory' ? (
          <MemorySection />
        ) : (
          <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:w-0">
            <SettingsContent>
              {cat === 'ai' && <AIPage />}
              {cat === 'actions' && <QuickActionsSection />}
              {cat === 'routines' && <RoutinesSection />}
              {cat === 'appearance' && <AppearancePage />}
              {cat === 'account' && <AccountPage />}
              {cat === 'general' && <GeneralPage />}
              {cat === 'privacy' && <PrivacyPage />}
              {cat === 'adblock' && <AdblockSection />}
              {cat === 'password' && <PasswordSection />}
              {cat === 'archived' && <ArchivedChatsSection />}
              {cat === 'billing' && <UsoSection foco="billing" />}
              {cat === 'statistics' && <UsoSection foco="stats" />}
              {cat === 'permissions' && <PermissionsSection />}
              {cat === 'mcps' && <McpSection />}
              {cat === 'about' && <AboutPage />}
              {SOON[cat] && <ComingSoon cat={cat} />}
            </SettingsContent>
          </div>
        )}
      </main>
    </div>
  )
}

function AIPage(): JSX.Element {
  // Al abrir AI se relee el catálogo del proveedor: es el momento en que el usuario va a mirar
  // qué modelos hay, y así los nuevos aparecen sin esperar a una versión de Titanio.
  useEffect(() => { void titanioTab.refreshModels() }, [])
  return (
    <>
      <SettingsHeader title="AI" />
      <ProvidersSection />
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
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titanioTab.getProfile().then((p) => { setProfile(p); setName(p.name) }) }, [])

  const dirty = !!name.trim() && name.trim() !== profile.name
  const save = async (): Promise<void> => {
    const p = await titanioTab.setProfile(name.trim())
    setProfile(p); setName(p.name); setSaved(true); setTimeout(() => setSaved(false), 1500)
  }
  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setAvatarError(null)
    // Si falla, el usuario eligió una foto y no pasó nada: hay que decirle por qué.
    try {
      setProfile(await titanioTab.setAvatar(await fileToAvatar(f)))
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'No se pudo usar esa imagen.')
    }
  }
  const removeAvatar = async (): Promise<void> => setProfile(await titanioTab.setAvatar(null))

  return (
    <>
      <SettingsHeader title="Account" />

      <div className="flex items-center gap-4 mb-8">
        <Button shape="pill" title="Cambiar foto" className="relative group/av" onClick={() => fileRef.current?.click()}>
          <Avatar initials={profile.initials} src={profile.avatar} size="lg" />
          <div className="absolute inset-0 rounded-full grid place-items-center bg-black/50 opacity-0 group-hover/av:opacity-100 transition-opacity [&>svg]:w-5 [&>svg]:h-5 [&>svg]:text-white">
            <IconCamera />
          </div>
        </Button>
        <div>
          <div className="text-[16px] font-medium">{profile.name || '—'}</div>
          <div className="flex items-center gap-3 mt-1">
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>Cambiar foto</Button>
            {profile.avatar && <Button variant="danger-ghost" size="sm" onClick={removeAvatar}>Quitar</Button>}
          </div>
          {avatarError && <div className="mt-1 text-[12.5px] text-amber-400">{avatarError}</div>}
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
            <Button variant="primary" size="md"
              onClick={save}
              disabled={!dirty && !saved}
              className="self-start"
            >
              {saved ? 'Guardado ✓' : 'Guardar'}
            </Button>
          </div>
        </Card>
      </Group>
    </>
  )
}

/** Transparencia del chrome: cambia el material de vibrancy de la ventana, en vivo. */
function AppearancePage(): JSX.Element {
  const [data, setData] = useState<AppearanceData>({ vibrancy: '', options: [] })
  const [error, setError] = useState('')
  // Con catch: si el preload es viejo o el handler no está, se ve el motivo en vez de
  // quedarse en blanco (era exactamente el patrón de fallo silencioso que arrastrábamos).
  useEffect(() => {
    Promise.resolve()
      .then(() => titanioTab.getAppearance())
      .then(setData)
      .catch((e) => {
        console.error('[appearance] no se pudo leer la configuración:', e)
        setError('No se pudo cargar la configuración. Reinicia Titanio e inténtalo de nuevo.')
      })
  }, [])

  const pick = (id: string): void => {
    setData((d) => ({ ...d, vibrancy: id })) // feedback inmediato
    titanioTab.setVibrancy(id)
  }

  return (
    <>
      <SettingsHeader title="Appearance" description="Ajusta la transparencia de la barra lateral y del panel de chat." />

      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[13px] text-amber-300 leading-relaxed">
          {error}
        </div>
      )}

      <Group title="Transparencia">
        <Card>
          {data.options.length === 0 && !error && (
            <div className="px-4 py-4 text-[13px] text-text-faint">Cargando…</div>
          )}
          {data.options.map((o) => {
            const on = o.id === data.vibrancy
            return (
              <Button key={o.id} onClick={() => pick(o.id)} className="w-full text-left overflow-hidden">
                <Row label={o.label} desc={o.desc}>
                  <span
                    className={
                      'w-[18px] h-[18px] rounded-full border grid place-items-center shrink-0 ' +
                      (on ? 'border-white/70' : 'border-white/20')
                    }
                  >
                    {on && <span className="w-2.5 h-2.5 rounded-full bg-white" />}
                  </span>
                </Row>
              </Button>
            )
          })}
        </Card>
      </Group>

      <p className="text-[12.5px] text-text-faint">
        Usa <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.08] font-sans">⌘⌥V</kbd> para cambiar el nivel de transparencia.
      </p>
    </>
  )
}

function GeneralPage(): JSX.Element {
  // El perfil sale del main, no del JSX: estuvo escrito a mano y mostraba el mismo nombre y
  // correo a cualquiera que abriera Settings.
  const [profile, setProfile] = useState<Profile>({ name: '', initials: '?', avatar: null })
  const [pred, setPred] = useState<{ isDefault: boolean; shouldOffer: boolean } | null>(null)
  const [errPred, setErrPred] = useState('')
  // null = todavía no se sabe; el interruptor va deshabilitado hasta tener el valor real.
  const [pip, setPip] = useState<boolean | null>(null)
  useEffect(() => {
    titanioTab.getPipState().then((r) => setPip(r.enabled)).catch((e) => console.error('[pip] no se pudo leer el estado:', e))
  }, [])
  useEffect(() => { titanioTab.getProfile().then(setProfile).catch(() => {}) }, [])
  useEffect(() => {
    titanioTab.getDefaultBrowser()
      .then(setPred)
      .catch((e) => { console.error('[predeterminado] no se pudo consultar:', e); setErrPred('No se pudo consultar el estado.') })
  }, [])

  return (
    <>
      <SettingsHeader title="General" />
      <Group title="Perfil">
        <Card>
          <Row icon={<IconUser />} label={profile.name || 'Sin nombre'} desc="Edita tu perfil en Account" />
        </Card>
      </Group>
      <Group title="Navegador predeterminado">
        <Card>
          <Row
            label={pred?.isDefault ? 'Titanio es tu navegador predeterminado' : 'Titanio no es tu navegador predeterminado'}
            desc={errPred || (pred?.isDefault
              ? 'Los enlaces de otras apps se abren aquí.'
              : 'Abre los enlaces de otras aplicaciones en Titanio.')}
          >
            {pred && !pred.isDefault && (
              <Button variant="primary" size="sm"
                onClick={async () => {
                  const r = await titanioTab.makeDefaultBrowser()
                  if (r.ok) setPred({ ...pred, isDefault: true })
                  // Si el sistema lo rechaza hay que decir por qué: si no, el botón parece roto.
                  else setErrPred(r.error || 'El sistema no aceptó el cambio.')
                }}
                className="shrink-0"
              >
                Usar Titanio
              </Button>
            )}
          </Row>
        </Card>
      </Group>

      <Group title="Vídeo">
        <Card>
          <Row
            label="Picture in picture"
            desc={pip
              ? 'Reproduce vídeos en una ventana flotante.'
              : 'Los vídeos se quedan en su pestaña.'}
          >
            <Toggle
              on={pip === true}
              disabled={pip === null}
              onChange={async (v) => {
                setPip(v) // respuesta inmediata
                try { setPip(await titanioTab.setPipEnabled(v)) }
                catch (e) { console.error('[pip] no se pudo cambiar:', e); titanioTab.getPipState().then((r) => setPip(r.enabled)).catch(() => {}) }
              }}
            />
          </Row>
        </Card>
      </Group>

      {/* Importar vive aquí y no en el nav: se hace una vez al llegar, no es un sitio al que
          se vuelve. Como pestaña propia tenía un peso permanente que no le corresponde. */}
      <ImportSection />

      <Group title="Navegación">
        <Card>
          <Row label="Página de inicio">
            <span className="text-[13px] text-text-faint">Nueva pestaña</span>
          </Row>
          <Row label="Buscador">
            <span className="text-[13px] text-text-faint">Google</span>
          </Row>
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
    const ok = await titanioTab.clearBrowsingData()
    setClearing(false); setCleared(ok)
    if (ok) setTimeout(() => setCleared(false), 3000)
  }
  return (
    <>
      <SettingsHeader title="Privacy" />
      <Group title="Datos">
        <Card>
          <Row label="Borrar datos de navegación" desc="Cookies, almacenamiento local y caché del perfil">
            <Button variant="danger" size="sm"
              onClick={clear}
              disabled={clearing}
            >
              {clearing ? 'Borrando…' : cleared ? 'Listo ✓' : 'Borrar'}
            </Button>
          </Row>
        </Card>
      </Group>
    </>
  )
}

function AboutPage(): JSX.Element {
  const [version, setVersion] = useState('')
  const [u, setU] = useState<UpdateState>(NO_UPDATE)

  useEffect(() => { titanioTab.getVersion().then(setVersion).catch(() => {}) }, [])
  useEffect(() => { titanioTab.getUpdateState().then(setU).catch(() => {}); return titanioTab.onUpdateState(setU) }, [])

  // Un solo lugar decide qué se ve: evita estados contradictorios (p. ej. "al día" + botón).
  const status = u.error
    ? u.error
    : u.downloaded ? `Versión ${u.version} lista para instalar`
      : u.downloading ? `Descargando la versión ${u.version}… ${u.percent}%`
        : u.available ? `Versión ${u.version} disponible`
          : u.checking ? 'Buscando actualizaciones…'
            : 'Titanio está al día'

  return (
    <>
      <SettingsHeader title="About" />
      <Group title="Aplicación">
        <Card>
          <Row label="Titanio" />
          <Row label="Versión">
            <span className="text-[13px] text-text-dim tabular-nums">{version || '—'}</span>
          </Row>
          <Row label="Actualizaciones" desc={status}>
            {u.downloaded ? (
              <Button variant="primary" size="sm" onClick={() => titanioTab.installUpdate()}>Reiniciar e instalar</Button>
            ) : u.downloading ? (
              <span className="text-[13px] text-purple-300 tabular-nums">{u.percent}%</span>
            ) : u.available ? (
              <Button variant="primary" size="sm" onClick={() => titanioTab.downloadUpdate()}>Descargar</Button>
            ) : (
              <Pill onClick={() => titanioTab.checkUpdates()}>
                {u.checking ? 'Buscando…' : 'Buscar actualizaciones'}
              </Pill>
            )}
          </Row>
        </Card>
      </Group>
    </>
  )
}
