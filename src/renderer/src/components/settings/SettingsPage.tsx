import { useState, type JSX } from 'react'
import IconSparkles from '~icons/tabler/sparkles'
import IconSettings from '~icons/tabler/settings'
import IconShield from '~icons/tabler/shield-lock'
import IconInfo from '~icons/tabler/info-circle'
import IconUser from '~icons/tabler/user'
import IconBolt from '~icons/tabler/bolt'
import ProvidersSection from './ProvidersSection'
import SkillsSection from './SkillsSection'
import { Card, Group, Row, Pill } from './ui'

const { monperTab } = window

type Cat = 'general' | 'ai' | 'skills' | 'privacy' | 'about'

const NAV: { id: Cat; label: string; icon: JSX.Element }[] = [
  { id: 'general', label: 'General', icon: <IconSettings /> },
  { id: 'ai', label: 'AI', icon: <IconSparkles /> },
  { id: 'skills', label: 'Skills', icon: <IconBolt /> },
  { id: 'privacy', label: 'Privacy', icon: <IconShield /> },
  { id: 'about', label: 'About', icon: <IconInfo /> }
]

export default function SettingsPage(): JSX.Element {
  const [cat, setCat] = useState<Cat>('ai')

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
