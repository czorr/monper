import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useEffect, useRef, useState, type JSX } from 'react'
import type { ChatSessionMeta } from '@shared/types'
import IconPlus from '~icons/tabler/plus'
import IconChevron from '~icons/tabler/chevron-down'
import IconMessage from '~icons/tabler/message'
import IconTrash from '~icons/tabler/trash'

/**
 * Pill del header del chat: abre conversación nueva y lista las anteriores.
 *
 * Es un dropdown de DOM normal, no una ventana nativa, y puede serlo porque vive DENTRO del
 * panel de chat: ese ancho es chrome, no está tapado por la vista de la página. Si algún día
 * se sale del panel, deja de verse (la vista nativa dibuja encima) y habrá que pasarlo a
 * `createPopover`.
 */

interface Props {
  sessions: ChatSessionMeta[]
  currentId: string
  onNew: () => void
  onOpen: (id: string) => void
  onRemove: (id: string) => void
  /** Se pide la lista al abrir: así no hace falta mantenerla sincronizada. */
  onRefresh: () => void
}

/** "hace 5 min", "ayer"… sin dependencias. */
function hace(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return tr('ahora')
  const m = Math.round(s / 60)
  if (m < 60) return tr("hace {0} min", m)
  const h = Math.round(m / 60)
  if (h < 24) return tr("hace {0} h", h)
  const d = Math.round(h / 24)
  return d === 1 ? tr('ayer') : tr("hace {0} días", d)
}

export default function SessionPill({ sessions, currentId, onNew, onOpen, onRemove, onRefresh }: Props): JSX.Element {
  useLocale()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Cerrar al clicar fuera o con Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const actual = sessions.find((s) => s.id === currentId)

  return (
    <div ref={box} className="relative [-webkit-app-region:no-drag]">
      <button
        onClick={() => { if (!open) onRefresh(); setOpen((v) => !v) }}
        title={tr("Conversaciones")}
        className="flex items-center gap-1 h-7 pl-2.5 pr-2 rounded-full text-[13px] font-medium text-text-dim hover:text-text hover:bg-bg-hover transition-colors max-w-[240px]"
      >
        <span className="truncate">{actual?.title ?? tr("New chat")}</span>
        <IconChevron className="w-3.5 h-3.5 shrink-0 opacity-70" />
      </button>

      {open && (
        <div className="chat-sessions absolute left-0 top-9 z-50 w-[320px] max-w-[calc(100vw-32px)] rounded-2xl border border-white/10 bg-[#1c1c20]/95 backdrop-blur-md shadow-2xl shadow-black/50 p-1.5 overflow-hidden">
          <button
            onClick={() => { setOpen(false); onNew() }}
            className="flex items-center gap-3 w-full h-9 px-2.5 rounded-lg text-[13.5px] text-left text-text hover:bg-white/[0.08] transition-colors [&>svg]:w-[18px] [&>svg]:h-[18px]"
          >
            <IconPlus /> {tr("New chat")} </button>

          {sessions.length > 0 && (
            <>
              <div className="h-px bg-white/[0.07] mx-1.5 my-1" />
              <div className="max-h-[320px] overflow-y-auto [&::-webkit-scrollbar]:w-0">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={
                      'group/s flex items-center gap-2.5 w-full h-9 pl-2.5 pr-1.5 rounded-lg text-[13.5px] transition-colors ' +
                      (s.id === currentId ? 'bg-white/[0.10] text-text' : 'text-text-dim hover:bg-white/[0.06] hover:text-text')
                    }
                  >
                    <IconMessage className="w-[18px] h-[18px] shrink-0 text-text-faint" />
                    <button onClick={() => { setOpen(false); onOpen(s.id) }} className="flex-1 min-w-0 text-left truncate">
                      {s.title}
                    </button>
                    <span className="shrink-0 text-[11.5px] text-text-faint group-hover/s:hidden">{hace(s.updatedAt)}</span>
                    <button
                      onClick={() => onRemove(s.id)}
                      title={tr("Borrar conversación")}
                      className="hidden group-hover/s:grid place-items-center w-6 h-6 shrink-0 rounded-md text-text-faint hover:text-red-400 hover:bg-red-500/15 [&>svg]:w-4 [&>svg]:h-4"
                    >
                      <IconTrash />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
