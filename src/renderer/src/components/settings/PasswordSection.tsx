import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import type { VaultItemMeta, VaultItemType } from '@shared/vault'
import { normalizeCredentialOrigin } from '@shared/vault'
import IconSearch from '~icons/tabler/search'
import IconCopy from '~icons/tabler/copy'
import IconEye from '~icons/tabler/eye'
import IconEyeOff from '~icons/tabler/eye-off'
import IconCheck from '~icons/tabler/check'
import IconPencil from '~icons/tabler/pencil'
import IconTrash from '~icons/tabler/trash'
import IconWorld from '~icons/tabler/world'
import IconSparkles from '~icons/tabler/sparkles'
import IconPlug from '~icons/tabler/plug'
import IconLock from '~icons/tabler/lock'
import IconShieldLock from '~icons/tabler/shield-lock'
import IconAlert from '~icons/tabler/alert-triangle'
import IconPlus from '~icons/tabler/plus'
import { Card, Group, SettingsHeader } from './ui'

const { titanioTab } = window

const GRUPOS: { type: VaultItemType; title: string; vacio: string; Icon: typeof IconWorld }[] = [
  { type: 'web-credential', title: 'Sitios web', vacio: 'Cuando inicies sesión en un sitio, Titanio te ofrecerá guardarlo.', Icon: IconWorld },
  { type: 'ai-key', title: 'API keys de IA', vacio: 'Se guardan solas al conectar un proveedor en la sección AI.', Icon: IconSparkles },
  { type: 'service-token', title: 'Tokens de servicio', vacio: 'No hay tokens guardados.', Icon: IconPlug },
  { type: 'secret', title: 'Otros secretos', vacio: 'No hay otros secretos guardados.', Icon: IconLock }
]

/** Lo que identifica al ítem debajo de su nombre. Cada tipo lo tiene en un sitio distinto. */
function subtitulo(i: VaultItemMeta): string {
  if (i.type === 'web-credential') return i.data.username || i.data.origin || ''
  if (i.type === 'ai-key') return i.data.kind === 'openai' ? 'OpenAI' : i.data.kind === 'anthropic' ? 'Anthropic' : 'Proveedor'
  if (i.type === 'service-token') return i.data.service || ''
  return i.data.name || ''
}

/** Segundos que la contraseña se queda a la vista antes de taparse sola. */
const VER_TTL = 15_000

/**
 * Icono del ítem: el favicon real del sitio si lo conocemos, y si no el candado.
 *
 * El favicon sale de la caché local de sitios visitados. Nunca se le pide a un servicio de
 * terceros: mandarle a Google la lista de dominios donde el usuario tiene cuenta sería
 * exactamente lo contrario de lo que promete este panel.
 */
function IconoItem({ favicon }: { favicon?: string }): JSX.Element {
  const [roto, setRoto] = useState(false)
  return (
    <span className="w-8 h-8 rounded-lg grid place-items-center bg-white/[0.05] text-text-dim shrink-0 overflow-hidden">
      {favicon && !roto
        ? <img src={favicon} alt="" className="w-[17px] h-[17px] rounded-[3px] object-contain" onError={() => setRoto(true)} />
        : <IconShieldLock className="w-[17px] h-[17px]" />}
    </span>
  )
}

