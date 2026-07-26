import { useEffect, useState, type JSX } from 'react'
import type { SkillMeta, SkillDetail } from '@shared/types'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import IconFolder from '~icons/tabler/folder'
import IconFolderPlus from '~icons/tabler/folder-plus'
import IconPencil from '~icons/tabler/pencil'
import IconChevron from '~icons/tabler/chevron-down'
import IconFileText from '~icons/tabler/file-text'
import IconDots from '~icons/tabler/dots'
import logo from '@renderer/assets/monper.png'
import SkillIcon from './SkillIcon'

const { monperTab } = window

/** Renderiza un autor; si es "Monper", antepone el iso pequeño con opacity-80. */
function Author({ name }: { name: string }): JSX.Element {
  if (name === 'Monper') {
    return <span className="inline-flex items-center gap-1.5"><img src={logo} alt="" className="w-4 h-4 object-contain opacity-80" />Monper</span>
  }
  return <>{name}</>
}

const MD: Components = {
  p: ({ children }) => <p className="my-3 leading-relaxed text-[13.5px] text-text-dim">{children}</p>,
  h1: ({ children }) => <h1 className="mt-6 mb-3 text-[18px] font-semibold text-text">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-6 mb-2 text-[15px] font-semibold text-text">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-1.5 text-[14px] font-semibold text-text">{children}</h3>,
  ul: ({ children }) => <ul className="my-3 pl-5 list-disc marker:text-text-faint space-y-1.5 text-[13.5px] text-text-dim">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 pl-5 list-decimal marker:text-text-faint space-y-1.5 text-[13.5px] text-text-dim">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
  a: ({ children, href }) => <a onClick={(e) => { e.preventDefault(); if (href) monperTab.navigate(href) }} className="text-sky-400 hover:underline cursor-pointer">{children}</a>,
  code: ({ className, children }) => {
    if (!className) return <code className="px-1.5 py-0.5 rounded-[5px] bg-white/[0.07] text-[12.5px] font-mono text-text">{children}</code>
    return <code className="block text-[12.5px] font-mono leading-relaxed text-text">{children}</code>
  },
  pre: ({ children }) => <pre className="my-3 p-4 rounded-xl bg-[#0d0d10] border border-white/[0.06] overflow-x-auto [&::-webkit-scrollbar]:h-1.5">{children}</pre>,
  hr: () => <hr className="my-6 border-white/[0.06]" />
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      onClick={() => onChange(!on)}
      className={'w-9 h-5 rounded-full shrink-0 relative transition-colors ' + (on ? 'bg-emerald-500/90' : 'bg-white/15')}
    >
      <span className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ' + (on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

export default function SkillsSection(): JSX.Element {
  const [skills, setSkills] = useState<SkillMeta[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [browseOpen, setBrowseOpen] = useState(true)

  // Dos pasadas: pintar ya con los favicons en caché y volver a pedir resolviendo los que
  // falten. Si se esperara a la segunda, la lista tardaría lo que tarde el sitio más lento.
  useEffect(() => {
    let vivo = true
    void monperTab.skillsList()
      .then((s) => { if (!vivo) return; setSkills(s); setSel((c) => c ?? s[0]?.id ?? null) })
      .then(() => monperTab.skillsList(true))
      .then((s) => { if (vivo) setSkills(s) })
      .catch((e) => console.error('[skills] no se pudo leer la lista:', e))
    return () => { vivo = false }
  }, [])
  useEffect(() => { if (sel) monperTab.skillsGet(sel).then(setDetail); else setDetail(null) }, [sel])

  const toggle = async (id: string, on: boolean): Promise<void> => {
    setSkills(await monperTab.skillsToggle(id, on))
    setDetail((d) => (d && d.id === id ? { ...d, enabled: on } : d))
  }

  const actionRow = 'flex items-center gap-2.5 w-full h-8 px-2 rounded-md text-[13px] text-text-dim hover:bg-white/[0.04] hover:text-text transition-colors [&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-text-faint'

  return (
    <div className="h-full flex">
      {/* Panel de skills */}
      <div className="w-[268px] shrink-0 border-r border-white/[0.06] flex flex-col">
        <div className="flex items-center justify-between px-3.5 h-12 shrink-0">
          <span className="text-[15px] font-semibold">Skills</span>
          <button
            onClick={() => monperTab.openSkillsFolder()}
            title="Abrir la carpeta de skills en Finder"
            className="w-7 h-7 grid place-items-center rounded-md text-text-faint hover:text-text hover:bg-white/[0.06] transition-colors [&>svg]:w-[17px] [&>svg]:h-[17px]"
          >
            <IconFolder />
          </button>
        </div>
        <div className="px-2.5 pb-2">
          <button className={actionRow}><IconFolderPlus /> Import from folder</button>
          <button className={actionRow}><IconPencil /> Create new skill</button>
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 [&::-webkit-scrollbar]:w-0">
          <div className="px-2 pt-2 pb-1 text-[11.5px] font-medium text-text-faint">Browse skills</div>

          {/* Carpeta Built-in skills */}
          <button
            onClick={() => setBrowseOpen((v) => !v)}
            className="flex items-center gap-2 w-full h-8 px-2 rounded-md text-[13px] text-text-dim hover:text-text transition-colors"
          >
            <IconFolder className="w-4 h-4 text-text-faint" />
            <span className="flex-1 text-left">Built-in skills</span>
            <IconChevron className={'w-3.5 h-3.5 text-text-faint transition-transform ' + (browseOpen ? '' : '-rotate-90')} />
          </button>

          {browseOpen && skills.map((s) => {
            const open = sel === s.id
            return (
              <div key={s.id}>
                <button
                  onClick={() => setSel(open ? null : s.id)}
                  className={
                    'flex items-center gap-2 w-full h-8 pl-3.5 pr-2 rounded-md text-[13px] transition-colors ' +
                    (open ? 'text-text' : 'text-text-dim hover:text-text hover:bg-white/[0.03]')
                  }
                >
                  <span className={s.enabled ? '' : 'opacity-45'}><SkillIcon skill={s} /></span>
                  <span className="flex-1 text-left truncate">{s.name}</span>
                  {!s.enabled && <span className="text-[10px] text-text-faint uppercase">off</span>}
                  <IconChevron className={'w-3.5 h-3.5 text-text-faint transition-transform ' + (open ? '' : '-rotate-90')} />
                </button>
                {open && (
                  <div className="flex items-center gap-2 h-8 ml-7 mr-0 px-2 rounded-md bg-white/[0.06] text-[13px] text-text [&>svg]:w-4 [&>svg]:h-4">
                    <IconFileText className="text-text-dim" />
                    SKILL.md
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detalle */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-0">
        {detail ? (
          <div className="px-8 py-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <SkillIcon skill={detail} size="md" />
                <h1 className="text-[20px] font-semibold tracking-tight truncate">{detail.name}</h1>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Toggle on={detail.enabled} onChange={(v) => toggle(detail.id, v)} />
                <button className="w-7 h-7 grid place-items-center rounded-md text-text-faint hover:text-text hover:bg-white/[0.06] [&>svg]:w-[18px] [&>svg]:h-[18px]"><IconDots /></button>
              </div>
            </div>

            {/* Meta */}
            <div className="flex gap-16 mt-5">
              <div>
                <div className="text-[12px] text-text-faint mb-1">Created by</div>
                <div className="text-[13.5px] text-text-dim"><Author name={detail.author} /></div>
              </div>
              <div>
                <div className="text-[12px] text-text-faint mb-1">Last updated at</div>
                <div className="text-[13.5px] text-text-dim">{detail.updated || '—'}</div>
              </div>
            </div>

            {/* Descripción */}
            <div className="mt-5">
              <div className="text-[12px] text-text-faint mb-1.5">Description</div>
              <p className="text-[13.5px] text-text-dim leading-relaxed max-w-[720px]">{detail.description}</p>
            </div>

            {/* Keywords */}
            {detail.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {detail.keywords.map((k) => (
                  <span key={k} className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[12px] text-text">
                    <span className="text-text-faint">Keyword</span> {k}
                  </span>
                ))}
              </div>
            )}

            <div className="h-px bg-white/[0.06] my-6" />
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{detail.body}</ReactMarkdown>
          </div>
        ) : (
          <div className="h-full grid place-items-center text-text-faint text-[14px]">Selecciona una skill.</div>
        )}
      </div>
    </div>
  )
}
