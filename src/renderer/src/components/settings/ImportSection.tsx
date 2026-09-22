import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useEffect, useState, type JSX } from 'react'
import IconDownload from '~icons/tabler/download'
import { Card, Group, Button } from './ui'

const { titanioTab } = window

interface Nav { id: string; nombre: string; disponible: boolean }
type Que = { bookmarks: boolean; history: boolean; passwords: boolean }
type Resultado = { ok: boolean; bookmarks: number; history: number; passwords: number; error?: string }

/**
 * Bloque de importación, embebido en Settings → General.
 *
 * Sin `<h1>` propio a propósito: no es una sección del nav, es algo que haces UNA vez al
 * llegar. Tenerlo como pestaña propia le daba un peso permanente que no le corresponde.
 *
 * Las contraseñas vienen **desmarcadas**: importarlas dispara el diálogo del Llavero de macOS
 * y mueve secretos de sitio. Que sea un gesto consciente, no una casilla que ya venía puesta.
 */
export default function ImportSection(): JSX.Element {
  useLocale()
  const [navs, setNavs] = useState<Nav[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [que, setQue] = useState<Que>({ bookmarks: true, history: true, passwords: false })
  const [corriendo, setCorriendo] = useState(false)
  const [res, setRes] = useState<Resultado | null>(null)

  useEffect(() => {
    titanioTab.listImportBrowsers()
      .then((l) => {
        setNavs(l)
        setSel(l.find((n) => n.disponible)?.id ?? null)
      })
      .catch((e) => { console.error('[import] no se pudo listar:', e); setNavs([]) })
  }, [])

  const importar = async (): Promise<void> => {
    if (!sel) return
    setCorriendo(true)
    setRes(null)
    try {
      setRes(await titanioTab.runImport(sel, que))
    } catch (e) {
      setRes({ ok: false, bookmarks: 0, history: 0, passwords: 0, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setCorriendo(false)
    }
  }

  const casilla = (k: keyof Que, label: string, nota: string): JSX.Element => (
    <Button
      onClick={() => setQue((q) => ({ ...q, [k]: !q[k] }))}
      className="flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
    >
      <span
        className={
          'mt-0.5 w-[18px] h-[18px] rounded-md border grid place-items-center shrink-0 text-[11px] ' +
          (que[k] ? 'bg-white/90 border-white/90 text-black' : 'border-white/25')
        }
      >
        {que[k] ? '✓' : ''}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] text-text">{label}</span>
        <span className="block text-[12.5px] text-text-dim mt-0.5">{nota}</span>
      </span>
    </Button>
  )

  return (
    <>
      <Group title={tr("Importar de otro navegador")}>
        <Card>
          {navs === null && <div className="px-4 py-4 text-[13px] text-text-faint">{tr("Buscando navegadores…")}</div>}
          {navs?.every((n) => !n.disponible) && (
            <div className="px-4 py-6 text-center">
              <div className="text-[13.5px] text-text-dim">{tr("No se encontraron navegadores compatibles")}</div>
              {/* Se dice qué se buscó: si no, "no encuentro nada" es indistinguible de un fallo. */}
              {/* Se dice qué se buscó: si no, "no encuentro nada" es indistinguible de un fallo. */}
              <div className="text-[12.5px] text-text-faint mt-1 max-w-[420px] mx-auto leading-relaxed">
                {tr("Navegadores compatibles: Chrome, Arc, Brave, Edge y Safari.")} </div>
            </div>
          )}
          {navs?.filter((n) => n.disponible).map((n) => (
            <Button
              key={n.id}
              onClick={() => setSel(n.id)}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <span
                className={
                  'w-[18px] h-[18px] rounded-full border grid place-items-center shrink-0 ' +
                  (sel === n.id ? 'border-white/70' : 'border-white/20')
                }
              >
                {sel === n.id && <span className="w-2.5 h-2.5 rounded-full bg-white" />}
              </span>
              <span className="text-[14px] text-text">{n.nombre}</span>
            </Button>
          ))}
        </Card>
      </Group>

      <Group title={tr("Datos a importar")}>
        <Card>
          {casilla('bookmarks', tr("Marcadores"), tr("Omite los marcadores que ya tienes."))}
          {casilla('history', tr("Historial"), tr("Mejora el autocompletado de la barra de direcciones."))}
          {casilla('passwords', tr("Contraseñas"), tr("Se guardan cifradas en el vault. macOS puede pedirte permiso."))}
        </Card>
      </Group>

      {/*
        El botón y el resumen van envueltos con el MISMO margen inferior que un `Group` (mb-9).
        Sin esto quedaban fuera de toda sección y sin separación: "Importar" se empalmaba con el
        título de la sección siguiente, porque esta pieza se incrusta dentro de General.
      */}
      <div className="mb-9">
      <Button variant="primary" size="md"
        onClick={importar}
        disabled={!sel || corriendo || !(que.bookmarks || que.history || que.passwords)}
      >
        <IconDownload />
        {corriendo ? tr("Importando…") : tr("Importar")}
      </Button>

      {/*
        El resumen cuenta lo que entró Y lo que falló. Uno que solo suma éxitos miente: Safari,
        por ejemplo, no deja leer sus marcadores sin Acceso a Disco Completo, y el usuario tiene
        que saber por qué su importación vino a medias.
      */}
      {res && (
        <div className="mt-5">
          <Card>
            <div className="px-4 py-3.5 text-[13.5px] text-text">
              {res.bookmarks + res.history + res.passwords > 0
                ? tr("Importado: {0} marcadores, {1} páginas de historial, {2} contraseñas.", res.bookmarks, res.history, res.passwords)
                : tr("No se importó nada.")}
            </div>
            {res.error && (
              <div className="px-4 py-3.5 text-[12.5px] text-amber-300 leading-relaxed">{res.error}</div>
            )}
          </Card>
        </div>
      )}
      </div>
    </>
  )
}
