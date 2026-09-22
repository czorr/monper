import { t as tr, useLocale } from '@renderer/lib/i18n'
import { createRoot } from 'react-dom/client'
import { useEffect, useState, type JSX } from 'react'
import type { DownloadEntry } from '@shared/types'
import { fmtBytes } from '@shared/bytes'
import { PopoverPanel, PopoverRow, PopoverLabel, PopoverDivider, PopoverList } from '@renderer/components/popover'
import IconFile from '~icons/tabler/file'
import IconFolder from '~icons/tabler/folder-open'
import IconX from '~icons/tabler/x'
import IconList from '~icons/tabler/list'
import IconDownload from '~icons/tabler/download'
import './styles.css'

const dp = window.downloadspop

/** Cuántas caben sin que el popover se convierta en la propia página de descargas. */
const VISIBLES = 6

function estado(d: DownloadEntry): string {
  if (d.state === 'progressing') {
    const pct = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0
    return d.paused ? tr("En pausa") : d.total > 0 ? `${pct}% · ${fmtBytes(d.total)}` : fmtBytes(d.received)
  }
  if (d.state === 'completed') return fmtBytes(d.total || d.received)
  if (d.state === 'cancelled') return tr("Cancelada")
  return tr("Falló")
}

function Fila({ d }: { d: DownloadEntry }): JSX.Element {
  useLocale()
  const enCurso = d.state === 'progressing'
  const fallida = d.state === 'interrupted' || d.state === 'cancelled'
  const pct = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0

  return (
    <div className="relative">
      {/* La barra de progreso va DE FONDO de la fila, no como un elemento aparte: en 300px de
          ancho, una barra propia obliga a partir el nombre del archivo en dos líneas. */}
      {enCurso && (
        <div className="absolute inset-y-0.5 left-1 rounded-md bg-white/[0.06] pointer-events-none transition-[width] duration-200"
          style={{ width: `calc(${pct}% - 8px)` }} />
      )}
      <div className={fallida ? 'opacity-55' : ''}>
      <PopoverRow
        icon={<IconFile className="w-[16px] h-[16px] shrink-0 opacity-70" />}
        label={d.filename}
        title={d.savePath || d.url}
        // Terminada se abre; en curso el clic no hace nada útil (no existe el archivo aún) y
        // abrir algo a medias es peor que no responder.
        onClick={d.state === 'completed' ? () => dp.open(d.id) : undefined}
        meta={
          <>
            <span>{estado(d)}</span>
            {enCurso ? (
              <button
                type="button"
                title={tr("Cancelar")}
                onClick={(e) => { e.stopPropagation(); dp.cancel(d.id) }}
                className="w-5 h-5 grid place-items-center rounded text-text-faint hover:text-text hover:bg-white/[0.1] [&>svg]:w-3.5 [&>svg]:h-3.5"
              >
                <IconX />
              </button>
            ) : d.state === 'completed' ? (
              <button
                type="button"
                title={tr("Mostrar en el Finder")}
                onClick={(e) => { e.stopPropagation(); dp.reveal(d.id) }}
                className="w-5 h-5 grid place-items-center rounded text-text-faint hover:text-text hover:bg-white/[0.1] [&>svg]:w-3.5 [&>svg]:h-3.5"
              >
                <IconFolder />
              </button>
            ) : null}
          </>
        }
      />
      </div>
    </div>
  )
}

function DownloadsPopover(): JSX.Element {
  useLocale()
  const [list, setList] = useState<DownloadEntry[]>([])
  useEffect(() => dp.onData(setList), [])

  const enCurso = list.filter((d) => d.state === 'progressing')
  // Las que están bajando van arriba: son la razón por la que se abre esto.
  const orden = [...enCurso, ...list.filter((d) => d.state !== 'progressing')]
  const visibles = orden.slice(0, VISIBLES)

  return (
    <PopoverPanel onHeight={dp.reportHeight} measure={list}>
      <PopoverLabel>
        {enCurso.length > 0 ? tr("Descargando {0}", enCurso.length) : tr("Descargas")}
      </PopoverLabel>

      {visibles.length === 0 ? (
        <div className="px-2.5 py-6 flex flex-col items-center gap-1.5 text-center">
          <IconDownload className="w-5 h-5 text-text-faint" />
          <span className="text-[12.5px] text-text-dim">{tr("Todavía no has descargado nada")}</span>
        </div>
      ) : (
        <PopoverList max={300}>
          {visibles.map((d) => <Fila key={d.id} d={d} />)}
        </PopoverList>
      )}

      <PopoverDivider />
      <PopoverRow
        icon={<IconList className="w-[16px] h-[16px] shrink-0 opacity-70" />}
        label={tr("Ver todas")}
        meta={list.length > VISIBLES ? <span>{list.length}</span> : undefined}
        onClick={dp.seeAll}
      />
      {list.length > 0 && (
        <PopoverRow
          icon={<IconX className="w-[16px] h-[16px] shrink-0 opacity-70" />}
          label={tr("Limpiar la lista")}
          title={tr("Quita las descargas terminadas de la lista. No borra ningún archivo.")}
          onClick={dp.clear}
        />
      )}
    </PopoverPanel>
  )
}

createRoot(document.getElementById('root')!).render(<DownloadsPopover />)
