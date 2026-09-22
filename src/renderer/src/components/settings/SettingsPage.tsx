import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useEffect, useRef, useState, type JSX } from 'react'
import { NO_UPDATE, type AppearanceData, type Profile, type UpdateState } from '@shared/types'
import { Avatar, Select } from '@renderer/components/ui'
import IconCpu from '~icons/tabler/cpu'
import IconSettings from '~icons/tabler/settings'
import IconShield from '~icons/tabler/shield-lock'
import IconShieldCheck from '~icons/tabler/shield-check'
import IconInfo from '~icons/tabler/info-circle'
import IconBolt from '~icons/tabler/bolt'
import ProvidersSection from './ProvidersSection'
import ProfilesSection from './ProfilesSection'
import { SEARCH_ENGINES, type ProfilePreferences } from '@shared/profiles'
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
  | 'general' | 'profiles' | 'appearance' | 'billing' | 'privacy' | 'password' | 'ai' | 'developers'
  | 'adblock' | 'projects' | 'skills' | 'memory' | 'mcps' | 'permissions' | 'actions' | 'routines'
  | 'statistics' | 'archived' | 'notifications' | 'about'

interface NavItem { id: Cat; label: string; icon: JSX.Element; soon?: boolean }
interface NavGroup { title?: string; items: NavItem[] }

// Las secciones sin implementar se identifican como pendientes.
const NAV: NavGroup[] = [
  {
    get title() { return tr("Settings") },
    items: [
      { id: 'general', get label() { return tr("General") }, icon: <IconSettings /> },
      { id: 'profiles', get label() { return tr("Profiles") }, icon: <IconUsers /> },
      { id: 'appearance', get label() { return tr("Appearance") }, icon: <IconPalette /> },
      { id: 'billing', get label() { return tr("Billing") }, icon: <IconCreditCard /> },
      { id: 'privacy', get label() { return tr("Privacy") }, icon: <IconShield /> },
      { id: 'adblock', get label() { return tr("Adblocker") }, icon: <IconShieldCheck /> },
      { id: 'password', get label() { return tr("Password") }, icon: <IconKey /> },
      { id: 'ai', get label() { return tr("AI") }, icon: <IconCpu /> },
      { id: 'developers', get label() { return tr("Developers") }, icon: <IconCode />, soon: true },
      { id: 'about', get label() { return tr("About") }, icon: <IconInfo /> }
    ]
  },
  {
    get title() { return tr("Agent Settings") },
    items: [
      { id: 'projects', get label() { return tr("Projects") }, icon: <IconFolder />, soon: true },
      { id: 'skills', get label() { return tr("Skills") }, icon: <IconBolt /> },
      { id: 'memory', get label() { return tr("Memory") }, icon: <IconBrain /> },
      { id: 'mcps', get label() { return tr("MCPs") }, icon: <IconPlug /> },
      { id: 'permissions', get label() { return tr("Permissions") }, icon: <IconLock /> },
      { id: 'actions', get label() { return tr("Quick actions") }, icon: <IconWand /> },
      { id: 'routines', get label() { return tr("Routines") }, icon: <IconClockBolt /> },
      { id: 'statistics', get label() { return tr("Statistics") }, icon: <IconChart /> },
      { id: 'archived', get label() { return tr("Chats") }, icon: <IconArchive /> },
      { id: 'notifications', get label() { return tr("Notifications") }, icon: <IconBell />, soon: true }
    ]
  }
]

const SOON: Partial<Record<Cat, { title: string }>> = {
  developers: { get title() { return tr("Developers") } },
  projects: { get title() { return tr("Projects") } },
  notifications: { get title() { return tr("Notifications") } }
}

