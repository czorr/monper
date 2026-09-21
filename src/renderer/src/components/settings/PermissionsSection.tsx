import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import type { PermKey, PermSite, PermState } from '@shared/types'
import IconCamera from '~icons/tabler/camera'
import IconMic from '~icons/tabler/microphone'
import IconMapPin from '~icons/tabler/map-pin'
import IconBell from '~icons/tabler/bell'
import IconClipboard from '~icons/tabler/clipboard'
import IconLock from '~icons/tabler/lock-check'
import IconWorld from '~icons/tabler/world'
import IconSearch from '~icons/tabler/search'
import IconChevron from '~icons/tabler/chevron-down'
import { Card, Group, Toggle } from './ui'

const { titanioTab } = window

/** Las mismas etiquetas e iconos que el candado del sitio: es el mismo dato en otra vista. */
const PERM: Record<PermKey, { label: string; Icon: typeof IconCamera }> = {
  camera: { label: 'Cámara', Icon: IconCamera },
  microphone: { label: 'Micrófono', Icon: IconMic },
  geolocation: { label: 'Ubicación', Icon: IconMapPin },
  notifications: { label: 'Notificaciones', Icon: IconBell },
  clipboard: { label: 'Portapapeles', Icon: IconClipboard }
}

function prettyOrigin(origin: string): string {
  try { return new URL(origin).hostname.replace(/^www\./, '') } catch { return origin }
}


/**
 * El favicon real del sitio, o el globo local.
 *
 * Nunca un servicio de terceros: pedirle el icono a Google por cada sitio donde diste un
 * permiso sería filtrar justo esta lista. Ver docs/browser-hardening.md.
 */
function SiteIcon({ src }: { src: string | null }): JSX.Element {
  const [roto, setRoto] = useState(false)
  return (
    <span className="w-7 h-7 rounded-lg grid place-items-center bg-white/[0.05] shrink-0 overflow-hidden">
      {src && !roto
        ? <img src={src} alt="" className="w-4 h-4 object-contain" onError={() => setRoto(true)} />
        : <IconWorld className="w-4 h-4 text-text-faint" />}
    </span>
  )
}

