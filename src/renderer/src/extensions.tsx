import { createRoot } from 'react-dom/client'
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import type { ExtensionInfo, ExtensionsData } from '@shared/types'
import IconPuzzle from '~icons/tabler/puzzle'
import IconPlus from '~icons/tabler/plus'
import IconFolder from '~icons/tabler/folder'
import IconTrash from '~icons/tabler/trash'
import IconAlert from '~icons/tabler/alert-triangle'
import IconCheck from '~icons/tabler/check'
import './styles.css'

const ex = window.extensionswin
const EMPTY: ExtensionsData = { items: [], storeCandidate: null, installing: false }

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}
      title={on ? 'Desactivar' : 'Activar'}
      className={'w-8 h-[18px] rounded-full shrink-0 relative transition-colors ' + (on ? 'bg-emerald-500/90' : 'bg-white/15')}
    >
      <span className={'absolute top-0.5 w-[14px] h-[14px] rounded-full bg-white transition-all ' + (on ? 'left-[16px]' : 'left-0.5')} />
    </button>
  )
}

const actionRow =
  'flex items-center gap-3 w-full h-9 px-2.5 rounded-lg text-[13.5px] text-text-dim hover:bg-white/[0.06] hover:text-text transition-colors disabled:opacity-50 [&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:text-text-faint'

function Row({ e }: { e: ExtensionInfo }): JSX.Element {
  return (
    <div className="group flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-white/[0.04]">
      {e.icon ? (
        <img src={e.icon} alt="" className="w-[22px] h-[22px] rounded-md object-contain shrink-0" />
      ) : (
        <span className="w-[22px] h-[22px] shrink-0 grid place-items-center rounded-md bg-white/[0.08] text-text-faint [&>svg]:w-3.5 [&>svg]:h-3.5"><IconPuzzle /></span>
      )}
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-[13.5px] text-text truncate">{e.name}</span>
          {e.missing && <IconAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" title="Archivos no encontrados" />}
        </span>
        {e.version && <span className="block text-[11.5px] text-text-faint truncate">Versión {e.version}</span>}
      </span>
      <button
        onClick={() => ex.remove(e.path)}
        title="Quitar"
        className="w-7 h-7 grid place-items-center rounded-md text-text-faint hover:text-red-400 hover:bg-white/[0.08] opacity-0 group-hover:opacity-100 transition-opacity [&>svg]:w-4 [&>svg]:h-4"
      >
        <IconTrash />
      </button>
      <Toggle on={e.enabled} onChange={(v) => ex.toggle(e.path, v)} />
    </div>
  )
}

function Extensions(): JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null)
  const [d, setD] = useState<ExtensionsData>(EMPTY)
  useEffect(() => ex.onData(setD), [])
  useLayoutEffect(() => {
    if (boxRef.current) ex.reportHeight(Math.ceil(boxRef.current.getBoundingClientRect().height))
  }, [d])

  const cand = d.storeCandidate

  return (
    <div className="p-3">
      <div ref={boxRef} className="py-1.5 rounded-2xl border border-white/10 bg-[#1c1c20] shadow-xl shadow-black/50 overflow-hidden">
        {/* Instalar la extensión de la página actual (si estás en la Store) */}
        {cand && (
          <div className="px-2 pb-1">
            {cand.installed ? (
              <div className="flex items-center gap-3 h-9 px-2.5 text-[13.5px] text-emerald-400 [&>svg]:w-[18px] [&>svg]:h-[18px]">
                <IconCheck /> Ya la tienes instalada
              </div>
            ) : (
              <button className={actionRow + ' text-text'} onClick={() => ex.installFromStore()} disabled={d.installing}>
                <IconPlus />
                {d.installing ? 'Instalando…' : 'Añadir esta extensión a Monper'}
              </button>
            )}
          </div>
        )}

        <div className="px-2 pb-1">
          <button className={actionRow} onClick={() => ex.browseStore()}>
            <IconPuzzle /> Explorar extensiones
          </button>
          <button className={actionRow} onClick={() => ex.installFromFolder()}>
            <IconFolder /> Instalar desde una carpeta
          </button>
        </div>

        <div className="h-px bg-white/[0.07] mx-2 my-1" />

        <div className="px-3 pt-1.5 pb-1 text-[11.5px] font-medium text-text-faint">Tus extensiones</div>
        <div className="px-2 pb-1 max-h-[320px] overflow-y-auto [&::-webkit-scrollbar]:w-0">
          {d.items.length === 0 ? (
            <div className="px-2.5 py-4 text-[12.5px] text-text-faint leading-relaxed">
              Todavía no tienes extensiones. Toca <span className="text-text-dim">Explorar extensiones</span>,
              abre la que te guste y vuelve aquí para añadirla.
            </div>
          ) : (
            d.items.map((e) => <Row key={e.path} e={e} />)
          )}
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Extensions />)
