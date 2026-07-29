import { createRoot } from 'react-dom/client'
import { useEffect, useState, type JSX } from 'react'
import type { DownloadEntry } from '@shared/types'
import IconFile from '~icons/tabler/file'
import IconFolder from '~icons/tabler/folder'
import IconX from '~icons/tabler/x'
import IconTrash from '~icons/tabler/trash'
import './styles.css'

import { fmtBytes } from '@shared/bytes'

const { monperTab } = window

function Row({ d }: { d: DownloadEntry }): JSX.Element {
  const pct = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0
  const done = d.state === 'completed'
  const failed = d.state === 'interrupted' || d.state === 'cancelled'
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.03]">
      <div className="w-9 h-9 shrink-0 grid place-items-center rounded-lg bg-white/[0.05] text-text-dim [&>svg]:w-[18px] [&>svg]:h-[18px]">
        <IconFile />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => done && monperTab.openDownload(d.id)}
            className={'text-[14px] truncate text-left ' + (done ? 'text-text hover:underline' : 'text-text')}
            title={d.filename}
          >
            {d.filename}
          </button>
        </div>
        {d.state === 'progressing' ? (
          <>
            <div className="mt-1.5 h-1 rounded-full bg-white/[0.08] overflow-hidden">
              <div className="h-full bg-white/60" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-[12px] text-text-faint tabular-nums">
              {fmtBytes(d.received)}{d.total > 0 ? ` / ${fmtBytes(d.total)}` : ''}{d.paused ? ' · en pausa' : ''}
            </div>
          </>
        ) : (
          <div className={'mt-0.5 text-[12px] ' + (failed ? 'text-red-400' : 'text-text-faint')}>
            {done ? fmtBytes(d.received) : d.state === 'cancelled' ? 'Cancelada' : 'Interrumpida'}
            <span className="text-text-faint"> · {(() => { try { return new URL(d.url).hostname.replace(/^www\./, '') } catch { return '' } })()}</span>
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1">
        {done && (
          <button title="Mostrar en carpeta" onClick={() => monperTab.showDownload(d.id)} className="w-8 h-8 grid place-items-center rounded-lg text-text-faint hover:text-text hover:bg-white/[0.08] [&>svg]:w-[16px] [&>svg]:h-[16px]"><IconFolder /></button>
        )}
        {d.state === 'progressing' && (
          <button title="Cancelar" onClick={() => monperTab.cancelDownload(d.id)} className="w-8 h-8 grid place-items-center rounded-lg text-text-faint hover:text-red-400 hover:bg-white/[0.08] [&>svg]:w-[16px] [&>svg]:h-[16px]"><IconX /></button>
        )}
      </div>
    </div>
  )
}

function DownloadsPage(): JSX.Element {
  const [list, setList] = useState<DownloadEntry[]>([])
  useEffect(() => { monperTab.listDownloads().then(setList); return monperTab.onDownloads(setList) }, [])

  return (
    <div className="h-full overflow-y-auto page-backdrop text-text select-none [&::-webkit-scrollbar]:w-0">
      <div className="max-w-[720px] mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[30px] font-semibold tracking-tight">Descargas</h1>
          {list.length > 0 && (
            <button onClick={() => monperTab.clearDownloads()} className="flex items-center gap-1.5 text-[13px] text-text-dim hover:text-text px-3 py-1.5 rounded-lg hover:bg-white/[0.06] [&>svg]:w-4 [&>svg]:h-4">
              <IconTrash /> Limpiar
            </button>
          )}
        </div>
        {list.length === 0 ? (
          <div className="text-[14px] text-text-faint py-16 text-center">No hay descargas todavía.</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {list.map((d) => <Row key={d.id} d={d} />)}
          </div>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<DownloadsPage />)
