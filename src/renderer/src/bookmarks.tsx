import { t as tr, useLocale } from '@renderer/lib/i18n'
import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useState, type JSX } from 'react'
import type { Bookmark } from '@shared/types'
import { Select } from '@renderer/components/ui'
import IconSearch from '~icons/tabler/search'
import IconTrash from '~icons/tabler/trash'
import IconPencil from '~icons/tabler/pencil'
import IconWorld from '~icons/tabler/world'
import IconBookmark from '~icons/tabler/bookmark'
import IconFolder from '~icons/tabler/folder'
import IconFolderPlus from '~icons/tabler/folder-plus'
import './styles.css'

const { titanioTab } = window

function dominio(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function Favicon({ src }: { src?: string | null }): JSX.Element {
  useLocale()
  const [roto, setRoto] = useState(false)
  return (
    <span className="w-[22px] h-[22px] rounded-md grid place-items-center bg-white/[0.05] shrink-0 overflow-hidden">
      {src && !roto
        ? <img src={src} alt="" className="w-[15px] h-[15px] object-contain" onError={() => setRoto(true)} />
        : <IconWorld className="w-[15px] h-[15px] text-text-faint" />}
    </span>
  )
}

/** Fila en edición: título y URL. Se guarda con Enter, se cancela con Escape. */
function Editor({ bm, onGuardar, onCancelar }: {
  bm: Bookmark
  onGuardar: (title: string, url: string) => void
  onCancelar: () => void
}): JSX.Element {
  useLocale()
  const [title, setTitle] = useState(bm.title)
  const [url, setUrl] = useState(bm.url)
  const esCarpeta = !!bm.folder
  const campo = 'w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[13.5px] text-text outline-none focus:border-white/30 select-text'
  const teclas = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') onGuardar(title, url)
    else if (e.key === 'Escape') onCancelar()
  }
  return (
    <div className="px-4 py-3 flex flex-col gap-2 bg-white/[0.03]">
      <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={teclas} placeholder={tr("Título")} autoFocus className={campo} />
      {/* Una carpeta no tiene URL: enseñar el campo invitaría a escribir algo que se descarta. */}
      {!esCarpeta && <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={teclas} placeholder="https://…" className={campo} />}
      <div className="flex items-center gap-2">
        <button onClick={() => onGuardar(title, url)} className="h-8 px-3 rounded-lg bg-white/90 text-black text-[12.5px] font-medium hover:bg-white transition-colors">{tr("Guardar")}</button>
        <button onClick={onCancelar} className="h-8 px-3 rounded-lg text-[12.5px] text-text-dim hover:text-text transition-colors">{tr("Cancelar")}</button>
      </div>
    </div>
  )
}

