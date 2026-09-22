import { useEffect, useRef, useState, type JSX } from 'react'
import type { SkillMeta, SkillDetail } from '@shared/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import IconFolder from '~icons/tabler/folder'
import IconFolderPlus from '~icons/tabler/folder-plus'
import IconPencil from '~icons/tabler/pencil'
import IconChevron from '~icons/tabler/chevron-down'
import IconFileText from '~icons/tabler/file-text'
import IconDots from '~icons/tabler/dots'
import TitanioLogo from '@renderer/components/ui/TitanioLogo'
import SkillIcon from './SkillIcon'
import { MD_COMPONENTS } from './markdown'
import { SettingsHeader, SettingsContent, Button, Toggle } from './ui'

const { titanioTab } = window
const skillRowClass = 'flex items-center gap-2 w-full h-8 pl-3.5 pr-2 text-[13px] text-left'

/** Las skills oficiales usan el logo completo, no texto que imite la marca. */
function Author({ name }: { name: string }): JSX.Element {
  if (name === 'Titanio') {
    return <TitanioLogo height={14} />
  }
  return <>{name}</>
}


export default function SkillsSection(): JSX.Element {
  const [skills, setSkills] = useState<SkillMeta[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [browseOpen, setBrowseOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const dirty = editing && draft !== detail?.source

  useEffect(() => {
    if (!menuOpen) return
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const outside = (event: PointerEvent): void => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus() }
    }
    window.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape) }
  }, [menuOpen])

  const select = (id: string | null): void => {
    if (id === sel || saving) return
    if (dirty && !window.confirm('¿Descartar los cambios sin guardar?')) return
    setEditing(false); setPreview(false); setMenuOpen(false); setError(''); setSel(id)
  }
  const edit = (): void => {
    if (!detail?.source) return
    setDraft(detail.source); setPreview(false); setEditing(true); setMenuOpen(false); setError('')
  }
  const save = async (): Promise<void> => {
    if (!detail || detail.source === undefined || saving || !dirty) return
    setSaving(true); setError('')
    try {
      const updated = await titanioTab.skillsSave(detail.id, draft, detail.source)
      setDetail(updated)
      setSkills((items) => items.map((s) => s.id === updated.id ? updated : s))
      setEditing(false); setPreview(false)
    } catch (e) {
      console.error('[skills] no se pudo guardar:', e)
      setError(e instanceof Error ? e.message : 'No se pudo guardar la skill.')
    } finally { setSaving(false) }
  }
  const openFolder = async (): Promise<void> => {
    if (!detail) return
    setMenuOpen(false)
    try { await titanioTab.skillsOpenFolder(detail.id) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir la carpeta.') }
  }

  // Dos pasadas: pintar ya con los favicons en caché y volver a pedir resolviendo los que
  // falten. Si se esperara a la segunda, la lista tardaría lo que tarde el sitio más lento.
  useEffect(() => {
    let vivo = true
    void titanioTab.skillsList()
      .then((s) => { if (!vivo) return; setSkills(s); setSel((c) => c ?? s[0]?.id ?? null) })
      .then(() => titanioTab.skillsList(true))
      .then((s) => { if (vivo) setSkills(s) })
      .catch((e) => console.error('[skills] no se pudo leer la lista:', e))
    return () => { vivo = false }
  }, [])
  useEffect(() => {
    let live = true
    setDetail(null)
    if (sel) void titanioTab.skillsGet(sel)
      .then((next) => {
        if (!live) return
        setDetail(next)
        if (!next) setError('La skill ya no está disponible.')
      })
      .catch((error) => {
        console.error('[skills] no se pudo cargar el detalle:', error)
        if (live) setError('No se pudo cargar la skill. Inténtalo de nuevo.')
      })
    return () => { live = false }
  }, [sel])

  const toggle = async (id: string, on: boolean): Promise<void> => {
    setSkills(await titanioTab.skillsToggle(id, on))
    setDetail((d) => (d && d.id === id ? { ...d, enabled: on } : d))
  }

  const actionRow = 'flex items-center gap-2.5 w-full h-8 px-2 rounded-md text-[13px] text-text-dim hover:bg-white/[0.04] hover:text-text transition-colors [&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-text-faint'

  return (
    <div className="h-full flex">
      {/* Panel de skills */}
      <div className="w-[268px] shrink-0 border-r border-white/[0.06] flex flex-col">
        <div className="flex items-center justify-between px-3.5 h-12 shrink-0">
          <span className="text-[15px] font-semibold">Skills</span>
          <Button
            onClick={() => titanioTab.openSkillsFolder()}
            title="Abrir la carpeta de skills en Finder"
            className="w-7 h-7 grid place-items-center rounded-md text-text-faint hover:text-text hover:bg-white/[0.06] transition-colors [&>svg]:w-[17px] [&>svg]:h-[17px]"
          >
            <IconFolder />
          </Button>
        </div>
        <div className="px-2.5 pb-2">
          <Button className={actionRow}><IconFolderPlus /> Import from folder</Button>
          <Button className={actionRow}><IconPencil /> Create new skill</Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 [&::-webkit-scrollbar]:w-0">
          <div className="px-2 pt-2 pb-1 text-[11.5px] font-medium text-text-faint">Browse skills</div>

          {/* Carpeta Built-in skills */}
          <Button
            onClick={() => setBrowseOpen((v) => !v)}
            className="flex items-center gap-2 w-full h-8 px-2 rounded-md text-[13px] text-text-dim hover:text-text transition-colors"
          >
            <IconFolder className="w-4 h-4 text-text-faint" />
            <span className="flex-1 text-left">Built-in skills</span>
            <IconChevron className={'w-3.5 h-3.5 text-text-faint transition-transform ' + (browseOpen ? '' : '-rotate-90')} />
          </Button>

          {browseOpen && skills.map((s) => {
            const open = sel === s.id
            return (
              <div key={s.id}>
                <Button
                  onClick={() => select(open ? null : s.id)}
                  disabled={saving}
                  className={
                    skillRowClass + ' ' +
                    (open ? 'text-text' : 'text-text-dim hover:text-text hover:bg-white/[0.03]')
                  }
                >
                  <span className={s.enabled ? '' : 'opacity-45'}><SkillIcon skill={s} /></span>
                  <span className="flex-1 text-left truncate">{s.name}</span>
                  {!s.enabled && <span className="text-[10px] text-text-faint uppercase">off</span>}
                  <IconChevron className={'w-3.5 h-3.5 text-text-faint transition-transform ' + (open ? '' : '-rotate-90')} />
                </Button>
                {open && (
                  <div className="ml-7">
                    <Button onClick={() => select(s.id)} className={`${skillRowClass} bg-white/[0.06] text-text [&>svg]:w-4 [&>svg]:h-4`}>
                      <IconFileText className="text-text-dim" />
                      SKILL.md
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detalle */}
      <div className="flex-1 min-w-0 overflow-y-auto [&::-webkit-scrollbar]:w-0"
        onKeyDown={(event) => {
          if (editing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
            event.preventDefault(); void save()
          }
        }}>
        {detail ? (
          <SettingsContent wide>
            <SettingsHeader
              title={detail.name}
              icon={<SkillIcon skill={skills.find((s) => s.id === detail.id) ?? detail} size="md" />}
              actions={<>
                {editing ? <>
                  <Button variant="ghost" size="sm" disabled={saving} onClick={() => { setEditing(false); setPreview(false); setError('') }}>Cancelar</Button>
                  <Button variant="primary" size="sm" disabled={saving || !dirty || !draft.trim()} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar'}</Button>
                </> : <Button variant="secondary" size="sm" onClick={edit} disabled={detail.source === undefined}><IconPencil /> Editar</Button>}
                <Toggle on={detail.enabled} disabled={saving} onChange={(v) => toggle(detail.id, v)} />
                <div ref={menu} className="relative">
                  <Button ref={menuButton} variant="ghost" size="icon" title="Más opciones" aria-label="Más opciones" aria-haspopup="menu" aria-expanded={menuOpen} disabled={saving} onClick={() => setMenuOpen((open) => !open)}><IconDots /></Button>
                  {menuOpen && (
                    <div role="menu" aria-label="Opciones de la skill" className="absolute right-0 top-full mt-2 z-20 w-52 p-1.5 rounded-2xl [corner-shape:superellipse(1.5)] border border-white/10 bg-[#323239] shadow-xl"
                      onKeyDown={(event) => {
                        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
                        event.preventDefault()
                        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
                        const current = items.indexOf(document.activeElement as HTMLButtonElement)
                        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
                        items[next]?.focus()
                      }}>
                      <Button role="menuitem" disabled={editing || detail.source === undefined} onClick={edit} className={actionRow}><IconPencil /> Editar SKILL.md</Button>
                      <Button role="menuitem" onClick={() => void openFolder()} className={actionRow}><IconFolder /> Abrir carpeta</Button>
                    </div>
                  )}
                </div>
              </>}
            />

            {error && <p role="alert" className="mb-5 text-[13px] text-amber-400">{error}</p>}

            {/* Meta */}
            <div className="flex gap-16 mt-5">
              <div>
                <div className="text-[12px] text-text-faint mb-1">Created by</div>
                <div className="text-[13.5px] text-text-dim"><Author name={detail.author} /></div>
              </div>
              <div>
                <div className="text-[12px] text-text-faint mb-1">Last updated at</div>
                <div className="text-[13.5px] text-text-dim">{detail.updated || '—'}</div>
                {detail.customized && <div className="mt-1 text-[12px] text-text-faint">Personalizada</div>}
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
            {editing ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Button variant={preview ? 'ghost' : 'secondary'} size="sm" aria-pressed={!preview} onClick={() => setPreview(false)}>Código</Button>
                  <Button variant={preview ? 'secondary' : 'ghost'} size="sm" aria-pressed={preview} onClick={() => setPreview(true)}>Vista previa</Button>
                </div>
                {preview ? (
                  <div className="min-h-[440px]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{draft.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')}</ReactMarkdown>
                  </div>
                ) : (
                  <textarea autoFocus aria-label="Contenido de SKILL.md" spellCheck={false} disabled={saving} value={draft} onChange={(event) => setDraft(event.target.value)}
                    className="w-full min-h-[440px] h-[60vh] resize-y rounded-2xl [corner-shape:superellipse(1.5)] border border-white/10 bg-black/20 p-4 text-[13px] leading-relaxed font-mono text-text outline-none focus:border-white/30 select-text" />
                )}
              </div>
            ) : <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{detail.body}</ReactMarkdown>}
          </SettingsContent>
        ) : (
          <div className="h-full grid place-items-center text-text-faint text-[14px]">{error || (sel ? 'Cargando…' : 'Selecciona una skill.')}</div>
        )}
      </div>
    </div>
  )
}
