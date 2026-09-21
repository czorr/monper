import { useEffect, useState, type JSX } from 'react'
import type { WidgetInfo } from '@shared/types'
import IconWorld from '~icons/tabler/world'
import IconX from '~icons/tabler/x'
import IconArrowUpRight from '~icons/tabler/arrow-up-right'
import IconArrowDownRight from '~icons/tabler/arrow-down-right'
import IconRefresh from '~icons/tabler/refresh'
import IconPlus from '~icons/tabler/plus'

const { titanioTab } = window

/**
 * Los widgets del new tab: el DATO del sitio pintado como tarjeta nativa.
 *
 * Todo se dibuja en SVG a mano — no hay librería de gráficos, y no hace falta: una sparkline
 * es un `path` y un anillo es un `circle` con `stroke-dasharray`. Meter una dependencia de
 * charts por esto engordaría el bundle (que se mide, ver docs/rendimiento.md) para dibujar
 * cuatro líneas.
 */

const VERDE = '#34d399'
const ROJO = '#f87171'

function Favicon({ src, size = 14 }: { src: string | null; size?: number }): JSX.Element {
  const [roto, setRoto] = useState(false)
  if (!src || roto) return <IconWorld className="text-text-faint shrink-0" style={{ width: size, height: size }} />
  return <img src={src} alt="" onError={() => setRoto(true)} className="rounded-[3px] shrink-0 object-contain" style={{ width: size, height: size }} />
}

