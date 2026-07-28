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
import QuickActionsSection from './QuickActionsSection'
import RoutinesSection from './RoutinesSection'
import PermissionsSection from './PermissionsSection'
import AdblockSection from './AdblockSection'
import McpSection from './McpSection'
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
import { Card, Group, Row, Pill } from './ui'

const { monperTab } = window

type Cat =
  | 'general' | 'account' | 'appearance' | 'billing' | 'privacy' | 'password' | 'ai' | 'developers'
  | 'adblock' | 'projects' | 'skills' | 'memory' | 'mcps' | 'permissions' | 'actions' | 'routines'
  | 'statistics' | 'archived' | 'notifications' | 'about'

interface NavItem { id: Cat; label: string; icon: JSX.Element; soon?: boolean }
interface NavGroup { title?: string; items: NavItem[] }

// El nav es también el roadmap: lo que aún no existe queda visible con "Pronto".
const NAV: NavGroup[] = [
  {
    title: 'Settings',
    items: [
      { id: 'general', label: 'General', icon: <IconSettings /> },
      { id: 'account', label: 'Account', icon: <IconUser /> },
      { id: 'appearance', label: 'Appearance', icon: <IconPalette /> },
      { id: 'billing', label: 'Billing', icon: <IconCreditCard />, soon: true },
      { id: 'privacy', label: 'Privacy', icon: <IconShield /> },
      { id: 'adblock', label: 'Adblocker', icon: <IconShieldCheck /> },
      { id: 'password', label: 'Password', icon: <IconKey />, soon: true },
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
      { id: 'memory', label: 'Memory', icon: <IconBrain />, soon: true },
      { id: 'mcps', label: 'MCPs', icon: <IconPlug /> },
      { id: 'permissions', label: 'Permissions', icon: <IconLock /> },
      { id: 'actions', label: 'Quick actions', icon: <IconWand /> },
      { id: 'routines', label: 'Routines', icon: <IconClockBolt /> },
      { id: 'statistics', label: 'Statistics', icon: <IconChart />, soon: true },
      { id: 'archived', label: 'Archived chats', icon: <IconArchive />, soon: true },
      { id: 'notifications', label: 'Notification Use', icon: <IconBell />, soon: true }
    ]
  }
]

/** Qué será cada sección pendiente: el roadmap, visible dentro del producto. */
const SOON: Partial<Record<Cat, { title: string; desc: string; bullets: string[] }>> = {
  billing: {
    title: 'Billing',
    desc: 'Tu plan y consumo.',
    bullets: ['Plan y método de pago', 'Consumo de tokens por proveedor', 'Límites de gasto para el agente']
  },
  password: {
    title: 'Password',
    desc: 'El gestor de contraseñas de Monper, hoy accesible desde el candado del topbar.',
    bullets: [
      'Ver y editar credenciales guardadas',
      'El agente rellena sin ver nunca el secreto',
      'Importar desde 1Password, Bitwarden o Chrome'
    ]
  },
  developers: {
    title: 'Developers',
    desc: 'Herramientas para depurar el navegador y el agente.',
    bullets: ['Logs del agente y de las tools', 'Inspector del REPL', 'Exportar trazas de una ejecución']
  },
  projects: {
    title: 'Projects',
    desc: 'Espacios de trabajo con su propio contexto e instrucciones.',
    bullets: ['Pestañas y chats agrupados por proyecto', 'Instrucciones y skills por proyecto', 'Retomar donde lo dejaste']
  },
  memory: {
    title: 'Memory',
    desc: 'Memoria semántica de todo lo que lees, local y privada.',
    bullets: [
      '“¿Dónde vi ese benchmark?” sobre tu historial',
      'El agente usa lo que ya leíste como contexto',
      'Tus páginas guardadas no dan 404 nunca'
    ]
  },
  statistics: {
    title: 'Statistics',
    desc: 'Qué hizo el agente y cuánto costó.',
    bullets: ['Ejecuciones, pasos y tokens por día', 'Tareas completadas vs. bloqueadas', 'Sitios donde más falla']
  },
  archived: {
    title: 'Archived chats',
    desc: 'Historial de conversaciones con el agente.',
    bullets: ['Buscar en chats pasados', 'Archivar y restaurar', 'Retomar una tarea anterior']
  },
  notifications: {
    title: 'Notification Use',
    desc: 'Qué te avisa Monper y cómo.',
    bullets: ['Avisos de rutinas', 'Cuando el agente termina o necesita ayuda', 'Horario sin molestar']
  }
}