function Fila({ item, favicon, onCambio }: { item: VaultItemMeta; favicon?: string; onCambio: (l: VaultItemMeta[]) => void }): JSX.Element {
  const [copiado, setCopiado] = useState(false)
  const [visible, setVisible] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [label, setLabel] = useState(item.label)
  const [usuario, setUsuario] = useState(item.data.username ?? '')
  const [sitio, setSitio] = useState(item.data.origin ?? item.data.url ?? '')
  const [servicio, setServicio] = useState(item.data.service ?? '')
  const [cuenta, setCuenta] = useState(item.data.account ?? '')
  const [nombreSecreto, setNombreSecreto] = useState(item.data.name ?? '')
  const [nuevoSecreto, setNuevoSecreto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const editar = (): void => {
    setLabel(item.label); setUsuario(item.data.username ?? '')
    setSitio(item.data.origin ?? item.data.url ?? '')
    setServicio(item.data.service ?? ''); setCuenta(item.data.account ?? '')
    setNombreSecreto(item.data.name ?? '')
    setNuevoSecreto(''); setVisible(null); setError(''); setEditando(true)
  }
  const cancelar = (): void => { setNuevoSecreto(''); setError(''); setEditando(false) }

  const copiar = async (): Promise<void> => {
    const ok = await titanioTab.vaultCopy(item.id)
    if (!ok) { setError('No se pudo leer el secreto. ¿Se guardó con otro usuario del sistema?'); return }
    setError('')
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1800)
  }

  /**
   * Enseña la contraseña. Se pide al pulsar y se tapa sola: dejarla a la vista es lo que
   * convierte "mirar mi clave" en "mi clave está en pantalla cuando alguien pasa por detrás".
   */
  const alternarVer = async (): Promise<void> => {
    if (visible !== null) { setVisible(null); return }
    const v = await titanioTab.vaultReveal(item.id)
    if (v === null) { setError('No se pudo leer el secreto.'); return }
    setError('')
    setVisible(v)
    setTimeout(() => setVisible(null), VER_TTL)
  }

  const guardar = async (): Promise<void> => {
    const l = label.trim()
    if (guardando) return
    if (!l) { setError('Introduce un nombre.'); return }
    const patch: { label: string; data?: Record<string, string>; secret?: string } = { label: l }
    if (item.type === 'web-credential') {
      const origin = normalizeCredentialOrigin(sitio)
      if (!origin) { setError('Escribe un sitio HTTP o HTTPS válido.'); return }
      patch.data = { origin, username: usuario.trim() }
    } else if (item.type === 'service-token') {
      if (!servicio.trim()) { setError('Indica el servicio del token.'); return }
      patch.data = { service: servicio.trim(), account: cuenta.trim() }
    } else if (item.type === 'secret') {
      patch.data = { name: nombreSecreto.trim() || l }
    }
    if (nuevoSecreto) patch.secret = nuevoSecreto
    setError(''); setGuardando(true)
    try {
      onCambio(await titanioTab.vaultUpdate(item.id, patch))
      setNuevoSecreto(''); setVisible(null); setEditando(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar los cambios.')
    } finally { setGuardando(false) }
  }

  const borrar = async (): Promise<void> => {
    onCambio(await titanioTab.vaultRemove(item.id))
  }

  const campo = 'h-8 px-2.5 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[13px] text-text outline-none focus:border-white/30 select-text'

  if (editando) {
    return (
      <form className="px-4 py-3 flex flex-col gap-2 bg-white/[0.03]"
        onSubmit={(e) => { e.preventDefault(); void guardar() }}
        onKeyDown={(e) => { if (e.key === 'Escape' && !guardando) { e.preventDefault(); cancelar() } }}>
        <fieldset disabled={guardando} className="flex flex-col gap-2 min-w-0 border-0 p-0">
        <label className="flex flex-col gap-1 text-xs text-text-dim">Nombre
          <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus className={campo} />
        </label>
        {item.type === 'web-credential' && (
          <>
            <label className="flex flex-col gap-1 text-xs text-text-dim">Sitio
              <input value={sitio} onChange={(e) => setSitio(e.target.value)} placeholder="https://example.com" className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">Usuario o correo
              <input value={usuario} onChange={(e) => setUsuario(e.target.value)} className={campo} />
            </label>
          </>
        )}
        {item.type === 'service-token' && (
          <>
            <label className="flex flex-col gap-1 text-xs text-text-dim">Servicio
              <input value={servicio} onChange={(e) => setServicio(e.target.value)} className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">Cuenta (opcional)
              <input value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={campo} />
            </label>
          </>
        )}
        {item.type === 'secret' && (
          <label className="flex flex-col gap-1 text-xs text-text-dim">Identificador
            <input value={nombreSecreto} onChange={(e) => setNombreSecreto(e.target.value)} className={campo} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          {item.type === 'web-credential' ? 'Nueva contraseña' : 'Nuevo valor secreto'}
          <input type="password" autoComplete="new-password" value={nuevoSecreto} onChange={(e) => setNuevoSecreto(e.target.value)} placeholder="Dejar vacío para conservar el actual" className={campo} />
        </label>
        <p className="text-xs text-text-faint">Actualiza el valor guardado en Titanio; no cambia la contraseña ni el token en el servicio.</p>
        {error && <p role="alert" className="text-xs text-amber-400">{error}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" className="h-8 px-3 rounded-lg bg-white/90 text-black text-[12.5px] font-medium hover:bg-white transition-colors disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" onClick={cancelar} className="h-8 px-3 rounded-lg text-[12.5px] text-text-dim hover:text-text transition-colors">Cancelar</button>
        </div>
        </fieldset>
      </form>
    )
  }

  return (
    <div className="group/v flex items-center gap-3.5 px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <IconoItem favicon={favicon} />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] text-text leading-tight truncate">{item.label}</div>
        <div className="text-[12.5px] text-text-dim mt-0.5 truncate">
          {subtitulo(item)}
          {visible !== null ? (
            // Monoespaciada y seleccionable: se lee para teclearla en otro sitio, y una
            // proporcional confunde l con 1 y O con 0 justo cuando más caro sale.
            <span className="ml-2 font-mono text-[12.5px] text-text select-text break-all">{visible}</span>
          ) : (
            // Los puntos son decorativos y de longitud fija: pintar la real filtraría cuánto
            // mide la contraseña a quien mire la pantalla de lejos.
            <span className="ml-2 text-text-faint tracking-[0.15em]">••••••••</span>
          )}
        </div>
        {error && <div className="text-[12px] text-amber-400 mt-1">{error}</div>}
      </div>

      {/* Las cuatro acciones aparecen juntas al pasar por encima, como en el gestor de
          marcadores. Antes ojo y copiar estaban siempre y editar/borrar solo al hover: dos
          reglas distintas en la misma fila, que es lo que se veía mal. El contenedor reserva
          su ancho para que la fila no salte al aparecer. */}
      <div className={'flex items-center gap-1 shrink-0 transition-opacity focus-within:opacity-100 ' +
        // Con la contraseña a la vista los botones NO se esconden: si desaparecieran al apartar
        // el ratón, no habría forma de volver a taparla salvo esperar los 15 s.
        (visible !== null || copiado ? 'opacity-100' : 'opacity-0 group-hover/v:opacity-100')}>
        <button
          onClick={() => void alternarVer()}
          title={visible !== null ? 'Ocultar' : 'Ver la contraseña (se tapa sola en 15 s)'}
          className="w-8 h-8 grid place-items-center rounded-lg text-text-faint hover:text-text hover:bg-white/[0.08] transition-colors [&>svg]:w-4 [&>svg]:h-4"
        >
          {visible !== null ? <IconEyeOff /> : <IconEye />}
        </button>
        <button
          onClick={() => void copiar()}
          title="Copiar al portapapeles (se borra solo en 30 s)"
          className={'w-8 h-8 grid place-items-center rounded-lg transition-colors [&>svg]:w-4 [&>svg]:h-4 ' +
            (copiado ? 'text-emerald-400' : 'text-text-faint hover:text-text hover:bg-white/[0.08]')}
        >
          {copiado ? <IconCheck /> : <IconCopy />}
        </button>
        <button onClick={editar} title="Editar"
          className="w-8 h-8 grid place-items-center rounded-lg text-text-faint hover:text-text hover:bg-white/[0.08] transition-colors [&>svg]:w-4 [&>svg]:h-4">
          <IconPencil />
        </button>
        <button onClick={() => void borrar()} title="Borrar"
          className="w-8 h-8 grid place-items-center rounded-lg text-text-faint hover:text-red-400 hover:bg-red-500/15 transition-colors [&>svg]:w-4 [&>svg]:h-4">
          <IconTrash />
        </button>
      </div>
    </div>
  )
}


/**
 * Alta manual de un ítem.
 *
 * Lo normal es que una credencial entre sola al hacer login, pero hay dos casos en que no:
 * sitios que no disparan la captura, y todo lo que no es un login (tokens, secretos sueltos).
 * Sin esto, el vault solo se llenaba por accidente.
 */
function Alta({ onHecho, onCancelar }: { onHecho: (l: VaultItemMeta[]) => void; onCancelar: () => void }): JSX.Element {
  const [type, setType] = useState<VaultItemType>('web-credential')
  const [label, setLabel] = useState('')
  const [sitio, setSitio] = useState('')
  const [usuario, setUsuario] = useState('')
  const [secreto, setSecreto] = useState('')
  const [error, setError] = useState('')

  const campo = 'w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[13.5px] text-text outline-none focus:border-white/30 select-text'

  const guardar = async (): Promise<void> => {
    if (!secreto) { setError(type === 'web-credential' ? 'Introduce la contraseña.' : 'Introduce el valor que quieres guardar.'); return }
    const data: Record<string, string> = {}
    let nombre = label.trim()

    if (type === 'web-credential') {
      const origin = normalizeCredentialOrigin(sitio)
      if (!origin) { setError('Introduce un sitio válido, por ejemplo, github.com.'); return }
      data.origin = origin
      data.username = usuario.trim()
      // El nombre por defecto es el dominio: obligar a escribirlo cuando ya lo has puesto en
      // el sitio es pedir dos veces lo mismo.
      if (!nombre) nombre = origin.replace(/^https?:\/\//, '')
    } else if (type === 'secret') {
      data.name = nombre || 'Secreto'
    } else if (type === 'service-token') {
      data.service = nombre || 'Servicio'
    }
    if (!nombre) { setError('Introduce un nombre.'); return }

    try {
      onHecho(await titanioTab.vaultAdd(type, nombre, data, secreto))
      onCancelar()
    } catch (e) {
      console.error('[vault] no se pudo guardar:', e)
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Puede que el llavero del sistema no esté disponible.')
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-white/[0.10] bg-white/[0.03] p-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {/* Solo los tipos que tiene sentido crear a mano: las API keys se guardan solas al
            conectar un proveedor, y duplicarlas aquí dejaría dos fuentes de verdad. */}
        {([['web-credential', 'Sitio web'], ['service-token', 'Token'], ['secret', 'Secreto']] as const).map(([t, l]) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={'h-7 px-3 rounded-lg text-[12.5px] transition-colors ' +
              (type === t ? 'bg-white/[0.14] text-text' : 'text-text-dim hover:text-text')}
          >
            {l}
          </button>
        ))}
      </div>

      {type === 'web-credential' && (
        <>
          <input value={sitio} onChange={(e) => setSitio(e.target.value)} placeholder="github.com" autoFocus className={campo} />
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Usuario o correo" className={campo} />
        </>
      )}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={type === 'web-credential' ? 'Nombre (opcional)' : 'Nombre'}
        autoFocus={type !== 'web-credential'}
        className={campo}
      />
      {/* type=password aquí sí: es un campo de entrada, no enseñar un secreto guardado. */}
      <input
        type="password"
        value={secreto}
        onChange={(e) => setSecreto(e.target.value)}
        placeholder={type === 'web-credential' ? 'Contraseña' : 'Valor'}
        className={campo}
        onKeyDown={(e) => { if (e.key === 'Enter') void guardar() }}
      />

      {error && <div className="text-[12.5px] text-amber-400">{error}</div>}

      <div className="flex items-center gap-2">
        <button onClick={() => void guardar()} className="h-8 px-3 rounded-lg bg-white/90 text-black text-[12.5px] font-medium hover:bg-white transition-colors">Guardar</button>
        <button onClick={onCancelar} className="h-8 px-3 rounded-lg text-[12.5px] text-text-dim hover:text-text transition-colors">Cancelar</button>
      </div>
    </div>
  )
}

/**
 * Settings → Password: el vault, con pantalla propia.
 *
 * Hasta ahora solo se llegaba por el candado del topbar, que es un popover pensado para
 * rellenar rápido — no para ver qué tienes guardado, renombrarlo ni limpiarlo. Peor aún: el
 * importador ya traía las contraseñas de Chrome y desaparecían en un cajón sin puerta.
 *
 * Revelar es una acción explícita; al editar se pide solo el reemplazo y nunca se carga
 * el secreto existente dentro del formulario.
 */
export default function PasswordSection(): JSX.Element {
  const [items, setItems] = useState<VaultItemMeta[]>([])
  const [favicons, setFavicons] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [disponible, setDisponible] = useState(true)
  const [anadiendo, setAnadiendo] = useState(false)
  const [error, setError] = useState('')

  const leer = useCallback(async (): Promise<void> => {
    try {
      setItems(await titanioTab.vaultList())
      setFavicons(await titanioTab.vaultFavicons())
      setDisponible(await titanioTab.vaultAvailable())
      setError('')
    } catch (e) {
      console.error('[vault] no se pudo leer:', e)
      setError('No se pudo cargar el vault. Reinicia Titanio e inténtalo de nuevo.')
    }
  }, [])
  // Se escucha además de leer: se puede guardar una credencial desde otra pestaña mientras
  // esto está abierto, y la lista tiene que contarlo.
  // `onVaultChanged(setItems)` refrescaba SOLO la lista: los iconos se leían una vez al montar
  // y no volvían a mirarse nunca. Los de sitios nunca visitados se resuelven en segundo plano y
  // llegan después, así que se quedaban invisibles para siempre. Se recarga todo.
  useEffect(() => { void leer(); return titanioTab.onVaultChanged(() => { void leer() }) }, [leer])

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return items
    return items.filter((i) =>
      i.label.toLowerCase().includes(t) || subtitulo(i).toLowerCase().includes(t) || (i.data.origin ?? '').toLowerCase().includes(t))
  }, [items, q])

  return (
    <div>
      <SettingsHeader
        title="Password"
        description="Contraseñas, claves y tokens guardados con el cifrado del sistema."
        actions={<>
          <button
            onClick={() => setAnadiendo((v) => !v)}
            disabled={!disponible}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-40 disabled:hover:bg-white/[0.06] text-[12.5px] text-text transition-colors [&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-text-dim"
          >
            <IconPlus /> Añadir
          </button>
          <span className="text-[13px] text-text-faint tabular-nums">{items.length}</span>
        </>}
      />

      {anadiendo && <Alta onHecho={setItems} onCancelar={() => setAnadiendo(false)} />}

      {!disponible && (
        <div className="mb-5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3.5 py-3 flex items-start gap-2.5">
          <IconAlert className="w-[17px] h-[17px] text-amber-400 shrink-0 mt-px" />
          <div className="text-[13px] text-text-dim">
            El llavero del sistema no está disponible. No se pueden guardar secretos.
          </div>
        </div>
      )}

      {error && <div className="mb-5 text-[12.5px] text-amber-400">{error}</div>}

      <div className="relative mb-5">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, usuario o sitio"
          className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13.5px] text-text outline-none focus:border-white/25 placeholder:text-text-faint transition-colors select-text"
        />
      </div>

      {GRUPOS.map(({ type, title, vacio, Icon }) => {
        const del = filtrados.filter((i) => i.type === type)
        // Buscando, un grupo sin resultados no debe enseñar su texto de "aún no tienes":
        // diría que no tienes ninguno cuando lo que pasa es que no coincide con la búsqueda.
        if (q.trim() && del.length === 0) return null
        return (
          <Group key={type} title={title}>
            {del.length > 0 ? (
              <Card>{del.map((i) => <Fila key={i.id} item={i} favicon={favicons[i.data.origin ?? '']} onCambio={setItems} />)}</Card>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[0.08] px-4 py-5 flex items-center gap-3">
                <Icon className="w-[18px] h-[18px] text-text-faint shrink-0" />
                <span className="text-[13px] text-text-dim">{vacio}</span>
              </div>
            )}
          </Group>
        )
      })}

      <p className="text-[12.5px] text-text-faint leading-relaxed">
        Importa contraseñas de otro navegador desde <span className="text-text-dim">General → Importar</span>.
      </p>
    </div>
  )
}
