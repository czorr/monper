import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { HistoryEntryInfo } from '@shared/types'
import IconSearch from '~icons/tabler/search'
import IconTrash from '~icons/tabler/trash'
import IconWorld from '~icons/tabler/world'
import IconHistory from '~icons/tabler/history'
import './styles.css'

const { titanioTab } = window

const PAGINA = 100

/** "Hoy", "Ayer" o la fecha larga: agrupar por día es como la gente recuerda dónde estuvo. */
function etiquetaDeDia(ms: number): string {
  const d = new Date(ms)
  const hoy = new Date()
  const ayer = new Date(hoy.getTime() - 86_400_000)
  const mismoDia = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (mismoDia(d, hoy)) return 'Hoy'
  if (mismoDia(d, ayer)) return 'Ayer'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === hoy.getFullYear() ? undefined : 'numeric' })
}

const hora = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

function dominio(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function Favicon({ src }: { src?: string | null }): JSX.Element {
  const [roto, setRoto] = useState(false)
  return (
    <span className="w-[22px] h-[22px] rounded-md grid place-items-center bg-white/[0.05] shrink-0 overflow-hidden">
      {src && !roto
        ? <img src={src} alt="" className="w-[15px] h-[15px] object-contain" onError={() => setRoto(true)} />
        : <IconWorld className="w-[15px] h-[15px] text-text-faint" />}
    </span>
  )
}

function HistoryPage(): JSX.Element {
  const [q, setQ] = useState('')
  const [entries, setEntries] = useState<HistoryEntryInfo[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const peticion = useRef(0)

  /**
   * Cada carga lleva número. Sin esto, teclear rápido en el buscador deja respuestas viejas
   * llegando después de las nuevas y la lista muestra resultados de una consulta anterior.
   */
  const cargar = useCallback(async (consulta: string, desde: number): Promise<void> => {
    const mio = ++peticion.current
    setCargando(true)
    try {
      const r = await titanioTab.browseHistory(consulta, desde, PAGINA)
      if (mio !== peticion.current) return
      setEntries((prev) => (desde === 0 ? r.entries : [...prev, ...r.entries]))
      setTotal(r.total)
      setError('')
    } catch (e) {
      if (mio !== peticion.current) return
      console.error('[historial] no se pudo leer:', e)
      setError('No se pudo leer el historial.')
    } finally {
      if (mio === peticion.current) setCargando(false)
    }
  }, [])

  // Se espera a que dejes de teclear: cada pulsación recorre el historial entero en el main.
  useEffect(() => {
    const t = setTimeout(() => void cargar(q, 0), 150)
    return () => clearTimeout(t)
  }, [q, cargar])

  const borrar = async (url: string): Promise<void> => {
    // Optimista: la fila desaparece al instante y el main es la fuente de verdad.
    setEntries((prev) => prev.filter((e) => e.url !== url))
    setTotal((t) => Math.max(0, t - 1))
    await titanioTab.removeHistoryEntry(url)
  }

  const borrarTodo = async (): Promise<void> => {
    if (!confirm('¿Borrar todo el historial? No se puede deshacer.')) return
    await titanioTab.clearHistory()
    void cargar(q, 0)
  }

  // Se agrupa por día en el renderer y no en el main: el main devuelve una lista ordenada y
  // paginada, y quién es "hoy" depende de la zona horaria de quien mira.
  const grupos: { dia: string; items: HistoryEntryInfo[] }[] = []
  for (const e of entries) {
    const dia = etiquetaDeDia(e.lastVisit)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.dia === dia) ultimo.items.push(e)
    else grupos.push({ dia, items: [e] })
  }

  return (
    <div className="h-full flex flex-col page-backdrop text-text select-none">
      <header className="shrink-0 px-8 pt-10 pb-5">
        <div className="max-w-[760px] mx-auto">
          <div className="flex items-center justify-between gap-4 mb-5">
            <h1 className="text-[30px] font-semibold tracking-tight">Historial</h1>
            {total > 0 && (
              <button
                onClick={borrarTodo}
                className="shrink-0 text-[13px] font-medium px-3.5 py-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
              >
                Borrar todo
              </button>
            )}
          </div>
          <div className="relative">
            <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar en el historial"
              autoFocus
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[14px] text-text outline-none focus:border-white/25 placeholder:text-text-faint transition-colors select-text"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 pb-10 [&::-webkit-scrollbar]:w-0">
        <div className="max-w-[760px] mx-auto">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[13px] text-amber-300">{error}</div>
          )}

          {!error && entries.length === 0 && !cargando && (
            <div className="py-20 flex flex-col items-center gap-2 text-center">
              <IconHistory className="w-6 h-6 text-text-faint" />
              <div className="text-[13.5px] text-text-dim">
                {q ? `Nada coincide con “${q.trim()}”` : 'Todavía no hay historial'}
              </div>
            </div>
          )}

          {grupos.map((g) => (
            <section key={g.dia} className="mb-7">
              <h2 className="text-[12px] font-medium text-text-faint uppercase tracking-[0.6px] mb-2 first-letter:uppercase">{g.dia}</h2>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05] overflow-hidden">
                {g.items.map((e) => (
                  <div key={e.url} className="group/h flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
                    <span className="text-[12px] text-text-faint tabular-nums w-[42px] shrink-0">{hora(e.lastVisit)}</span>
                    <Favicon src={e.favicon} />
                    <button
                      onClick={() => titanioTab.navigate(e.url)}
                      className="flex-1 min-w-0 text-left"
                      title={e.url}
                    >
                      <span className="block truncate text-[14px] text-text">{e.title || dominio(e.url)}</span>
                      <span className="block truncate text-[12px] text-text-faint">{dominio(e.url)}</span>
                    </button>
                    <button
                      onClick={() => borrar(e.url)}
                      title="Quitar del historial"
                      className="shrink-0 w-7 h-7 grid place-items-center rounded-md text-text-faint opacity-0 group-hover/h:opacity-100 hover:text-red-400 hover:bg-red-500/15 transition-colors [&>svg]:w-4 [&>svg]:h-4"
                    >
                      <IconTrash />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {entries.length < total && (
            <button
              onClick={() => void cargar(q, entries.length)}
              disabled={cargando}
              className="w-full h-10 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-[13px] text-text-dim hover:text-text transition-colors disabled:opacity-50"
            >
              {cargando ? 'Cargando…' : `Ver más (${total - entries.length} restantes)`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<HistoryPage />)
