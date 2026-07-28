import { useCallback, useEffect, useState, type JSX } from 'react'
import type { McpServerInfo } from '@shared/types'
import IconPlug from '~icons/tabler/plug'
import IconRefresh from '~icons/tabler/refresh'
import IconCopy from '~icons/tabler/copy'
import IconCheck from '~icons/tabler/check'
import { Card, Group, Toggle } from './ui'

const { monperTab } = window

/**
 * Settings → MCPs: convertir Monper en el puente entre tu web logueada y cualquier IA.
 *
 * El argumento del producto, dicho sin adornos en la propia página: el navegador es el único
 * software de tu máquina que ya está autenticado en todo lo que usas, y hasta ahora era el
 * único que no lo exponía a nada. Por eso hay una industria construyendo integraciones para
 * datos que ya están renderizados en una pestaña con tu sesión abierta.
 *
 * Y por eso mismo el interruptor viene apagado y se explica lo que concede: esto no es una
 * casilla de configuración, es dar manos a otro proceso dentro de tus sesiones.
 */

const CONFIG = JSON.stringify({ mcpServers: { monper: { command: 'npx', args: ['-y', 'monper-mcp'] } } }, null, 2)

const HERRAMIENTAS: { nombre: string; que: string }[] = [
  { nombre: 'open_page', que: 'Abre una URL con tu sesión, en segundo plano' },
  { nombre: 'read_page', que: 'Texto legible, sin menús ni pies de página' },
  { nombre: 'list_tabs', que: 'Qué tienes abierto' },
  { nombre: 'click', que: 'Pulsa por texto visible' },
  { nombre: 'fill', que: 'Escribe en un campo (nunca en uno de contraseña)' },
  { nombre: 'screenshot', que: 'Captura, cuando importa el diseño' }
]

function Copiar({ texto }: { texto: string }): JSX.Element {
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
      setError('No se pudo copiar. Selecciónalo a mano.')
    }
  }
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[12px] text-amber-400">{error}</span>}
      <button
        onClick={copiar}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[12.5px] text-text-dim hover:text-text transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5"
      >
        {copiado ? <IconCheck /> : <IconCopy />}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

