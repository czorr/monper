import { t as tr, useLocale, getLocale } from '@renderer/lib/i18n'
import { useCallback, useEffect, useState, type JSX } from 'react'
import type { ChatSessionBusqueda } from '@shared/types'
import IconSearch from '~icons/tabler/search'
import IconMessage from '~icons/tabler/message'
import IconArchive from '~icons/tabler/archive'
import IconArchiveOff from '~icons/tabler/archive-off'
import IconPencil from '~icons/tabler/pencil'
import IconTrash from '~icons/tabler/trash'
import IconArrowBack from '~icons/tabler/arrow-back-up'
import { Card, SettingsHeader, Button } from './ui'

const { titanioTab } = window

/** "hace 5 min", "ayer"… Misma escala que el desplegable del panel, para que no se contradigan. */
function hace(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return tr('ahora')
  const m = Math.round(s / 60)
  if (m < 60) return tr("hace {0} min", m)
  const h = Math.round(m / 60)
  if (h < 24) return tr("hace {0} h", h)
  const d = Math.round(h / 24)
  if (d === 1) return tr('ayer')
  if (d < 30) return tr("hace {0} días", d)
  return new Date(ms).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

function Fila({ s, onLista }: { s: ChatSessionBusqueda; onLista: (l: ChatSessionBusqueda[]) => void }): JSX.Element {
  useLocale()
  const [editando, setEditando] = useState(false)
  const [titulo, setTitulo] = useState(s.title)

  const guardar = async (): Promise<void> => {
    const t = titulo.trim()
    // Sin título la fila queda en blanco: se deja el que había.
    if (!t) { setTitulo(s.title); setEditando(false); return }
    onLista(await titanioTab.chatsRename(s.id, t))
    setEditando(false)
  }

  if (editando) {
    return (
      <div className="px-4 py-3 flex items-center gap-2 bg-white/[0.03]">
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') void guardar(); if (e.key === 'Escape') { setTitulo(s.title); setEditando(false) } }}
          className="flex-1 h-8 px-2.5 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[13.5px] text-text outline-none focus:border-white/30 select-text"
        />
        <Button variant="primary" size="sm" onClick={() => void guardar()}>{tr("Guardar")}</Button>
        <Button variant="ghost" size="sm" onClick={() => { setTitulo(s.title); setEditando(false) }}>{tr("Cancelar")}</Button>
      </div>
    )
  }

  return (
    <div className="group/c flex items-center gap-3.5 px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <span className="w-8 h-8 rounded-lg grid place-items-center bg-white/[0.05] text-text-dim shrink-0">
        {s.archived ? <IconArchive className="w-[17px] h-[17px]" /> : <IconMessage className="w-[17px] h-[17px]" />}
      </span>

      {/* Toda la fila retoma la conversación: es lo que uno quiere el 90% de las veces, y
          obligarle a apuntar a un botón de 32px para el caso normal es pedirle puntería. */}
      <Button onClick={() => titanioTab.chatsResume(s.id)} className="flex-1 min-w-0 text-left" title={tr("Retomar esta conversación")}>
        <div className="text-[14px] text-text leading-tight truncate">{s.title}</div>
        <div className="text-[12.5px] text-text-dim mt-0.5 truncate">
          {hace(s.updatedAt)} · {s.count} {s.count === 1 ? 'mensaje' : 'mensajes'}
        </div>
        {/* El fragmento solo aparece al buscar: es lo que explica POR QUÉ salió este resultado
            cuando la coincidencia no está en el título. */}
        {s.snippet && <div className="text-[12.5px] text-text-faint mt-1 line-clamp-2">{s.snippet}</div>}
      </Button>

      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/c:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" onClick={() => titanioTab.chatsResume(s.id)} title={tr("Retomar")}>
          <IconArrowBack />
        </Button>
        <Button variant="ghost" size="icon"
          onClick={async () => onLista(await titanioTab.chatsArchive(s.id, !s.archived))}
          title={s.archived ? tr("Desarchivar") : tr("Archivar")}
        >
          {s.archived ? <IconArchiveOff /> : <IconArchive />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setEditando(true)} title={tr("Renombrar")}>
          <IconPencil />
        </Button>
        <Button variant="danger-ghost" size="icon" onClick={async () => onLista(await titanioTab.chatsDelete(s.id))} title={tr("Borrar")}>
          <IconTrash />
        </Button>
      </div>
    </div>
  )
}

/**
 * Settings → Archived chats.
 *
 * El desplegable del panel lista las últimas conversaciones y poco más: no busca, no archiva y
 * no cabe. Aquí se pueden encontrar, retomar, renombrar y archivar.
 *
 * **Se busca en el CONTENIDO, no solo en el título.** El título sale del primer mensaje, así que
 * buscar solo por él encuentra conversaciones por cómo EMPEZARON — y lo que uno recuerda al
 * querer retomar algo es de qué acabaron tratando.
 */
export default function ArchivedChatsSection(): JSX.Element {
  useLocale()
  const [lista, setLista] = useState<ChatSessionBusqueda[]>([])
  const [q, setQ] = useState('')
  const [verArchivadas, setVerArchivadas] = useState(true)
  const [error, setError] = useState('')

  const buscar = useCallback(async (texto: string, incluir: boolean): Promise<void> => {
    try {
      setLista(await titanioTab.chatsSearch(texto, incluir))
      setError('')
    } catch (e) {
      console.error('[chats] no se pudo leer el historial:', e)
      setError(tr("No se pudieron cargar las conversaciones. Reinicia Titanio e inténtalo de nuevo."))
    }
  }, [])
  useEffect(() => { void buscar(q, verArchivadas) }, [buscar, q, verArchivadas])

  const activas = lista.filter((s) => !s.archived)
  const archivadas = lista.filter((s) => s.archived)

  return (
    <div>
      <SettingsHeader
        title={tr("Chats")}
        description={tr("Busca, retoma y organiza tus conversaciones.")}
        actions={<span className="text-[13px] text-text-faint tabular-nums">{lista.length}</span>}
      />

      {error && <div className="mb-5 text-[12.5px] text-amber-400">{error}</div>}

      <div className="relative mb-3">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("Buscar en tus conversaciones")}
          className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13.5px] text-text outline-none focus:border-white/25 placeholder:text-text-faint transition-colors select-text"
        />
      </div>

      <label className="flex items-center gap-2 mb-5 text-[12.5px] text-text-dim cursor-pointer select-none">
        <input type="checkbox" checked={verArchivadas} onChange={(e) => setVerArchivadas(e.target.checked)} className="accent-white/80" />
        {tr("Incluir las archivadas")} </label>

      {lista.length === 0 && (
        <div className="py-16 flex flex-col items-center gap-2 text-center">
          <IconMessage className="w-6 h-6 text-text-faint" />
          <div className="text-[13.5px] text-text-dim">
            {q.trim() ? tr("No hay resultados para “{0}”", q.trim()) : tr("No hay conversaciones guardadas")}
          </div>
        </div>
      )}

      {activas.length > 0 && (
        <section className="mb-9">
          <h2 className="text-[13px] font-medium text-text-faint mb-3">{tr("Conversaciones")}</h2>
          <Card>{activas.map((s) => <Fila key={s.id} s={s} onLista={setLista} />)}</Card>
        </section>
      )}

      {archivadas.length > 0 && (
        <section className="mb-9">
          <h2 className="text-[13px] font-medium text-text-faint mb-3">{tr("Archivadas")}</h2>
          <Card>{archivadas.map((s) => <Fila key={s.id} s={s} onLista={setLista} />)}</Card>
          <p className="text-[12.5px] text-text-faint mt-3 leading-relaxed">
            {tr("El historial conserva las 200 conversaciones más recientes. Las archivadas quedan fuera de ese límite y no aparecen en el menú del chat.")} </p>
        </section>
      )}
    </div>
  )
}