const ALL_CATS = NAV.flatMap((g) => g.items.map((i) => i.id))
function initialCat(): Cat {
  const hash = window.location.hash.replace(/^#/, '')
  const h = (hash === 'account' ? 'profiles' : hash) as Cat
  return ALL_CATS.includes(h) ? h : 'ai'
}

/** Estado de una sección que aún no está disponible. */
function ComingSoon({ cat }: { cat: Cat }): JSX.Element {
  useLocale()
  const s = SOON[cat]
  if (!s) return <></>
  return (
    <>
      <SettingsHeader title={s.title} description={tr("Esta sección aún no está disponible.")} />
    </>
  )
}

export default function SettingsPage(): JSX.Element {
  useLocale()
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
                  'flex items-center gap-2.5 w-full h-8 px-2 rounded-lg text-[14px] text-left transition-colors [&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:shrink-0 ' +
                  (cat === n.id ? 'bg-white/[0.08] text-text' : 'text-text-dim hover:bg-white/[0.04] hover:text-text')
                }
              >
                {n.icon}
                <span className="flex-1 truncate">{n.label}</span>
                {n.soon && <span className="text-[10px] uppercase tracking-wide text-text-faint shrink-0">{tr("Pendiente")}</span>}
              </Button>
            ))}
          </div>
        ))}

        {/* Accesos externos */}
        <div className="mt-5 pt-5 border-t border-white/[0.06]">
          {[
            { label: tr("Extensions"), icon: <IconPuzzle />, onClick: () => titanioTab.navigate('https://chromewebstore.google.com/category/extensions') },
            { label: tr("Community"), icon: <IconUsers />, onClick: () => titanioTab.navigate('https://github.com/czorr/titanio') },
            { label: tr("Send feedback"), icon: <IconMessage />, onClick: () => titanioTab.navigate('https://github.com/czorr/titanio/issues/new') }
          ].map((l) => (
            <Button
              key={l.label}
              onClick={l.onClick}
              className="flex items-center gap-2.5 w-full h-8 px-2 rounded-lg text-[14px] text-left text-text-dim hover:bg-white/[0.04] hover:text-text transition-colors [&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:shrink-0"
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
              {cat === 'general' && <GeneralPage onEditProfile={() => setCat('profiles')} />}
              {cat === 'profiles' && <ProfilesSection onNavigate={(section) => setCat(section)} />}
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
  useLocale()
  // Al abrir AI se relee el catálogo del proveedor: es el momento en que el usuario va a mirar
  // qué modelos hay, y así los nuevos aparecen sin esperar a una versión de Titanio.
  useEffect(() => { void titanioTab.refreshModels() }, [])
  return (
    <>
      <SettingsHeader title={tr("AI")} />
      <ProvidersSection />
    </>
  )
}

/** Transparencia del chrome: cambia el material de vibrancy de la ventana, en vivo. */
function AppearancePage(): JSX.Element {
  useLocale()
  const [data, setData] = useState<AppearanceData>({ vibrancy: '', tint: null, options: [] })
  const [error, setError] = useState('')
  const tintRequest = useRef(0)
  // Con catch: si el preload es viejo o el handler no está, se ve el motivo en vez de
  // quedarse en blanco (era exactamente el patrón de fallo silencioso que arrastrábamos).
  useEffect(() => {
    let live = true
    let updated = false
    const unsubscribe = titanioTab.onAppearance((next) => {
      updated = true
      if (live) setData(next)
    })
    Promise.resolve()
      .then(() => titanioTab.getAppearance())
      .then((next) => { if (live && !updated) setData(next) })
      .catch((e) => {
        console.error('[appearance] no se pudo leer la configuración:', e)
        if (live) setError(tr("No se pudo cargar la configuración. Reinicia Titanio e inténtalo de nuevo."))
      })
    return () => { live = false; unsubscribe() }
  }, [])

  const pick = (id: string): void => {
    setData((d) => ({ ...d, vibrancy: id })) // feedback inmediato
    titanioTab.setVibrancy(id)
  }

  const pickTint = async (color: string | null): Promise<void> => {
    const request = ++tintRequest.current
    const previous = data.tint
    setError('')
    setData((d) => ({ ...d, tint: color }))
    try {
      await titanioTab.setTint(color)
    } catch (e) {
      if (request !== tintRequest.current) return
      console.error('[appearance] no se pudo cambiar el tono:', e)
      setData((d) => ({ ...d, tint: previous }))
      setError(tr("No se pudo guardar el tono. Inténtalo de nuevo."))
    }
  }

  const levels = [...data.options].reverse()
  const level = levels.findIndex((o) => o.id === data.vibrancy)
  const currentLabel = level >= 0 ? levels[level].label : tr("Personalizada")

  return (
    <>
      <SettingsHeader title={tr("Appearance")} description={tr("Ajusta la transparencia y el tono de la barra lateral y del panel de chat.")} />

      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[13px] text-amber-300 leading-relaxed">
          {error}
        </div>
      )}

      <Group title={tr("Transparencia")}>
        <Card>
          {data.options.length === 0 && !error && (
            <div className="px-4 py-4 text-[13px] text-text-faint">{tr("Cargando…")}</div>
          )}
          {levels.length > 0 && (
            <div className="px-4 py-4">
              <div className="flex items-center justify-between gap-4 mb-3">
                <label htmlFor="appearance-transparency" className="text-[14px]">{tr("Nivel de transparencia")}</label>
                <output htmlFor="appearance-transparency" className="text-[13px] text-text-dim">{currentLabel}</output>
              </div>
              <input
                id="appearance-transparency"
                type="range"
                min={0}
                max={levels.length - 1}
                step={1}
                value={Math.max(0, level)}
                aria-valuetext={currentLabel}
                onChange={(e) => pick(levels[Number(e.target.value)].id)}
                className="w-full h-6 accent-white cursor-pointer"
              />
              <div className="flex justify-between mt-1 text-[12px] text-text-faint">
                <span>{tr("Opaco")}</span><span>{tr("Más transparente")}</span>
              </div>
            </div>
          )}
        </Card>
      </Group>

      <Group title={tr("Tono")}>
        <Card>
          <div className="flex items-center justify-between gap-4 px-4 py-4">
            <div className="flex items-center gap-3">
              <input
                id="appearance-tint"
                type="color"
                value={data.tint ?? '#111114'}
                disabled={!data.options.length}
                onChange={(e) => void pickTint(e.target.value)}
                className="appearance-color w-11 h-11 shrink-0 cursor-pointer disabled:opacity-40"
              />
              <div>
                <label htmlFor="appearance-tint" className="block text-[14px]">{tr("Color del tono")}</label>
                <span className="text-[12.5px] text-text-dim">{data.tint?.toUpperCase() ?? tr("Sin tono")}</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" disabled={!data.tint} onClick={() => void pickTint(null)}>{tr("Quitar tono")}</Button>
          </div>
        </Card>
      </Group>

      <p className="text-[12.5px] text-text-faint">
        {tr("Usa")} <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.08] font-sans">⌘⌥V</kbd> {tr("para cambiar el nivel de transparencia.")} </p>
    </>
  )
}