function BookmarksPage(): JSX.Element {
  useLocale()
  const [items, setItems] = useState<Bookmark[]>([])
  const [q, setQ] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Se escucha además de leer: el sidebar y esta página tienen que contar lo mismo, y aquí
  // se puede marcar algo desde otra pestaña mientras esto está abierto.
  useEffect(() => {
    titanioTab.getBookmarks().then(setItems).catch((e) => {
      console.error('[marcadores] no se pudieron leer:', e)
      setError(tr("No se pudieron leer los marcadores."))
    })
    return titanioTab.onBookmarks(setItems)
  }, [])

  const buscando = q.trim().length > 0
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    // Buscando se enseña una lista PLANA: agrupar tres resultados en cinco carpetas esconde lo
    // que has encontrado. Las carpetas no entran en los resultados: no tienen URL que buscar.
    if (!t) return items
    return items.filter((b) => !b.folder && (b.title.toLowerCase().includes(t) || b.url.toLowerCase().includes(t)))
  }, [items, q])

  const carpetas = useMemo(() => items.filter((b) => b.folder), [items])
  const nombreCarpeta = (id?: string | null): string => carpetas.find((c) => c.id === id)?.title ?? ''
  /**
   * Grupos en el orden en que se pintan: primero lo suelto, luego cada carpeta con lo suyo.
   * Una carpeta vacía se enseña igual — si desapareciera al vaciarse, no habría forma de volver
   * a meterle nada ni de borrarla.
   */
  const grupos = useMemo(() => {
    const sueltos = items.filter((b) => !b.folder && !b.parentId)
    return [
      ...(sueltos.length ? [{ carpeta: null as Bookmark | null, hijos: sueltos }] : []),
      ...carpetas.map((c) => ({ carpeta: c, hijos: items.filter((b) => b.parentId === c.id) }))
    ]
  }, [items, carpetas])

  /** Una fila de marcador. `conCarpeta` añade a qué carpeta pertenece (solo al buscar). */
  const fila = (b: Bookmark, conCarpeta: boolean): JSX.Element => (
    editando === b.id ? (
      <Editor
        key={b.id}
        bm={b}
        onGuardar={(t, u) => void guardar(b.id, t, u)}
        onCancelar={() => { setEditando(null); setError('') }}
      />
    ) : (
                  <div key={b.id} className="group/b flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
                    <Favicon src={b.favicon} />
                    <button onClick={() => titanioTab.navigate(b.url)} className="flex-1 min-w-0 text-left" title={b.url}>
                      <span className="block truncate text-[14px] text-text">{b.title}</span>
                      <span className="block truncate text-[12px] text-text-faint">
                        {dominio(b.url)}
                        {conCarpeta && b.parentId && <span className="text-text-faint/70"> · {nombreCarpeta(b.parentId)}</span>}
                      </span>
                    </button>
                    {/* Mover de carpeta con un select y no arrastrando: aquí la lista es larga y
                        arrastrar entre dos secciones lejanas con scroll es peor que elegir. */}
                    {carpetas.length > 0 && (
                      <Select
                        size="sm"
                        value={b.parentId ?? ''}
                        onChange={(e) => titanioTab.moveBookmark(b.id, e.target.value || null)}
                        title={tr("Mover a una carpeta")}
                        aria-label={tr("Mover a una carpeta")}
                        className="shrink-0 max-w-[150px] opacity-0 group-hover/b:opacity-100 focus:opacity-100 [&:open]:opacity-100 transition-opacity"
                      >
                        <option value="">{tr("Sin carpeta")}</option>
                        {carpetas.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                      </Select>
                    )}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/b:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditando(b.id); setError('') }}
                        title={tr("Editar")}
                        className="w-7 h-7 grid place-items-center rounded-md text-text-faint hover:text-text hover:bg-white/[0.08] [&>svg]:w-4 [&>svg]:h-4"
                      >
                        <IconPencil />
                      </button>
                      <button
                        onClick={() => titanioTab.removeBookmark(b.id)}
                        title={tr("Quitar")}
                        className="w-7 h-7 grid place-items-center rounded-md text-text-faint hover:text-red-400 hover:bg-red-500/15 [&>svg]:w-4 [&>svg]:h-4"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
    )
  )

  const nuevaCarpeta = async (): Promise<void> => {
    const f = await titanioTab.newBookmarkFolder(tr("Nueva carpeta"))
    setEditando(f.id)
  }

  const guardar = async (id: string, title: string, url: string): Promise<void> => {
    const r = await titanioTab.updateBookmark(id, { title, url })
    // `null` = la URL no vale. Se dice en vez de cerrar el editor como si se hubiera guardado.
    if (!r) { setError(tr("Esa URL no es válida. Tiene que empezar por http:// o https://")); return }
    setError('')
    setEditando(null)
  }

  return (
    <div className="h-full flex flex-col page-backdrop text-text select-none">
      <header className="shrink-0 px-8 pt-10 pb-5">
        <div className="max-w-[760px] mx-auto">
          <div className="flex items-center justify-between gap-4 mb-5">
            <h1 className="text-[30px] font-semibold tracking-tight">{tr("Marcadores")}</h1>
            <div className="flex items-center gap-3">
              <button
                onClick={() => void nuevaCarpeta()}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[12.5px] text-text transition-colors [&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-text-dim"
              >
                <IconFolderPlus /> {tr("Nueva carpeta")} </button>
              {/* Solo los marcadores: contar las carpetas aquí haría que el número no cuadrara
                  con lo que se ve en el sidebar. */}
              <span className="text-[13px] text-text-faint tabular-nums">{items.filter((b) => !b.folder).length}</span>
            </div>
          </div>
          <div className="relative">
            <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr("Buscar marcadores")}
              autoFocus
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[14px] text-text outline-none focus:border-white/25 placeholder:text-text-faint transition-colors select-text"
            />
          </div>
          {error && <div className="mt-3 text-[12.5px] text-amber-400">{error}</div>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 pb-10 [&::-webkit-scrollbar]:w-0">
        <div className="max-w-[760px] mx-auto">
          {items.length === 0 && (
            <div className="py-20 flex flex-col items-center gap-2 text-center">
              <IconBookmark className="w-6 h-6 text-text-faint" />
              <div className="text-[13.5px] text-text-dim">{tr("Todavía no hay marcadores")}</div>
            </div>
          )}

          {items.length > 0 && filtrados.length === 0 && (
            <div className="py-16 text-center text-[13.5px] text-text-dim">{tr("Nada coincide con “")}{q.trim()}”</div>
          )}

          {buscando && filtrados.length > 0 && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05] overflow-hidden">
              {filtrados.map((b) => fila(b, true))}
            </div>
          )}

          {!buscando && grupos.map(({ carpeta, hijos }) => (
            <div key={carpeta?.id ?? '__raiz__'} className="mb-5">
              {carpeta && (
                editando === carpeta.id ? (
                  <div className="rounded-2xl border border-white/[0.07] overflow-hidden mb-1">
                    <Editor
                      bm={carpeta}
                      onGuardar={(t) => void guardar(carpeta.id, t, carpeta.url)}
                      onCancelar={() => { setEditando(null); setError('') }}
                    />
                  </div>
                ) : (
                  <div className="group/c flex items-center gap-2 px-1 pb-1.5">
                    <IconFolder className="w-[15px] h-[15px] text-text-faint shrink-0" />
                    <span className="text-[13px] font-semibold text-text-dim truncate">{carpeta.title}</span>
                    <span className="text-[12px] text-text-faint shrink-0">{hijos.length}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover/c:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditando(carpeta.id); setError('') }}
                        title={tr("Renombrar carpeta")}
                        className="w-6 h-6 grid place-items-center rounded-md text-text-faint hover:text-text hover:bg-white/[0.08] [&>svg]:w-3.5 [&>svg]:h-3.5"
                      >
                        <IconPencil />
                      </button>
                      <button
                        onClick={() => titanioTab.removeBookmark(carpeta.id)}
                        title={tr("Borrar la carpeta (sus marcadores vuelven a la raíz)")}
                        className="w-6 h-6 grid place-items-center rounded-md text-text-faint hover:text-red-400 hover:bg-red-500/15 [&>svg]:w-3.5 [&>svg]:h-3.5"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                )
              )}
              {hijos.length > 0 ? (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05] overflow-hidden">
                  {hijos.map((b) => fila(b, false))}
                </div>
              ) : (
                carpeta && <div className="px-4 py-3 rounded-2xl border border-dashed border-white/[0.08] text-[12.5px] text-text-faint">{tr("Carpeta vacía")}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<BookmarksPage />)