export default function McpSection(): JSX.Element {
  const [estado, setEstado] = useState<{ enabled: boolean; port: number } | null>(null)
  const [error, setError] = useState('')
  const [servidores, setServidores] = useState<McpServerInfo[] | null>(null)

  const leerServidores = useCallback(async (recargar = false): Promise<void> => {
    try {
      setServidores(recargar ? await monperTab.reloadMcpServers() : await monperTab.listMcpServers())
    } catch (e) {
      console.error('[mcp] no se pudieron leer los servidores:', e)
      setServidores([])
    }
  }, [])
  useEffect(() => { void leerServidores() }, [leerServidores])

  const leer = useCallback(async (): Promise<void> => {
    try {
      setEstado(await monperTab.getMcpState())
      setError('')
    } catch (e) {
      console.error('[mcp] no se pudo leer el estado:', e)
      setError('No se pudo leer el estado. Reinicia Monper: los cambios en el preload necesitan reiniciar la app, no solo recargar.')
    }
  }, [])
  useEffect(() => { void leer() }, [leer])

  const cambiar = async (on: boolean): Promise<void> => {
    setEstado((s) => (s ? { ...s, enabled: on } : s)) // feedback inmediato
    try {
      const real = await monperTab.setMcpEnabled(on)
      setEstado((s) => (s ? { ...s, enabled: real } : s))
    } catch (e) {
      console.error('[mcp] no se pudo cambiar el estado:', e)
      void leer()
    }
  }

  const on = !!estado?.enabled

  return (
    <>
      <h1 className="text-[30px] font-semibold tracking-tight mb-3">MCPs</h1>
      <p className="text-[13.5px] text-text-dim leading-relaxed mb-7">
        Conecta Monper con otras IAs y con herramientas externas.
      </p>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[13px] text-amber-300 leading-relaxed">
          {error}
        </div>
      )}

      <Group title="Puente">
        <Card>
          <div className="flex items-start gap-3.5 px-4 py-4">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-text leading-tight">Servir Monper por MCP</div>
              <div className="text-[12.5px] text-text-dim mt-1 leading-relaxed">
                {on
                  ? <>Escuchando en <span className="tabular-nums">127.0.0.1:{estado?.port}</span>. Solo tu máquina, con token.</>
                  : 'Apagado. Se enciende a mano y no sobrevive al cierre de Monper.'}
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
            Un cliente autorizado podrá abrir páginas y actuar en los sitios donde tengas la
            sesión abierta. Te preguntaremos la primera vez que lo intente.
            <strong className="text-text"> Nunca</strong> accede a tus contraseñas.
          </div>
        </Card>
      </Group>

      <Group title="Conectar tu cliente">
        <Card>
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className="flex-1 min-w-0 text-[12.5px] text-text-dim leading-relaxed">
              Pégalo en la configuración MCP de Claude Code, Cursor o el cliente que uses.
            </div>
            <Copiar texto={CONFIG} />
          </div>
          <pre className="px-4 py-3.5 text-[12px] leading-relaxed text-text-dim overflow-x-auto select-text">
            {CONFIG}
          </pre>
        </Card>
      </Group>

      <Group title="Herramientas para el agente">
        <Card>
          <div className="px-4 py-3.5 flex items-start gap-3">
            <div className="flex-1 min-w-0 text-[12.5px] text-text-dim leading-relaxed">
              Añade servidores para que el agente pueda ejecutar código, leer ficheros o
              consultar bases de datos.
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => leerServidores(true)}
                title="Releer el fichero de configuración"
                className="w-8 h-8 grid place-items-center rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-text-dim hover:text-text transition-colors [&>svg]:w-4 [&>svg]:h-4"
              >
                <IconRefresh />
              </button>
              <button
                onClick={async () => { setServidores(await monperTab.probeMcpServers()) }}
                title="Arrancarlos ahora y ver si responden"
                className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[12.5px] text-text-dim hover:text-text transition-colors"
              >
                Probar
              </button>
              <button
                onClick={() => monperTab.openMcpConfig()}
                className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[12.5px] text-text-dim hover:text-text transition-colors"
              >
                Editar configuración
              </button>
            </div>
          </div>

          {servidores === null && <div className="px-4 py-4 text-[13px] text-text-faint">Cargando…</div>}

          {servidores?.length === 0 && (
            <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
              <IconPlug className="w-5 h-5 text-text-faint" />
              <div className="text-[13.5px] text-text-dim">Ningún servidor conectado</div>
              <div className="text-[12.5px] text-text-faint max-w-[420px] leading-relaxed">
                Añade uno desde «Editar configuración».
              </div>
            </div>
          )}

          {servidores?.map((sv) => (
            <div key={sv.name} className="flex items-center gap-3 px-4 py-3">
              <span
                className={'w-2 h-2 rounded-full shrink-0 ' + (sv.error ? 'bg-red-400' : sv.running ? 'bg-emerald-400' : 'bg-white/25')}
                title={sv.error ? 'con error' : sv.running ? 'en marcha' : 'se lanzará al usarlo'}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] text-text truncate">{sv.name}</div>
                <div className={'text-[12px] mt-0.5 truncate ' + (sv.error ? 'text-red-400' : 'text-text-faint')}>
                  {/* Un servidor que no arranca no puede quedarse en silencio: sin el motivo,
                      el usuario solo ve que el agente "no sabe" hacer algo. */}
                  {sv.error
                    ? sv.error
                    : !sv.enabled ? 'desactivado en la configuración'
                      : sv.running ? `${sv.tools} ${sv.tools === 1 ? 'herramienta' : 'herramientas'}`
                        : 'se lanzará la primera vez que el agente lo necesite'}
                </div>
              </div>
            </div>
          ))}
        </Card>
      </Group>

      <Group title="Lo que gana tu IA">
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
