import { useCallback, useEffect, useState, type JSX } from 'react'
import IconCopy from '~icons/tabler/copy'
import IconCheck from '~icons/tabler/check'
import { Card, Group } from './ui'

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
        Toda la IA del mundo choca contra el mismo muro: lee la web pública y nada más. Tus
        facturas, tus dashboards, tus herramientas internas — detrás de un login que ningún
        agente en la nube puede cruzar. Monper ya está dentro. Esto lo abre a tus otras IAs.
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
            <button
              role="switch"
              aria-checked={on}
              onClick={() => cambiar(!on)}
              disabled={!estado}
              className={
                'relative w-[38px] h-[22px] rounded-full shrink-0 mt-0.5 transition-colors disabled:opacity-40 ' +
                (on ? 'bg-emerald-500/80' : 'bg-white/[0.14]')
              }
            >
              <span className={'absolute top-[3px] w-4 h-4 rounded-full bg-white transition-[left] duration-150 ' + (on ? 'left-[19px]' : 'left-[3px]')} />
            </button>
          </div>

          {/* Lo que concede, en la propia página. Encenderlo es dar manos, no marcar una casilla. */}
          <div className="px-4 py-3.5 text-[12.5px] text-text-dim leading-relaxed">
            Mientras esté encendido, un cliente autorizado puede abrir páginas y actuar en los
            sitios donde tengas la sesión abierta, igual que tú. La primera vez que uno lo
            intente, Monper te preguntará por su nombre. <strong className="text-text">Nunca</strong> puede
            leer el vault ni escribir contraseñas, y verás un indicador fijo en el sidebar
            mientras esté activo.
          </div>
        </Card>
      </Group>

      <Group title="Conectar tu cliente">
        <Card>
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className="flex-1 min-w-0 text-[12.5px] text-text-dim leading-relaxed">
              Pega esto en la config MCP de Claude Code, Cursor o el cliente que uses. No hace
              falta copiar ningún token: <code className="text-text-dim">monper-mcp</code> lo lee
              de la carpeta de Monper.
            </div>
            <Copiar texto={CONFIG} />
          </div>
          <pre className="px-4 py-3.5 text-[12px] leading-relaxed text-text-dim overflow-x-auto select-text">
            {CONFIG}
          </pre>
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
