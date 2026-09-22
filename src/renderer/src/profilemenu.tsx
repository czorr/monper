import { t as tr, useLocale } from '@renderer/lib/i18n'
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState, type JSX } from 'react'
import type { DatosMenuPerfil, SubmenuSection } from '@shared/types'
import { Avatar } from '@renderer/components/ui'
import { PopoverPanel, PopoverRow, PopoverLabel, PopoverDivider } from '@renderer/components/popover'
import IconChevronRight from '~icons/tabler/chevron-right'
import IconCheck from '~icons/tabler/check'
import IconX from '~icons/tabler/x'
import IconUserCircle from '~icons/tabler/user-circle'
import IconDots from '~icons/tabler/dots'
import IconBookmark from '~icons/tabler/bookmark'
import IconDownload from '~icons/tabler/download'
import IconPuzzle from '~icons/tabler/puzzle'
import IconHistory from '~icons/tabler/history'
import IconCode from '~icons/tabler/code'
import IconSettings from '~icons/tabler/settings'
import IconPlus from '~icons/tabler/plus'
import IconSpy from '~icons/tabler/spy'
import './styles.css'

const pm = window.profilemenu
const Chevron = (): JSX.Element => <IconChevronRight />

/**
 * Fila que abre un submenú al pasar el ratón por encima.
 *
 * El submenú es otra ventana nativa (sale fuera de este panel), así que aquí solo se manda la
 * sección y la posición vertical de la fila; el main la coloca al lado. Al salir NO se cierra
 * de inmediato: el puntero tiene que poder cruzar el hueco hasta el submenú, igual que en el
 * peek del sidebar.
 */
function RowConSubmenu({ section, icon, label }: { section: SubmenuSection; icon: JSX.Element; label: string }): JSX.Element {
  useLocale()
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      onMouseEnter={() => {
        const r = ref.current?.getBoundingClientRect()
        if (r) pm.submenu(section, { top: Math.round(r.top), height: Math.round(r.height) })
      }}
    >
      <PopoverRow icon={icon} label={label} meta={<Chevron />} onClick={() => {
        const r = ref.current?.getBoundingClientRect()
        if (r) pm.submenu(section, { top: Math.round(r.top), height: Math.round(r.height) })
      }} />
    </div>
  )
}

const VACIO: DatosMenuPerfil = { perfil: { name: 'Tú', initials: '?', avatar: null }, perfiles: [] }

/** Iniciales de un nombre, para el avatar de los perfiles que no son el activo. */
function iniciales(n: string): string {
  const p = n.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return ((p[0][0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

function ProfileMenuWindow(): JSX.Element {
  useLocale()
  const [datos, setDatos] = useState<DatosMenuPerfil>(VACIO)
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  useEffect(() => pm.onProfile(setDatos), [])
  const act = (name: string): void => pm.action(name)

  const crear = (): void => {
    const n = nombre.trim()
    // Sin nombre no se crea: un perfil llamado "" no hay forma de distinguirlo del de al lado.
    if (!n) { setCreando(false); setNombre(''); return }
    pm.crearPerfil(n)
  }

  // Pasar por cualquier fila SIN submenú lo cierra: es lo que se espera de un menú.
  return (
    <PopoverPanel onHeight={pm.reportHeight} measure={[datos, creando]} className="profile-menu" animation="none">
      <div onMouseEnter={() => pm.submenuMaybeClose()}>
        <PopoverLabel>{tr("Profiles")}</PopoverLabel>

        {datos.perfiles.map((p) => (
          <div key={p.id} className="group relative">
            <PopoverRow
              icon={<span className="profile-menu-avatar"><Avatar initials={iniciales(p.nombre)} src={p.avatar} color={p.preferences?.color} icon={p.preferences?.icon} size="sm" /></span>}
              label={p.nombre}
              onClick={() => { if (!p.activo) pm.cambiarPerfil(p.id) }}
              meta={p.activo ? <span className="pr-6"><IconCheck className="w-4 h-4" /></span> : undefined}
            />
            {p.activo && (
              <button type="button" title={tr("Configurar perfil")} aria-label={tr("Configurar perfil")}
                onClick={() => act('profiles')}
                className="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center w-6 h-7 rounded-md text-[#a1a1a6] hover:text-[#d9d9dd] hover:bg-white/[0.08]">
                <IconDots className="w-4 h-4" />
              </button>
            )}
            {/* Quitar solo los que NO son el activo: quitarte el suelo de debajo mientras estás
                de pie encima obligaría a reiniciar a otro perfil sin haberlo pedido. */}
            {!p.activo && (
              <button
                title={tr("Quitar perfil")}
                onClick={(e) => { e.stopPropagation(); pm.borrarPerfil(p.id) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:grid place-items-center w-6 h-6 rounded-md text-text-faint hover:text-text hover:bg-white/[0.10]"
              >
                <IconX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {creando ? (
          <div className="px-2.5 py-1.5">
            <input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') crear()
                if (e.key === 'Escape') { setCreando(false); setNombre('') }
              }}
              onBlur={() => { if (!nombre.trim()) setCreando(false) }}
              placeholder={tr("Nombre del perfil")}
              className="w-full h-8 px-2.5 rounded-lg bg-white/[0.06] outline-none text-[13.5px] text-text placeholder:text-text-faint"
            />
          </div>
        ) : (
          <PopoverRow icon={<IconUserCircle />} label={tr("New profile")} onClick={() => setCreando(true)} />
        )}
      </div>

      <PopoverDivider />
      <RowConSubmenu section="bookmarks" icon={<IconBookmark />} label={tr("Bookmarks")} />
      <RowConSubmenu section="downloads" icon={<IconDownload />} label={tr("Downloads")} />
      <RowConSubmenu section="extensions" icon={<IconPuzzle />} label={tr("Extensions")} />
      <RowConSubmenu section="history" icon={<IconHistory />} label={tr("History")} />
      <RowConSubmenu section="developers" icon={<IconCode />} label={tr("Developers")} />
      <div onMouseEnter={() => pm.submenuMaybeClose()}>
          <PopoverRow icon={<IconSettings />} label={tr("Settings")} meta="⌘," onClick={() => act('settings')} />
      </div>

      <PopoverDivider />
      <PopoverRow icon={<IconPlus />} label={tr("New Tab")} meta="⌘T" onClick={() => act('new-tab')} />
      <PopoverRow icon={<IconSpy />} label={tr("Incognito Window")} meta="⇧⌘N" onClick={() => act('incognito')} />
    </PopoverPanel>
  )
}

createRoot(document.getElementById('root')!).render(<ProfileMenuWindow />)