function hace(ms: number): string {
  if (!ms) return ''
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`
}

/** Normaliza la serie a 0..1 y devuelve puntos en un viewBox de 100×100. */
function puntos(serie: number[]): { x: number; y: number }[] {
  const min = Math.min(...serie)
  const max = Math.max(...serie)
  // Una serie plana dividiría por cero: se pinta en el centro, que es lo que significa.
  const rango = max - min || 1
  return serie.map((v, i) => ({
    x: (i / Math.max(1, serie.length - 1)) * 100,
    y: 100 - ((v - min) / rango) * 100
  }))
}

function Sparkline({ serie, color }: { serie: number[]; color: string }): JSX.Element {
  const p = puntos(serie)
  const linea = p.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ')
  const area = `${linea} L100,100 L0,100 Z`
  const id = `g-${color.slice(1)}`
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      {/* vectorEffect: sin él, el escalado no uniforme del viewBox deforma el grosor. */}
      <path d={linea} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function Barras({ serie, color }: { serie: number[]; color: string }): JSX.Element {
  const max = Math.max(...serie) || 1
  // Se destacan las barras por encima de la media: es lo que hace legible un gráfico de barras
  // pequeño — sin eso son quince rectángulos grises indistinguibles.
  const media = serie.reduce((a, b) => a + b, 0) / serie.length
  return (
    <div className="flex items-end gap-[3px] w-full h-full">
      {serie.slice(-16).map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-full min-h-[3px]"
          style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: v > media ? color : 'rgba(255,255,255,0.14)' }}
        />
      ))}
    </div>
  )
}

function Anillo({ pct, color }: { pct: number; color: string }): JSX.Element {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 64 64" className="w-[64px] h-[64px] -rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="6" />
      <circle
        cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
      />
    </svg>
  )
}

/** Ejemplos que enseñan la forma de la petición sin llenar la pantalla de texto. */
const EJEMPLOS = ['el precio del bitcoin', 'mis PRs pendientes en GitHub', 'el clima en Monterrey', 'el próximo partido de Rayados']

export default function Widgets(): JSX.Element {
  const [widgets, setWidgets] = useState<WidgetInfo[]>([])
  const [pidiendo, setPidiendo] = useState(false)
  const [texto, setTexto] = useState('')

  useEffect(() => {
    void titanioTab.widgetsList().then(setWidgets)
    // Abrir el new tab ES el momento de refrescar: es cuando se miran.
    titanioTab.widgetsRefresh()
    return titanioTab.onWidgets(setWidgets)
  }, [])

  const pedir = (): void => {
    const t = texto.trim()
    if (!t) { setPidiendo(false); return }
    titanioTab.widgetsAsk(t)
    setTexto('')
    setPidiendo(false)
  }

  const abrir = (w: WidgetInfo, url?: string): void => {
    titanioTab.widgetsSeen(w.id)
    titanioTab.navigate(url ?? w.url)
  }

  const cuerpo = (w: WidgetInfo): JSX.Element => {
    if (w.error) {
      return (
        <div className="flex-1 flex flex-col justify-center gap-2 px-4">
          <span title={w.error} className="text-[12px] text-text-dim leading-snug line-clamp-3">{w.error}</span>
          <button
            onClick={() => titanioTab.widgetsRetry(w.id)}
            className="self-start flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-[12px] text-text transition-colors"
          >
            <IconRefresh className="w-3.5 h-3.5" /> Reintentar
          </button>
        </div>
      )
    }
    if (w.creando || !w.datos) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-2.5 px-4">
          <span className="w-5 h-5 rounded-full border-2 border-white/15 border-t-white/50 animate-spin" />
          {/* Qué se está construyendo: un spinner solo no dice si acertó con lo que pediste. */}
          {w.peticion && <span className="text-[11.5px] text-text-faint text-center line-clamp-2">{w.peticion}</span>}
        </div>
      )
    }

    if (w.datos.tipo === 'metrica') {
      const d = w.datos
      const color = d.delta?.signo === 'baja' ? ROJO : VERDE
      const Flecha = d.delta?.signo === 'baja' ? IconArrowDownRight : IconArrowUpRight
      return (
        <button onClick={() => abrir(w)} className="flex-1 flex flex-col px-4 pt-3 text-left min-h-0">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="text-[28px] font-semibold tracking-[-0.5px] text-text leading-none">{d.valor}</span>
            {d.delta && (
              <span className="flex items-center gap-1 text-[12.5px] font-medium" style={{ color: d.delta.signo === 'neutro' ? undefined : color }}>
                {d.delta.signo !== 'neutro' && <Flecha className="w-3.5 h-3.5" />}
                {d.delta.texto}
              </span>
            )}
          </div>
          {d.etiqueta && <span className="mt-1 text-[12px] text-text-dim truncate">{d.etiqueta}</span>}
          {d.serie && (
            <div className="flex-1 min-h-[34px] mt-2 mb-1">
              {d.forma === 'barras' ? <Barras serie={d.serie} color={color} /> : <Sparkline serie={d.serie} color={color} />}
            </div>
          )}
        </button>
      )
    }

    if (w.datos.tipo === 'progreso') {
      const d = w.datos
      return (
        <button onClick={() => abrir(w)} className="flex-1 flex items-center gap-4 px-4 text-left">
          <div className="relative shrink-0">
            <Anillo pct={d.porcentaje} color={VERDE} />
            <span className="absolute inset-0 grid place-items-center text-[13px] font-semibold text-text">{d.porcentaje}%</span>
          </div>
          <div className="min-w-0">
            {d.valor && <div className="text-[17px] font-semibold text-text truncate">{d.valor}</div>}
            {d.etiqueta && <div className="text-[12px] text-text-dim leading-snug line-clamp-2">{d.etiqueta}</div>}
          </div>
        </button>
      )
    }

    return (
      <div className="flex-1 flex flex-col justify-center px-1.5 py-1 min-h-0">
        {w.datos.items.slice(0, 4).map((it, i) => (
          <button
            key={i}
            onClick={() => abrir(w, it.url)}
            className="flex items-baseline gap-2 px-2.5 py-[5px] rounded-lg hover:bg-white/[0.06] text-left min-w-0"
          >
            <span className="flex-1 text-[12.5px] text-text truncate">{it.texto}</span>
            {it.meta && <span className="text-[11px] text-text-faint shrink-0">{it.meta}</span>}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full max-w-[760px] grid grid-cols-2 sm:grid-cols-3 gap-3 pb-20">
      {widgets.map((w) => (
        <div
          key={w.id}
          /* Cristal, no losa: la página es translúcida sobre la vibrancy de la ventana, así
             que un `bg` opaco se ve como un parche pegado encima. Mismo material que la caja
             de búsqueda de arriba. */
          className={'group relative flex flex-col h-[164px] rounded-[20px] bg-white/[0.05] backdrop-blur-xl border transition-all duration-300 overflow-hidden shadow-xl shadow-black/20 ' +
            (w.changed ? 'border-white/25' : 'border-white/10 opacity-70 hover:opacity-100')}
        >
          {/* Cabecera: de quién es el dato y de cuándo. */}
          <div className="flex items-center gap-2 h-8 px-3.5 shrink-0">
            {w.changed && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />}
            <Favicon src={w.favicon} />
            <span className="flex-1 text-[11.5px] text-text-dim truncate">{w.title}</span>
            <span className="text-[10.5px] text-text-faint shrink-0">{hace(w.updatedAt)}</span>
          </div>

          {cuerpo(w)}

          {/* Roto: el sitio cambió y la auto-reparación aún no llegó. El dato viejo sigue a la
              vista — era verdad cuando se leyó — pero no se finge que esté fresco. */}
          {w.fallos >= 2 && !w.error && (
            <div className="px-3.5 pb-2 text-[10.5px] text-amber-400/70">sin actualizar</div>
          )}

          <button
            title="Quitar widget"
            onClick={() => titanioTab.widgetsRemove(w.id)}
            className="absolute top-1.5 right-1.5 hidden group-hover:grid place-items-center w-6 h-6 rounded-md bg-black/60 text-white/60 hover:text-white"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {/* Añadir: el camino principal. Dices QUÉ quieres ver y el agente decide de dónde
          sacarlo — al revés, "convierte esta página en widget" fallaba casi siempre, porque
          la mayoría de páginas no tienen un dato que extraer. */}
      {pidiendo ? (
        <div className="col-span-2 sm:col-span-3">
          {/* Mismo material y mismas medidas que la caja de búsqueda: es la misma acción
              (escribir algo y que la app lo resuelva), así que no puede parecer otra app. */}
          <div className="flex items-center gap-3.5 h-[56px] px-5 rounded-[20px] bg-white/[0.05] backdrop-blur-xl border border-white/10 focus-within:border-white/25 shadow-xl shadow-black/20 transition-colors">
            <IconPlus className="w-[19px] h-[19px] text-text-faint shrink-0" />
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); pedir() }
                if (e.key === 'Escape') { setPidiendo(false); setTexto('') }
              }}
              onBlur={() => { if (!texto.trim()) setPidiendo(false) }}
              placeholder="¿Qué quieres ver de un vistazo?"
              className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-text placeholder:text-text-faint"
            />
            <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-[11px] text-text-faint font-sans shrink-0">↵</kbd>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5 px-1">
            {EJEMPLOS.map((x) => (
              <button
                key={x}
                onMouseDown={(e) => { e.preventDefault(); setTexto(x) }}
                className="h-7 px-3 rounded-full bg-white/[0.05] border border-white/10 text-[11.5px] text-text-faint hover:text-text hover:bg-white/[0.09] transition-colors"
              >
                {x}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setPidiendo(true)}
          className="flex flex-col items-center justify-center gap-1.5 h-[164px] rounded-[20px] border border-dashed border-white/[0.12] text-text-faint hover:text-text hover:border-white/25 hover:bg-white/[0.04] transition-colors"
        >
          <IconPlus className="w-5 h-5" />
          <span className="text-[12px]">Añadir widget</span>
        </button>
      )}
    </div>
  )
}