/** "Cámara y Ubicación" — lo que la fila cerrada tiene que decir sin abrirse. */
function resumen(site: PermSite): string {
  const nombres = site.perms.map((p) => PERM[p.key].label)
  if (nombres.length === 1) return nombres[0]
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

function SiteRow({
  site,
  open,
  onToggleOpen,
  onSet,
  onForget
}: {
  site: PermSite
  open: boolean
  onToggleOpen: () => void
  onSet: (key: PermKey, state: PermState) => void
  onForget: () => void
}): JSX.Element {
  const bloqueados = site.perms.filter((p) => p.state === 'denied').length
  const permitidos = site.perms.length - bloqueados

  return (
    <div>
      {/* La cabecera entera abre y cierra. Los controles viven dentro, al desplegar, para que
          no haya nada que se pueda pulsar por error al ir a expandir. */}
      <button onClick={onToggleOpen} className="flex items-center gap-3.5 w-full px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
        <SiteIcon src={site.favicon} />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] text-text leading-tight truncate">{prettyOrigin(site.origin)}</div>
          <div className="text-[12.5px] text-text-dim mt-0.5 truncate">{resumen(site)}</div>
        </div>
        <span className="flex items-center gap-1.5 shrink-0 text-[12px] tabular-nums">
          {permitidos > 0 && <span className="text-emerald-400/90">{permitidos} permitido{permitidos === 1 ? '' : 's'}</span>}
          {permitidos > 0 && bloqueados > 0 && <span className="text-text-faint">·</span>}
          {bloqueados > 0 && <span className="text-text-faint">{bloqueados} bloqueado{bloqueados === 1 ? '' : 's'}</span>}
        </span>
        <IconChevron
          className={'w-4 h-4 text-text-faint shrink-0 transition-transform duration-150 ' + (open ? 'rotate-180' : '')}
        />
      </button>

      {open && (
        <div className="px-4 pb-3.5 pl-[62px] flex flex-col gap-2.5">
          {site.perms.map(({ key, state }) => {
            const { label, Icon } = PERM[key]
            return (
              <div key={key} className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-text-faint shrink-0" />
                <span className="flex-1 text-[13px] text-text-dim">{label}</span>
                <span className={'text-[12px] shrink-0 ' + (state === 'granted' ? 'text-emerald-400' : 'text-text-faint')}>
                  {state === 'granted' ? 'Permitido' : 'Bloqueado'}
                </span>
                <Toggle on={state === 'granted'} onChange={(v) => onSet(key, v ? 'granted' : 'denied')} />
              </div>
            )
          })}
          <div className="flex items-center gap-3 pt-1">
            <span className="flex-1 text-[12px] text-text-faint truncate">{site.origin}</span>
            <button onClick={onForget} className="text-[12.5px] text-text-faint hover:text-red-400 transition-colors shrink-0">
              Olvidar este sitio
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PermissionsSection(): JSX.Element {
  const [sites, setSites] = useState<PermSite[] | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)

  const load = useCallback(async (resolve?: boolean): Promise<void> => {
    // Si el IPC no responde, la lista vacía es indistinguible de "no has dado ningún
    // permiso" — y eso es justo lo que no debe pasar en una pantalla de privacidad.
    try {
      setSites(await titanioTab.listSitePermissions(resolve))
      setError('')
    } catch (e) {
      console.error('[permisos] no se pudo leer la lista:', e)
      setSites([])
      setError('No se pudieron leer los permisos. Reinicia Titanio: los cambios en el preload necesitan reiniciar la app, no solo recargar.')
    }
  }, [])

  // Dos pasadas: pintar ya con los iconos en caché y volver a pedirla resolviendo los que
  // falten. Si se esperara a la segunda, la página tardaría lo que tarde el sitio más lento.
  useEffect(() => { void load().then(() => load(true)) }, [load])

  const set = async (origin: string, key: PermKey, state: PermState): Promise<void> => {
    // Optimista, y luego se relee: el main es la fuente de verdad.
    setSites((prev) => prev && prev.map((s) => s.origin === origin
      ? { ...s, perms: s.perms.map((p) => (p.key === key ? { ...p, state } : p)) }
      : s))
    if (!(await titanioTab.setSitePermission(origin, key, state))) void load()
  }

  const forget = async (origin: string | null): Promise<void> => {
    if (!origin && !confirm('¿Olvidar los permisos de todos los sitios? Volverán a preguntarte la próxima vez.')) return
    await titanioTab.clearSitePermissions(origin)
    void load()
  }

  // Se busca por el origen completo, no solo por el dominio bonito: quien escribe "https"
  // o un puerto espera encontrarlo.
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t || !sites) return sites
    return sites.filter((s) => s.origin.toLowerCase().includes(t))
  }, [sites, q])

  const hayAlguno = !!sites?.length

  return (
    <>
      <h1 className="text-[30px] font-semibold tracking-tight mb-3">Permissions</h1>
      <p className="text-[13.5px] text-text-dim leading-relaxed mb-7">
        Los sitios sobre los que ya has decidido algo. Al olvidarlos, volverán a preguntarte.
      </p>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[13px] text-amber-300 leading-relaxed">
          {error}
        </div>
      )}

      {/* El buscador solo aparece cuando hay algo que buscar: con dos sitios estorba. */}
      {(sites?.length ?? 0) > 4 && (
        <div className="relative mb-3">
          <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar un sitio"
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13.5px] text-text outline-none focus:border-white/25 placeholder:text-text-faint transition-colors"
          />
        </div>
      )}

      <Group title="Sitios">
        <Card>
          {sites === null && <div className="px-4 py-4 text-[13px] text-text-faint">Cargando…</div>}

          {sites?.length === 0 && !error && (
            <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
              <IconLock className="w-6 h-6 text-text-faint" />
              <div className="text-[13.5px] text-text-dim">Ningún sitio te ha pedido permisos todavía</div>
              <div className="text-[12.5px] text-text-faint max-w-[380px] leading-relaxed">
                Cuando una página pida la cámara, el micrófono o tu ubicación, tu respuesta
                aparecerá aquí.
              </div>
            </div>
          )}

          {/* Buscar y no encontrar tiene que decirse: si no, parece que se borraron. */}
          {hayAlguno && filtrados?.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-text-faint">
              Ningún sitio coincide con “{q.trim()}”
            </div>
          )}

          {filtrados?.map((s) => (
            <SiteRow
              key={s.origin}
              site={s}
              open={abierto === s.origin}
              onToggleOpen={() => setAbierto((a) => (a === s.origin ? null : s.origin))}
              onSet={(key, state) => set(s.origin, key, state)}
              onForget={() => forget(s.origin)}
            />
          ))}
        </Card>
      </Group>

      {hayAlguno && (
        <Group title="Todo">
          <Card>
            <div className="flex items-center gap-3.5 px-4 py-3.5">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-text leading-tight">Olvidar todos los permisos</div>
                <div className="text-[12.5px] text-text-dim mt-0.5">
                  {sites!.length} {sites!.length === 1 ? 'sitio' : 'sitios'} volverán a preguntarte
                </div>
              </div>
              <button
                onClick={() => forget(null)}
                className="text-[13px] font-medium px-3.5 py-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors shrink-0"
              >
                Olvidar todo
              </button>
            </div>
          </Card>
        </Group>
      )}

      {/* Lo que esta sección va a ser y todavía no es. Se dice, no se insinúa con un control
          que no hace nada: ver el comentario de GeneralPage. */}
      <Group title="Del agente · Pronto">
        <Card>
          <div className="p-5 flex flex-col gap-3">
            {['Acciones que el agente debe confirmar antes de hacer', 'Sitios donde el agente no puede entrar'].map((b) => (
              <div key={b} className="flex items-start gap-3 text-[13.5px] text-text-dim">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-white/25 shrink-0" />
                {b}
              </div>
            ))}
          </div>
        </Card>
      </Group>
    </>
  )
}