function GeneralPage({ onEditProfile }: { onEditProfile: () => void }): JSX.Element {
  useLocale()
  // El perfil sale del main, no del JSX: estuvo escrito a mano y mostraba el mismo nombre y
  // correo a cualquiera que abriera Settings.
  const [profile, setProfile] = useState<Profile>({ name: '', initials: '?', avatar: null })
  const [profileError, setProfileError] = useState(false)
  const [navigation, setNavigation] = useState<ProfilePreferences | null>(null)
  const [pred, setPred] = useState<{ isDefault: boolean; shouldOffer: boolean } | null>(null)
  const [errPred, setErrPred] = useState('')
  // null = todavía no se sabe; el interruptor va deshabilitado hasta tener el valor real.
  const [pip, setPip] = useState<boolean | null>(null)
  useEffect(() => {
    titanioTab.getPipState().then((r) => setPip(r.enabled)).catch((e) => console.error('[pip] no se pudo leer el estado:', e))
  }, [])
  useEffect(() => {
    titanioTab.getProfile().then(setProfile).catch((error) => {
      console.error('[profile] no se pudo cargar el perfil:', error)
      setProfileError(true)
    })
    titanioTab.profilesSettings().then((state) => setNavigation(state.profiles.find((p) => p.id === state.activeId)?.preferences || null)).catch((error) => {
      console.error('[profiles] no se pudieron cargar las preferencias:', error)
      setProfileError(true)
    })
  }, [])
  useEffect(() => {
    titanioTab.getDefaultBrowser()
      .then(setPred)
      .catch((e) => { console.error('[predeterminado] no se pudo consultar:', e); setErrPred(tr("No se pudo consultar el estado.")) })
  }, [])

  return (
    <>
      <SettingsHeader title={tr("General")} />
      <LanguageSection />
      <Group title={tr("Perfil")}>
        <Card>
          <Button onClick={onEditProfile} className="flex items-center gap-3.5 w-full p-4 text-left hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-text-dim">
            <Avatar initials={profile.initials} src={profile.avatar} color={profile.color} icon={profile.icon} size="lg" />
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-medium truncate">{profile.name || tr("Sin nombre")}</span>
              <span className="block mt-1 text-[12.5px] text-text-dim">{profileError ? tr('No se pudo cargar el perfil.') : tr('Personaliza tu nombre y foto de perfil.')}</span>
            </span>
            <span className="text-[13px] text-text-dim shrink-0">{tr('Editar perfil')}</span>
            <IconArrowUpRight className="w-4 h-4 text-text-faint shrink-0" />
          </Button>
        </Card>
      </Group>
      <Group title={tr("Navegador predeterminado")}>
        <Card>
          <Row
            label={pred?.isDefault ? tr("Titanio es tu navegador predeterminado") : tr("Titanio no es tu navegador predeterminado")}
            desc={errPred || (pred?.isDefault
              ? tr("Los enlaces de otras apps se abren aquí.")
              : tr("Abre los enlaces de otras aplicaciones en Titanio."))}
          >
            {pred && !pred.isDefault && (
              <Button variant="primary" size="sm"
                onClick={async () => {
                  const r = await titanioTab.makeDefaultBrowser()
                  if (r.ok) setPred({ ...pred, isDefault: true })
                  // Si el sistema lo rechaza hay que decir por qué: si no, el botón parece roto.
                  else setErrPred(r.error || tr("El sistema no aceptó el cambio."))
                }}
                className="shrink-0"
              >
                {tr("Usar Titanio")} </Button>
            )}
          </Row>
        </Card>
      </Group>

      <Group title={tr("Vídeo")}>
        <Card>
          <Row
            label={tr("Picture in picture")}
            desc={pip
              ? tr("Reproduce vídeos en una ventana flotante.")
              : tr("Los vídeos se quedan en su pestaña.")}
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

      <Group title={tr("Navegación")}>
        <Card>
          <Row label={tr("Página de inicio")}>
            <Button className="min-h-10 max-w-[260px] truncate text-[13px] text-text-dim" onClick={onEditProfile}>{navigation?.homePage || tr("Nueva pestaña")}</Button>
          </Row>
          <Row label={tr("Buscador")}>
            <Button className="min-h-10 text-[13px] text-text-dim" onClick={onEditProfile}>{navigation ? SEARCH_ENGINES[navigation.searchEngine] : '…'}</Button>
          </Row>
        </Card>
      </Group>
    </>
  )
}

