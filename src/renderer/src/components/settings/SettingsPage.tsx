import { useEffect, useState, type JSX, type ReactNode } from 'react'
import type { Bookmark } from '@shared/types'

const { monperTab } = window

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="mb-8">
      <h2 className="text-[13px] font-semibold text-text-faint uppercase tracking-wide mb-3">{title}</h2>
      <div className="rounded-xl border border-white/8 bg-white/[0.03] divide-y divide-white/[0.06]">{children}</div>
    </section>
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] text-text">{label}</div>
        {desc && <div className="text-[12.5px] text-text-dim mt-0.5">{desc}</div>}
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage(): JSX.Element {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    monperTab.getBookmarks().then(setBookmarks)
    return monperTab.onBookmarks(setBookmarks)
  }, [])

  const clearData = async (): Promise<void> => {
    if (!confirm('¿Borrar cookies, almacenamiento y caché de este perfil? Cerrarás sesión en todos los sitios.')) return
    setClearing(true)
    const ok = await monperTab.clearBrowsingData()
    setClearing(false)
    setCleared(ok)
    if (ok) setTimeout(() => setCleared(false), 3000)
  }

  return (
    <div className="min-h-full bg-bg text-text overflow-y-auto">
      <div className="max-w-[640px] mx-auto px-8 py-14">
        <h1 className="text-[28px] font-semibold tracking-tight mb-10">Settings</h1>

        <Section title="Perfil">
          <Row label="Luis Carlos Zorrilla" desc="lc@luiszorrilla.com">
            <div className="w-9 h-9 rounded-full grid place-items-center text-[12px] font-semibold text-text bg-[linear-gradient(135deg,#4a4a52,#2c2c31)]">
              LC
            </div>
          </Row>
        </Section>

        <Section title="Inteligencia Artificial">
          <Row label="Proveedores de IA" desc="Conecta Claude, ChatGPT, Grok o un endpoint OpenAI-compatible">
            <span className="text-[12px] text-text-faint px-2 py-1 rounded-md bg-white/[0.06]">Próximamente</span>
          </Row>
        </Section>

        <Section title="Marcadores">
          <Row label="Marcadores guardados" desc={`${bookmarks.length} en este perfil`} />
        </Section>

        <Section title="Privacidad">
          <Row label="Borrar datos de navegación" desc="Cookies, almacenamiento local y caché del perfil">
            <button
              onClick={clearData}
              disabled={clearing}
              className="text-[13px] font-medium px-3.5 py-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
            >
              {clearing ? 'Borrando…' : cleared ? 'Listo ✓' : 'Borrar'}
            </button>
          </Row>
        </Section>

        <Section title="Acerca de">
          <Row label="Monper" desc="Navegador agéntico · v0.1.0" />
        </Section>
      </div>
    </div>
  )
}
