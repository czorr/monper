import { useCallback, useEffect, useState, type JSX } from 'react'
import type { AdblockInfo } from '@shared/types'
import IconShield from '~icons/tabler/shield-check'
import IconTrash from '~icons/tabler/trash'
import { Card, Group, Row, Toggle } from './ui'

const { monperTab } = window

/**
 * Settings → Adblocker.
 *
 * Se bloquea a nivel de RED: la petición al servidor de anuncios no llega a salir. Eso es lo
 * que hace que la página cargue antes, no solo que se vea más limpia — y por eso todavía no
 * hay filtros cosméticos: el hueco del anuncio puede quedarse ahí. Se dice en la propia
 * página en vez de que el usuario lo descubra y crea que está roto.
 */
export default function AdblockSection(): JSX.Element {
  const [estado, setEstado] = useState<AdblockInfo | null>(null)
  const [error, setError] = useState('')

  const leer = useCallback(async (): Promise<void> => {
    try {
      setEstado(await monperTab.getAdblockState())
      setError('')
    } catch (e) {
      console.error('[adblock] no se pudo leer el estado:', e)
      setError('No se pudo leer el estado. Reinicia Monper: los cambios en el preload necesitan reiniciar la app, no solo recargar.')
    }
  }, [])
  useEffect(() => { void leer() }, [leer])

  const cambiar = async (on: boolean): Promise<void> => {
    setEstado((s) => (s ? { ...s, enabled: on } : s)) // feedback inmediato
    try {
      const real = await monperTab.setAdblockEnabled(on)
      setEstado((s) => (s ? { ...s, enabled: real } : s))
    } catch (e) {
      console.error('[adblock] no se pudo cambiar el estado:', e)
      void leer()
    }
  }

  const quitarExcepcion = async (host: string): Promise<void> => {
    setEstado((s) => (s ? { ...s, allow: s.allow.filter((a) => a !== host) } : s))
    try {
      await monperTab.setAdblockAllowed(host, false)
    } catch (e) {
      console.error('[adblock] no se pudo quitar la excepción:', e)
      void leer()
    }
  }

  const on = !!estado?.enabled

  return (
    <>
      <h1 className="text-[30px] font-semibold tracking-tight mb-3">Adblocker</h1>
      <p className="text-[13.5px] text-text-dim leading-relaxed mb-7">
        Bloquea anuncios y rastreadores antes de que salgan de tu máquina.
      </p>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[13px] text-amber-300 leading-relaxed">
          {error}
        </div>
      )}

      <Group title="Bloqueo">
        <Card>
          <div className="flex items-start gap-3.5 px-4 py-3.5">
            <span className="w-8 h-8 rounded-lg grid place-items-center bg-white/[0.05] text-text-dim shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px]">
              <IconShield />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-text leading-tight">Bloquear anuncios y rastreadores</div>
              <div className="text-[12.5px] text-text-dim mt-1 leading-relaxed">
                {estado && !estado.ready
                  ? 'Cargando las listas de filtros…'
                  : on
                    ? 'Activo en todas las pestañas, y también cuando el agente navega por su cuenta.'
                    : 'Apagado. Las páginas cargan con su publicidad y sus rastreadores.'}
              </div>
            </div>
            <div className="mt-0.5">
              <Toggle on={on} onChange={cambiar} disabled={!estado} />
            </div>
          </div>

          <div className="px-4 py-3.5 text-[12.5px] text-text-dim leading-relaxed">
            Si un sitio se rompe, desactívalo solo ahí desde el candado de la barra de
            direcciones.
          </div>
        </Card>
      </Group>

      {!!estado?.allow.length && (
        <Group title="Sitios sin bloqueo">
          <Card>
            {estado.allow.map((host) => (
              <Row key={host} label={host}>
                <button
                  onClick={() => void quitarExcepcion(host)}
                  title="Volver a bloquear aquí"
                  className="w-8 h-8 rounded-lg grid place-items-center text-text-faint hover:text-text hover:bg-white/[0.06] transition-colors [&>svg]:w-[17px] [&>svg]:h-[17px]"
                >
                  <IconTrash />
                </button>
              </Row>
            ))}
          </Card>
        </Group>
      )}
    </>
  )
}