const ALL_CATS = NAV.flatMap((g) => g.items.map((i) => i.id))
function initialCat(): Cat {
  const h = window.location.hash.replace(/^#/, '') as Cat
  return ALL_CATS.includes(h) ? h : 'ai'
}

/** Página placeholder que explica qué vendrá en esa sección. */
function ComingSoon({ cat }: { cat: Cat }): JSX.Element {
  const s = SOON[cat]
  if (!s) return <></>
  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-[30px] font-semibold tracking-tight">{s.title}</h1>
        <span className="px-2 py-1 rounded-md bg-white/[0.08] text-[11.5px] font-medium text-text-dim">Pronto</span>
      </div>
      <p className="text-[13.5px] text-text-dim leading-relaxed mb-6">{s.desc}</p>
      <Card>
        <div className="p-5 flex flex-col gap-3">
          {s.bullets.map((b) => (
            <div key={b} className="flex items-start gap-3 text-[13.5px] text-text-dim">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-white/25 shrink-0" />
              {b}
            </div>
          ))}
        </div>
      </Card>
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
              <button
                key={n.id}
                onClick={() => setCat(n.id)}
                className={
                  'flex items-center gap-2.5 w-full h-9 px-2.5 rounded-lg text-[14px] text-left transition-colors [&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:shrink-0 ' +
                  (cat === n.id ? 'bg-white/[0.08] text-text' : 'text-text-dim hover:bg-white/[0.04] hover:text-text')
                }
              >
                {n.icon}
                <span className="flex-1 truncate">{n.label}</span>
                {n.soon && <span className="text-[10px] uppercase tracking-wide text-text-faint shrink-0">Pronto</span>}
              </button>
            ))}
          </div>
        ))}

        {/* Accesos externos */}
        <div className="mt-5 pt-5 border-t border-white/[0.06]">
          {[
            { label: 'Extensions', icon: <IconPuzzle />, onClick: () => monperTab.navigate('https://chromewebstore.google.com/category/extensions') },
            { label: 'Community', icon: <IconUsers />, onClick: () => monperTab.navigate('https://github.com/czorr/monper') },
            { label: 'Send feedback', icon: <IconMessage />, onClick: () => monperTab.navigate('https://github.com/czorr/monper/issues/new') }
          ].map((l) => (
            <button
              key={l.label}
              onClick={l.onClick}
              className="flex items-center gap-2.5 w-full h-9 px-2.5 rounded-lg text-[14px] text-left text-text-dim hover:bg-white/[0.04] hover:text-text transition-colors [&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:shrink-0"
            >
              {l.icon}
              <span className="flex-1 truncate">{l.label}</span>
              <IconArrowUpRight className="w-3.5 h-3.5 text-text-faint shrink-0" />
            </button>
          ))}
        </div>
      </nav>

      {/* Contenido */}
      <main className="flex-1 overflow-hidden">
        {cat === 'skills' ? (
          <SkillsSection />
        ) : (
          <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:w-0">
            <div className="max-w-[680px] mx-auto px-8 py-12">
              {cat === 'ai' && <AIPage />}
              {cat === 'actions' && <QuickActionsSection />}
              {cat === 'routines' && <RoutinesSection />}
              {cat === 'appearance' && <AppearancePage />}
              {cat === 'account' && <AccountPage />}
              {cat === 'general' && <GeneralPage />}
              {cat === 'privacy' && <PrivacyPage />}
              {cat === 'adblock' && <AdblockSection />}
              {cat === 'permissions' && <PermissionsSection />}
              {cat === 'mcps' && <McpSection />}
              {cat === 'about' && <AboutPage />}
              {SOON[cat] && <ComingSoon cat={cat} />}
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
          {/* Ninguno de los dos es configurable todavía: son descripciones del comportamiento
              actual, no controles. Ver el comentario de GeneralPage. */}
          <Row label="Modelo por defecto" desc="El último proveedor usado se convierte en el default">
            <span className="text-[13px] text-text-faint">Proveedor activo</span>
          </Row>
          <Row label="Comportamiento de seguimiento" desc="Los mensajes se encolan mientras el agente corre">
            <span className="text-[13px] text-text-faint">Queue · Pronto</span>
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
  const [avatarError, setAvatarError] = useState<string | null>(null)
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
    setAvatarError(null)
    // Si falla, el usuario eligió una foto y no pasó nada: hay que decirle por qué.
    try {
      setProfile(await monperTab.setAvatar(await fileToAvatar(f)))
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'No se pudo usar esa imagen.')
    }
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

/** Transparencia del chrome: cambia el material de vibrancy de la ventana, en vivo. */
function AppearancePage(): JSX.Element {
  const [data, setData] = useState<AppearanceData>({ vibrancy: '', options: [] })
  const [error, setError] = useState('')
  // Con catch: si el preload es viejo o el handler no está, se ve el motivo en vez de
  // quedarse en blanco (era exactamente el patrón de fallo silencioso que arrastrábamos).
  useEffect(() => {
    Promise.resolve()
      .then(() => monperTab.getAppearance())
      .then(setData)
      .catch((e) => {
        console.error('[appearance] no se pudo leer la configuración:', e)
        setError('No se pudo leer la configuración. Reinicia Monper: los cambios en el preload necesitan reiniciar la app, no solo recargar.')
      })
  }, [])

  const pick = (id: string): void => {
    setData((d) => ({ ...d, vibrancy: id })) // feedback inmediato
    monperTab.setVibrancy(id)
  }

  return (
    <>
      <h1 className="text-[30px] font-semibold tracking-tight mb-3">Appearance</h1>
      <p className="text-[13.5px] text-text-dim leading-relaxed mb-7">
        Cuánto se transparenta el chrome de Monper — el sidebar y el panel de chat — sobre
        lo que hay detrás de la ventana. El contenido de las páginas no cambia.
      </p>

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
              <button key={o.id} onClick={() => pick(o.id)} className="w-full text-left">
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
              </button>
            )
          })}
        </Card>
      </Group>

      <p className="text-[12.5px] text-text-faint">
        Atajo: <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.08] font-sans">⌘⌥V</kbd> cicla
        los niveles sin salir de la página que estés viendo.
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
  useEffect(() => { monperTab.getProfile().then(setProfile).catch(() => {}) }, [])
  useEffect(() => {
    monperTab.getDefaultBrowser()
      .then(setPred)
      .catch((e) => { console.error('[predeterminado] no se pudo consultar:', e); setErrPred('No se pudo consultar el estado.') })
  }, [])

  return (
    <>
      <h1 className="text-[30px] font-semibold tracking-tight mb-9">General</h1>
      <Group title="Perfil">
        <Card>
          <Row icon={<IconUser />} label={profile.name || 'Sin nombre'} desc="Se edita en Account" />
        </Card>
      </Group>
      <Group title="Navegador predeterminado">
        <Card>
          <Row
            label={pred?.isDefault ? 'Monper es tu navegador predeterminado' : 'Monper no es tu navegador predeterminado'}
            desc={errPred || (pred?.isDefault
              ? 'Los enlaces de otras apps se abren aquí.'
              : 'Los enlaces que abras desde otras apps no llegarán a Monper.')}
          >
            {pred && !pred.isDefault && (
              <button
                onClick={async () => {
                  const r = await monperTab.makeDefaultBrowser()
                  if (r.ok) setPred({ ...pred, isDefault: true })
                  // Si el sistema lo rechaza hay que decir por qué: si no, el botón parece roto.
                  else setErrPred(r.error || 'El sistema no aceptó el cambio.')
                }}
                className="shrink-0 h-9 px-3.5 rounded-lg bg-white/90 text-black text-[13px] font-medium hover:bg-white transition-colors"
              >
                Usar Monper
              </button>
            )}
          </Row>
        </Card>
      </Group>

      <Group title="Navegación">
        <Card>
          {/* Sin `⌄`: no hay nada que elegir todavía. Un desplegable que no despliega es peor
              que decir "Pronto" — parece que el ajuste existe y que tú lo dejaste así. */}
          <Row label="Página de inicio" desc="Se abre al crear una pestaña nueva">
            <Pill>New tab</Pill>
          </Row>
          <Row label="Buscador" desc="Hoy siempre Google; el selector llega con el ajuste de verdad">
            <span className="text-[13px] text-text-faint">Google · Pronto</span>
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
  const [version, setVersion] = useState('')
  const [u, setU] = useState<UpdateState>(NO_UPDATE)

  useEffect(() => { monperTab.getVersion().then(setVersion).catch(() => {}) }, [])
  useEffect(() => { monperTab.getUpdateState().then(setU).catch(() => {}); return monperTab.onUpdateState(setU) }, [])

  // Un solo lugar decide qué se ve: evita estados contradictorios (p. ej. "al día" + botón).
  const status = u.error
    ? u.error
    : u.downloaded ? `Versión ${u.version} lista para instalar`
      : u.downloading ? `Descargando la versión ${u.version}… ${u.percent}%`
        : u.available ? `Versión ${u.version} disponible`
          : u.checking ? 'Buscando actualizaciones…'
            : 'Monper está al día'

  const purple = 'px-3.5 h-9 rounded-lg bg-purple-400/15 border border-purple-400/25 text-purple-300 hover:bg-purple-400/25 text-[13px] font-medium transition-colors'

  return (
    <>
      <h1 className="text-[30px] font-semibold tracking-tight mb-9">About</h1>
      <Group title="Aplicación">
        <Card>
          <Row label="Monper" desc="Navegador agéntico" />
          <Row label="Versión">
            <span className="text-[13px] text-text-dim tabular-nums">{version || '—'}</span>
          </Row>
          <Row label="Actualizaciones" desc={status}>
            {u.downloaded ? (
              <button onClick={() => monperTab.installUpdate()} className={purple}>Reiniciar e instalar</button>
            ) : u.downloading ? (
              <span className="text-[13px] text-purple-300 tabular-nums">{u.percent}%</span>
            ) : u.available ? (
              <button onClick={() => monperTab.downloadUpdate()} className={purple}>Descargar</button>
            ) : (
              <Pill onClick={() => monperTab.checkUpdates()}>
                {u.checking ? 'Buscando…' : 'Buscar actualizaciones'}
              </Pill>
            )}
          </Row>
        </Card>
      </Group>
    </>
  )
}
