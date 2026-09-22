import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useCallback, useEffect, useState, type JSX } from 'react'
import type { NodoMemoriaInfo } from '@shared/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import IconFolder from '~icons/tabler/folder'
import IconFolderOpen from '~icons/tabler/folder-open'
import IconFileText from '~icons/tabler/file-text'
import IconChevron from '~icons/tabler/chevron-down'
import IconSettings from '~icons/tabler/settings'
import IconTrash from '~icons/tabler/trash'
import { MD_COMPONENTS } from './markdown'
import { SettingsHeader, SettingsContent, Button, Toggle } from './ui'

const { titanioTab } = window

/**
 * Settings → Memory.
 *
 * Misma estructura que Skills, y por la misma razón: la columna de la izquierda ES la
 * navegación de la sección (ajustes + árbol de ficheros) y el contenido ocupa todo lo demás.
 * La primera versión metía el árbol DENTRO del panel de contenido, en una cajita de 220px, y
 * no se parecía en nada a lo que se pidió.
 */

/** Fila del árbol. Las carpetas se pliegan; los ficheros se seleccionan. */
function Nodo({ n, nivel, sel, onSel, onBorrar }: {
  n: NodoMemoriaInfo; nivel: number; sel: string; onSel: (p: string) => void; onBorrar: (p: string) => void
}): JSX.Element {
  useLocale()
  const [abierta, setAbierta] = useState(true)
  const sangria = { paddingLeft: 8 + nivel * 14 }

  if (n.tipo === 'carpeta') {
    return (
      <>
        <Button
          onClick={() => setAbierta((v) => !v)}
          style={sangria}
          className="flex items-center gap-2.5 w-full h-8 pr-2 rounded-md text-[13px] text-text-dim hover:bg-white/[0.04] hover:text-text transition-colors [&>svg]:w-4 [&>svg]:h-4 [&>svg]:shrink-0"
        >
          {abierta ? <IconFolderOpen className="text-text-faint" /> : <IconFolder className="text-text-faint" />}
          <span className="flex-1 text-left truncate">{n.nombre}</span>
          <IconChevron className={'text-text-faint transition-transform ' + (abierta ? '' : '-rotate-90')} />
        </Button>
        {abierta && (n.hijos ?? []).map((h) => (
          <Nodo key={h.path} n={h} nivel={nivel + 1} sel={sel} onSel={onSel} onBorrar={onBorrar} />
        ))}
      </>
    )
  }

  return (
    <div className="group relative">
      <Button
        onClick={() => onSel(n.path)}
        style={sangria}
        className={'flex items-center gap-2.5 w-full h-8 pr-8 rounded-md text-[13px] transition-colors [&>svg]:w-4 [&>svg]:h-4 [&>svg]:shrink-0 ' +
          (sel === n.path ? 'bg-white/[0.07] text-text' : 'text-text-dim hover:bg-white/[0.04] hover:text-text')}
      >
        <IconFileText className="text-text-faint" />
        <span className="flex-1 text-left truncate">{n.nombre}</span>
      </Button>
      {/* MEMORY.md no se borra: es la raíz del índice. Vaciarlo sí, editándolo. */}
      {n.path !== 'MEMORY.md' && (
        <Button
          title={tr("Borrar")}
          onClick={() => onBorrar(n.path)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:grid place-items-center w-6 h-6 rounded-md text-text-faint hover:text-red-400 hover:bg-red-500/15"
        >
          <IconTrash className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  )
}

export default function MemorySection(): JSX.Element {
  useLocale()
  const [arbol, setArbol] = useState<NodoMemoriaInfo[]>([])
  const [enabled, setEnabled] = useState(true)
  /** '' = la subpágina de ajustes; si no, la ruta del fichero abierto. */
  const [sel, setSel] = useState('')
  const [texto, setTexto] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')

  const recargar = useCallback(async () => {
    setArbol(await titanioTab.memoryList())
    setEnabled(await titanioTab.memoryEnabled())
  }, [])

  useEffect(() => { void recargar() }, [recargar])
  useEffect(() => {
    let vivo = true
    setEditando(false)
    if (!sel) { setTexto(null); return }
    void titanioTab.memoryRead(sel).then((c) => { if (vivo) setTexto(c) })
    return () => { vivo = false }
  }, [sel])

  const guardar = async (): Promise<void> => {
    await titanioTab.memoryWrite(sel, borrador)
    setTexto(borrador)
    setEditando(false)
    void recargar()
  }

  const borrar = async (path: string): Promise<void> => {
    await titanioTab.memoryDelete(path)
    if (sel === path) setSel('')
    void recargar()
  }

  const navRow = (activo: boolean): string =>
    'flex items-center gap-2.5 w-full h-8 px-2 rounded-md text-[13px] transition-colors [&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-text-faint ' +
    (activo ? 'bg-white/[0.07] text-text' : 'text-text-dim hover:bg-white/[0.04] hover:text-text')

  return (
    <div className="h-full flex">
      {/* Columna de la sección: sus ajustes y sus ficheros */}
      <div className="w-[268px] shrink-0 border-r border-white/[0.06] flex flex-col">
        <div className="flex items-center justify-between px-3.5 h-12 shrink-0">
          <span className="text-[15px] font-semibold">{tr("Memory")}</span>
          <Button
            onClick={() => titanioTab.memoryOpenFolder()}
            title={tr("Abrir la carpeta de memoria en Finder")}
            className="w-7 h-7 grid place-items-center rounded-md text-text-faint hover:text-text hover:bg-white/[0.06] transition-colors [&>svg]:w-[17px] [&>svg]:h-[17px]"
          >
            <IconFolder />
          </Button>
        </div>

        <div className="px-2">
          <Button onClick={() => setSel('')} className={navRow(!sel)}>
            <IconSettings />
            <span className="flex-1 text-left">{tr("Settings")}</span>
          </Button>
        </div>

        <div className="mx-3.5 my-2 border-t border-white/[0.06]" />

        <div className="flex-1 overflow-y-auto px-2 pb-3 [&::-webkit-scrollbar]:w-0">
          {arbol.length === 0
            ? <div className="px-2 py-2 text-[12.5px] text-text-faint">{tr("Sin ficheros todavía.")}</div>
            : arbol.map((n) => (
                <Nodo key={n.path} n={n} nivel={0} sel={sel} onSel={setSel} onBorrar={(p) => void borrar(p)} />
              ))}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-0">
        {!sel ? (
          <SettingsContent>
            <SettingsHeader title={tr("Memory")} description={tr("Consulta y edita las notas que el agente guarda entre sesiones.")} />

            <h2 className="mt-9 mb-3 text-[15px] font-semibold">{tr("Ajustes")}</h2>
            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="flex items-center gap-3 px-4 h-16">
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-text">{tr("Activar memoria")}</div>
                  <div className="text-[12.5px] text-text-dim">
                    {tr("Permite que el agente guarde y consulte estas notas.")} </div>
                </div>
                <Toggle on={enabled} onChange={(v) => { void titanioTab.memoryEnabled(v).then(setEnabled) }} />
              </div>
            </div>

            <p className="mt-4 text-[12.5px] text-text-faint leading-relaxed">
              {tr("El agente recibe")} <code className="px-1 py-0.5 rounded bg-white/[0.07] text-[12px]">MEMORY.md</code> {tr("con cada mensaje y consulta las demás notas cuando las necesita.")} </p>
          </SettingsContent>
        ) : (
          <SettingsContent>
            <SettingsHeader title={sel} actions={editando ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>{tr("Cancelar")}</Button>
                    <Button variant="primary" size="sm" onClick={() => void guardar()}>{tr("Guardar")}</Button>
                  </>
                ) : (
                  <Button variant="secondary" size="sm"
                    onClick={() => { setBorrador(texto ?? ''); setEditando(true) }}
                  >
                    {tr("Editar")} </Button>
                )}
            />

            {editando ? (
              <textarea
                autoFocus
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                spellCheck={false}
                className="w-full h-[calc(100vh-220px)] p-4 rounded-xl bg-[#0d0d10] border border-white/[0.06] outline-none text-[12.5px] font-mono leading-relaxed text-text resize-none"
              />
            ) : texto === null ? (
              <div className="text-[13px] text-text-dim">{tr("Este fichero ya no está.")}</div>
            ) : (
              <div className="max-w-[760px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{texto}</ReactMarkdown>
              </div>
            )}
          </SettingsContent>
        )}
      </div>
    </div>
  )
}
