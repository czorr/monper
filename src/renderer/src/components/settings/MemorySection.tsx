import { useCallback, useEffect, useState, type JSX } from 'react'
import type { NodoMemoriaInfo } from '@shared/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import IconFolder from '~icons/tabler/folder'
import IconFolderOpen from '~icons/tabler/folder-open'
import IconFileText from '~icons/tabler/file-text'
import IconChevron from '~icons/tabler/chevron-down'
import IconTrash from '~icons/tabler/trash'
import { MD_COMPONENTS } from './markdown'

const { monperTab } = window

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      onClick={() => onChange(!on)}
      className={'w-9 h-5 rounded-full shrink-0 relative transition-colors ' + (on ? 'bg-emerald-500/90' : 'bg-white/15')}
    >
      <span className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ' + (on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

/** Una fila del árbol. Las carpetas se pliegan; los ficheros seleccionan. */
function Nodo({ n, nivel, sel, onSel, onBorrar }: {
  n: NodoMemoriaInfo; nivel: number; sel: string; onSel: (p: string) => void; onBorrar: (p: string) => void
}): JSX.Element {
  const [abierta, setAbierta] = useState(true)
  const sangria = { paddingLeft: 10 + nivel * 14 }

  if (n.tipo === 'carpeta') {
    return (
      <>
        <button
          onClick={() => setAbierta((v) => !v)}
          style={sangria}
          className="flex items-center gap-2 w-full h-8 pr-2 rounded-lg text-[13px] text-text-dim hover:bg-white/[0.05] [&>svg]:w-[15px] [&>svg]:h-[15px] [&>svg]:shrink-0"
        >
          {abierta ? <IconFolderOpen className="text-text-faint" /> : <IconFolder className="text-text-faint" />}
          <span className="flex-1 text-left truncate">{n.nombre}</span>
          <IconChevron className={'text-text-faint transition-transform ' + (abierta ? '' : '-rotate-90')} />
        </button>
        {abierta && (n.hijos ?? []).map((h) => (
          <Nodo key={h.path} n={h} nivel={nivel + 1} sel={sel} onSel={onSel} onBorrar={onBorrar} />
        ))}
      </>
    )
  }

  return (
    <div className="group relative">
      <button
        onClick={() => onSel(n.path)}
        style={sangria}
        className={'flex items-center gap-2 w-full h-8 pr-8 rounded-lg text-[13px] [&>svg]:w-[15px] [&>svg]:h-[15px] [&>svg]:shrink-0 ' +
          (sel === n.path ? 'bg-white/[0.10] text-text' : 'text-text-dim hover:bg-white/[0.05]')}
      >
        <IconFileText className="text-text-faint" />
        <span className="flex-1 text-left truncate">{n.nombre}</span>
      </button>
      {/* MEMORY.md no se borra: es la raíz del índice y sin él la memoria no tiene por dónde
          empezar. Vaciarlo sí se puede, editándolo. */}
      {n.path !== 'MEMORY.md' && (
        <button
          title="Borrar"
          onClick={() => onBorrar(n.path)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:grid place-items-center w-6 h-6 rounded-md text-text-faint hover:text-red-400 hover:bg-red-500/15"
        >
          <IconTrash className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

export default function MemorySection(): JSX.Element {
  const [arbol, setArbol] = useState<NodoMemoriaInfo[]>([])
  const [enabled, setEnabled] = useState(true)
  const [sel, setSel] = useState('MEMORY.md')
  const [texto, setTexto] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')

  const recargar = useCallback(async () => {
    setArbol(await monperTab.memoryList())
    setEnabled(await monperTab.memoryEnabled())
  }, [])

  useEffect(() => { void recargar() }, [recargar])
  useEffect(() => {
    let vivo = true
    setEditando(false)
    void monperTab.memoryRead(sel).then((c) => { if (vivo) setTexto(c) })
    return () => { vivo = false }
  }, [sel])

  const guardar = async (): Promise<void> => {
    await monperTab.memoryWrite(sel, borrador)
    setTexto(borrador)
    setEditando(false)
    void recargar()
  }

  const borrar = async (path: string): Promise<void> => {
    await monperTab.memoryDelete(path)
    if (sel === path) setSel('MEMORY.md')
    void recargar()
  }

  const total = arbol.length

  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-[-0.4px]">Memory</h1>
      <p className="mt-1.5 mb-7 text-[13.5px] text-text-dim">
        Lo que Monper recuerda entre sesiones. Son ficheros markdown que escribe el propio agente
        y que puedes leer y editar aquí — o en tu carpeta, con el editor que quieras.
      </p>

      <div className="mb-6 rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-14">
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] text-text">Activar memoria</div>
            <div className="text-[12.5px] text-text-dim">
              El agente guarda y consulta lo que aprende. Apagada, no lee ni escribe nada.
            </div>
          </div>
          <Toggle on={enabled} onChange={(v) => { void monperTab.memoryEnabled(v).then(setEnabled) }} />
        </div>
      </div>

      {/* Dos columnas, como en Skills: el árbol manda y el contenido se lee al lado. */}
      <div className="grid grid-cols-[220px_1fr] gap-4 min-h-[380px]">
        <div className="rounded-2xl border border-border p-1.5 overflow-y-auto max-h-[520px] [&::-webkit-scrollbar]:w-0">
          {total === 0
            ? <div className="px-3 py-4 text-[12.5px] text-text-dim">Sin ficheros todavía.</div>
            : arbol.map((n) => (
                <Nodo key={n.path} n={n} nivel={0} sel={sel} onSel={setSel} onBorrar={(p) => void borrar(p)} />
              ))}
          <button
            onClick={() => monperTab.memoryOpenFolder()}
            className="flex items-center gap-2 w-full h-8 mt-1 px-2.5 rounded-lg text-[12.5px] text-text-faint hover:text-text hover:bg-white/[0.05] [&>svg]:w-[15px] [&>svg]:h-[15px]"
          >
            <IconFolder /> Abrir carpeta
          </button>
        </div>

        <div className="rounded-2xl border border-border p-5 overflow-y-auto max-h-[520px] [&::-webkit-scrollbar]:w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex-1 text-[13px] font-medium text-text truncate">{sel}</span>
            {editando ? (
              <>
                <button onClick={() => setEditando(false)} className="px-2.5 h-7 rounded-lg text-[12.5px] text-text-dim hover:text-text hover:bg-white/[0.06]">Cancelar</button>
                <button onClick={() => void guardar()} className="px-2.5 h-7 rounded-lg text-[12.5px] text-text bg-white/[0.10] hover:bg-white/[0.16]">Guardar</button>
              </>
            ) : (
              <button
                onClick={() => { setBorrador(texto ?? ''); setEditando(true) }}
                className="px-2.5 h-7 rounded-lg text-[12.5px] text-text-dim hover:text-text hover:bg-white/[0.06]"
              >
                Editar
              </button>
            )}
          </div>

          {editando ? (
            <textarea
              autoFocus
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              spellCheck={false}
              className="w-full h-[420px] p-3 rounded-xl bg-[#0d0d10] border border-white/[0.06] outline-none text-[12.5px] font-mono leading-relaxed text-text resize-none"
            />
          ) : texto === null ? (
            <div className="text-[13px] text-text-dim">Este fichero ya no está.</div>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{texto}</ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  )
}
