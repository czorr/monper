import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useCallback, useEffect, useState, type JSX } from 'react'
import type { McpServerInfo } from '@shared/types'
import IconPlug from '~icons/tabler/plug'
import IconRefresh from '~icons/tabler/refresh'
import IconCopy from '~icons/tabler/copy'
import IconCheck from '~icons/tabler/check'
import { Card, Group, Toggle, SettingsHeader, Button } from './ui'

const { titanioTab } = window

/**
 * Settings → MCPs: convertir Titanio en el puente entre tu web logueada y cualquier IA.
 *
 * El argumento del producto, dicho sin adornos en la propia página: el navegador es el único
 * software de tu máquina que ya está autenticado en todo lo que usas, y hasta ahora era el
 * único que no lo exponía a nada. Por eso hay una industria construyendo integraciones para
 * datos que ya están renderizados en una pestaña con tu sesión abierta.
 *
 * Y por eso mismo el interruptor viene apagado y se explica lo que concede: esto no es una
 * casilla de configuración, es dar manos a otro proceso dentro de tus sesiones.
 */

const CONFIG = JSON.stringify({ mcpServers: { titanio: { command: 'npx', args: ['-y', 'titanio-mcp'] } } }, null, 2)

const HERRAMIENTAS: { nombre: string; que: string }[] = [
  { nombre: 'open_page', get que() { return tr("Abre una URL con tu sesión, en segundo plano") } },
  { nombre: 'read_page', get que() { return tr("Texto legible, sin menús ni pies de página") } },
  { nombre: 'list_tabs', get que() { return tr("Lista las pestañas abiertas") } },
  { nombre: 'click', get que() { return tr("Pulsa por texto visible") } },
  { nombre: 'fill', get que() { return tr("Escribe en un campo (nunca en uno de contraseña)") } },
  { nombre: 'screenshot', get que() { return tr("Captura la página") } }
]

function Copiar({ texto }: { texto: string }): JSX.Element {
  useLocale()
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState('')
  const copiar = async (): Promise<void> => {
    // Si el portapapeles falla, decirlo: si no, el usuario pega el contenido anterior y
    // acaba depurando una config que nunca llegó.
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1600)
    } catch (e) {
      console.error('[mcp] no se pudo copiar al portapapeles:', e)
      setError(tr("No se pudo copiar. Selecciónalo a mano."))
    }
  }
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[12px] text-amber-400">{error}</span>}
      <Button variant="secondary" size="sm"
        onClick={copiar}
      >
        {copiado ? <IconCheck /> : <IconCopy />}
        {copiado ? tr("Copiado") : tr("Copiar")}
      </Button>
    </div>
  )
}