function LanguageSection(): JSX.Element {
  const locale = useLocale()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <Group title={tr('Idioma')}>
      <Card>
        <Row label={tr('Idioma del navegador')} desc={tr('El cambio se aplica a todas las ventanas.')}>
          <Select
            aria-label={tr('Idioma del navegador')}
            value={locale}
            disabled={saving}
            className="w-[140px]"
            onChange={async (event) => {
              const value = event.target.value
              if (value !== 'en' && value !== 'es') return
              setError(''); setSaving(true)
              try {
                if (!window.titanioLanguage) throw new Error('Language API unavailable')
                await window.titanioLanguage.set(value)
              } catch (cause) {
                console.error('[language] no se pudo guardar:', cause)
                setError(tr('No se pudo guardar el idioma.'))
              } finally { setSaving(false) }
            }}
          >
            <option value="en" lang="en">English</option>
            <option value="es" lang="es">Español</option>
          </Select>
        </Row>
        {error && <p role="alert" className="px-4 pb-3 text-[13px] text-amber-400">{error}</p>}
      </Card>
    </Group>
  )
}

function PrivacyPage(): JSX.Element {
  useLocale()
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)
  const clear = async (): Promise<void> => {
    if (!confirm(tr("¿Borrar cookies, almacenamiento y caché de este perfil? Cerrarás sesión en todos los sitios."))) return
    setClearing(true)
    const ok = await titanioTab.clearBrowsingData()
    setClearing(false); setCleared(ok)
    if (ok) setTimeout(() => setCleared(false), 3000)
  }
  return (
    <>
      <SettingsHeader title={tr("Privacy")} />
      <Group title={tr("Datos")}>
        <Card>
          <Row label={tr("Borrar datos de navegación")} desc={tr("Cookies, almacenamiento local y caché del perfil")}>
            <Button variant="danger" size="sm"
              onClick={clear}
              disabled={clearing}
            >
              {clearing ? tr("Borrando…") : cleared ? tr("Listo ✓") : tr("Borrar")}
            </Button>
          </Row>
        </Card>
      </Group>
    </>
  )
}

