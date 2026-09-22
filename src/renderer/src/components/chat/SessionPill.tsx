import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useEffect, useRef, useState, type JSX } from 'react'
import type { ChatSessionMeta } from '@shared/types'
import { PopoverRow, PopoverDivider, PopoverList } from '@renderer/components/popover'
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
        <div className="chat-sessions absolute left-0 top-9 z-50 w-[320px] max-w-[calc(100vw-32px)] backdrop-blur-md overflow-hidden">
          <PopoverRow
            icon={<IconPlus />}
            label={tr("New chat")}
            onClick={() => { setOpen(false); onNew() }}
          />

          {sessions.length > 0 && (
            <>
              <PopoverDivider />
              <PopoverList>
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="group/s relative"
                  >
                    <PopoverRow
                      icon={<IconMessage />}
                      label={s.title}
                      active={s.id === currentId}
                      onClick={() => { setOpen(false); onOpen(s.id) }}
                      meta={<span className="group-hover/s:invisible group-focus-within/s:invisible">{hace(s.updatedAt)}</span>}
                    />
                    <button
                      onClick={() => onRemove(s.id)}
                      title={tr("Borrar conversación")}
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/s:opacity-100 group-focus-within/s:opacity-100 focus-visible:opacity-100 grid place-items-center w-6 h-6 rounded-md text-text-faint hover:text-red-400 hover:bg-red-500/15 [&>svg]:w-4 [&>svg]:h-4"
                    >
                      <IconTrash />
                    </button>
                  </div>
                ))}
              </PopoverList>
            </>
          )}
        </div>
      )}
    </div>
  )
}