export default function McpSection(): JSX.Element {
  useLocale()
  const [estado, setEstado] = useState<{ enabled: boolean; port: number } | null>(null)
  const [error, setError] = useState('')
  const [servidores, setServidores] = useState<McpServerInfo[] | null>(null)

  const leerServidores = useCallback(async (recargar = false): Promise<void> => {
    try {
      setServidores(recargar ? await titanioTab.reloadMcpServers() : await titanioTab.listMcpServers())
    } catch (e) {
      console.error('[mcp] no se pudieron leer los servidores:', e)
      setServidores([])
    }
  }, [])
  useEffect(() => { void leerServidores() }, [leerServidores])

  const leer = useCallback(async (): Promise<void> => {
    try {
      setEstado(await titanioTab.getMcpState())
      setError('')
    } catch (e) {
      console.error('[mcp] no se pudo leer el estado:', e)
      setError(tr("No se pudo cargar el estado de MCP. Reinicia Titanio e inténtalo de nuevo."))
    }
  }, [])
  useEffect(() => { void leer() }, [leer])

  const cambiar = async (on: boolean): Promise<void> => {
    setEstado((s) => (s ? { ...s, enabled: on } : s)) // feedback inmediato
    try {
      const real = await titanioTab.setMcpEnabled(on)
      setEstado((s) => (s ? { ...s, enabled: real } : s))
    } catch (e) {
      console.error('[mcp] no se pudo cambiar el estado:', e)
      void leer()
    }
  }

  const on = !!estado?.enabled

  return (
    <>
      <SettingsHeader title={tr("MCPs")} description={tr("Conecta Titanio con otras IAs y con herramientas externas.")} />

      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[13px] text-amber-300 leading-relaxed">
          {error}
        </div>
      )}

      <Group title={tr("Acceso desde otras aplicaciones")}>
        <Card>
          <div className="flex items-start gap-3.5 px-4 py-4">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-text leading-tight">{tr("Activar servidor MCP")}</div>
              <div className="text-[12.5px] text-text-dim mt-1 leading-relaxed">
                {on
                  ? <>{tr("Conexión local en")} <span className="tabular-nums">127.0.0.1:{estado?.port}</span>{tr(", protegida con un token.")}</>
                  : tr("Desactivado. Debes activarlo cada vez que abres Titanio.")}
              </div>
            </div>
            <div className="mt-0.5">
              <Toggle on={on} onChange={cambiar} disabled={!estado} />
            </div>
          </div>

          {/*
            Esto sí se queda: no es explicar cómo funciona, es decirle al usuario qué está
            concediendo. Encender el puente da a otro proceso acceso a sus sesiones abiertas,
            y esa frase es la diferencia entre una decisión y un descuido.
          */}
          <div className="px-4 py-3.5 text-[12.5px] text-text-dim leading-relaxed">
            {tr("Los clientes autorizados pueden abrir páginas e interactuar con tus sesiones iniciadas. Titanio pide permiso en la primera conexión.")} </div>
        </Card>
      </Group>

      <Group title={tr("Conectar tu cliente")}>
        <Card>
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className="flex-1 min-w-0 text-[12.5px] text-text-dim leading-relaxed">
              {tr("Pégalo en la configuración MCP de Claude Code, Cursor o el cliente que uses.")} </div>
            <Copiar texto={CONFIG} />
          </div>
          <pre className="px-4 py-3.5 text-[12px] leading-relaxed text-text-dim overflow-x-auto select-text">
            {CONFIG}
          </pre>
        </Card>
      </Group>

      <Group title={tr("Herramientas para el agente")}>
        <Card>
          <div className="px-4 py-3.5 flex items-start gap-3">
            <div className="flex-1 min-w-0 text-[12.5px] text-text-dim leading-relaxed">
              {tr("Añade servidores para que el agente pueda ejecutar código, leer ficheros o consultar bases de datos.")} </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="secondary" size="icon"
                onClick={() => leerServidores(true)}
                title={tr("Releer el fichero de configuración")}
              >
                <IconRefresh />
              </Button>
              <Button variant="secondary" size="sm"
                onClick={async () => { setServidores(await titanioTab.probeMcpServers()) }}
                title={tr("Comprobar conexión")}
              >
                {tr("Probar")} </Button>
              <Button variant="secondary" size="sm"
                onClick={() => titanioTab.openMcpConfig()}
              >
                {tr("Editar configuración")} </Button>
            </div>
          </div>

          {servidores === null && <div className="px-4 py-4 text-[13px] text-text-faint">{tr("Cargando…")}</div>}

          {servidores?.length === 0 && (
            <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
              <IconPlug className="w-5 h-5 text-text-faint" />
              <div className="text-[13.5px] text-text-dim">{tr("Ningún servidor conectado")}</div>
              <div className="text-[12.5px] text-text-faint max-w-[420px] leading-relaxed">
                {tr("Añade uno desde «Editar configuración».")} </div>
            </div>
          )}

          {servidores?.map((sv) => (
            <div key={sv.name} className="flex items-center gap-3 px-4 py-3">
              <span
                className={'w-2 h-2 rounded-full shrink-0 ' + (sv.error ? 'bg-red-400' : sv.running ? 'bg-emerald-400' : 'bg-white/25')}
                title={sv.error ? tr("con error") : sv.running ? tr("en marcha") : tr("se lanzará al usarlo")}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] text-text truncate">{sv.name}</div>
                <div className={'text-[12px] mt-0.5 truncate ' + (sv.error ? 'text-red-400' : 'text-text-faint')}>
                  {/* Un servidor que no arranca no puede quedarse en silencio: sin el motivo,
                      el usuario solo ve que el agente "no sabe" hacer algo. */}
                  {sv.error
                    ? sv.error
                    : !sv.enabled ? tr("desactivado en la configuración")
                      : sv.running ? `${sv.tools} ${sv.tools === 1 ? 'herramienta' : 'herramientas'}`
                        : tr("se inicia al usarlo")}
                </div>
              </div>
            </div>
          ))}
        </Card>
      </Group>

      <Group title={tr("Herramientas disponibles")}>
        <Card>
          {HERRAMIENTAS.map((h) => (
            <div key={h.nombre} className="flex items-baseline gap-3 px-4 py-3">
              <code className="text-[12.5px] text-text shrink-0 w-[104px]">{h.nombre}</code>
              <span className="text-[13px] text-text-dim">{h.que}</span>
            </div>
          ))}
        </Card>
      </Group>
    </>
  )
}