function AboutPage(): JSX.Element {
  useLocale()
  const [version, setVersion] = useState('')
  const [u, setU] = useState<UpdateState>(NO_UPDATE)

  useEffect(() => { titanioTab.getVersion().then(setVersion).catch(() => {}) }, [])
  useEffect(() => { titanioTab.getUpdateState().then(setU).catch(() => {}); return titanioTab.onUpdateState(setU) }, [])

  // Un solo lugar decide qué se ve: evita estados contradictorios (p. ej. "al día" + botón).
  const status = u.error
    ? u.error
    : u.downloaded ? tr("Versión {0} lista para instalar", u.version)
      : u.downloading ? tr("Descargando la versión {0}… {1}%", u.version, u.percent)
        : u.available ? tr("Versión {0} disponible", u.version)
          : u.checking ? tr("Buscando actualizaciones…")
            : tr("Titanio está al día")

  return (
    <>
      <SettingsHeader title={tr("About")} />
      <Group title={tr("Aplicación")}>
        <Card>
          <Row label="Titanio" />
          <Row label={tr("Versión")}>
            <span className="text-[13px] text-text-dim tabular-nums">{version || '—'}</span>
          </Row>
          <Row label={tr("Actualizaciones")} desc={status}>
            {u.downloaded ? (
              <Button variant="primary" size="sm" onClick={() => titanioTab.installUpdate()}>{tr("Reiniciar e instalar")}</Button>
            ) : u.downloading ? (
              <span className="text-[13px] text-purple-300 tabular-nums">{u.percent}%</span>
            ) : u.available ? (
              <Button variant="primary" size="sm" onClick={() => titanioTab.downloadUpdate()}>{tr("Descargar")}</Button>
            ) : (
              <Pill onClick={() => titanioTab.checkUpdates()}>
                {u.checking ? tr("Buscando…") : tr("Buscar actualizaciones")}
              </Pill>
            )}
          </Row>
        </Card>
      </Group>
    </>
  )
}
