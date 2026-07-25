import { useEffect, useLayoutEffect, useRef, type JSX, type ReactNode } from 'react'
import { useNoInitialFocus } from './focus'

/**
 * Primitivas compartidas por TODAS las ventanas nativas flotantes (site-info, menú de
 * perfil, extensiones, vault, sign-in, peek…).
 *
 * Antes cada ventana traía su propio panel y sus propias filas: 6 diseños de contenedor
 * y 5 clases de row distintas (paddings, sombras, hovers y tamaños de icono diferentes).
 * Todo lo visual vive aquí; las ventanas solo componen.
 */

// ---- Tokens: un único lugar donde vive el look de los popovers ----
const PANEL =
  'rounded-2xl border border-white/10 bg-[#1c1c20]/95 backdrop-blur-md ' +
  'shadow-2xl shadow-black/50 overflow-hidden'
/** Margen alrededor del panel: deja aire para la sombra dentro de la ventana nativa. */
export const POPOVER_PAD = 12

const ROW_BASE =
  'flex items-center gap-3 w-full h-9 px-2.5 rounded-lg text-[13.5px] text-left ' +
  'transition-colors outline-none [&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:shrink-0'
const ROW_IDLE = 'text-text-dim hover:bg-white/[0.06] hover:text-text [&>svg]:text-text-faint'
const ROW_ACTIVE = 'bg-white/[0.10] text-text [&>svg]:text-text-dim'
const ROW_DANGER = 'text-text-dim hover:bg-red-500/15 hover:text-red-400 [&>svg]:text-text-faint'
const ROW_OFF = 'text-text-faint opacity-50 cursor-default [&>svg]:text-text-faint'

interface PanelProps {
  children: ReactNode
  /** Reporta el alto del contenido al main para dimensionar la ventana. */
  onHeight?: (h: number) => void
  /** Dependencias que, al cambiar, obligan a re-medir. */
  measure?: unknown
  /** El panel ocupa toda la altura de la ventana (peek) en vez de ajustarse al contenido. */
  fill?: boolean
  /** Padding interno; por defecto el de una lista de menú. */
  padded?: boolean
  /** Animación CSS (shorthand). Solo el peek la cambia: entra y sale como un cajón. */
  animation?: string
  className?: string
}

/**
 * El contenedor de todo popover: card + medición de alto + animación de entrada.
 * La ventana nativa se dimensiona con el alto que reportamos aquí.
 */
const ANIM_DEFAULT = 'peek-in 140ms cubic-bezier(0.33,1,0.68,1)'

export function PopoverPanel({ children, onHeight, measure, fill, padded = true, className = '', animation = ANIM_DEFAULT }: PanelProps): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  useNoInitialFocus() // un popover no abre con una fila resaltada

  useLayoutEffect(() => {
    if (!onHeight || !box.current) return
    onHeight(Math.ceil(box.current.getBoundingClientRect().height))
  }, [onHeight, measure])

  // Re-mide si el contenido cambia de tamaño por su cuenta (imágenes, texto que llega tarde).
  useEffect(() => {
    if (!onHeight || !box.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (box.current) onHeight(Math.ceil(box.current.getBoundingClientRect().height))
    })
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [onHeight])

  return (
    <div className={fill ? 'h-full p-3' : 'p-3'}>
      <div
        ref={box}
        style={{ animation }}
        className={`${PANEL} ${fill ? 'h-full flex flex-col' : ''} ${padded ? 'p-1.5' : ''} ${className}`}
      >
        {children}
      </div>
    </div>
  )
}

interface RowProps {
  children?: ReactNode
  /** Icono a la izquierda (tabler, 18px). */
  icon?: ReactNode
  /** Texto principal; usar en vez de children para el caso común. */
  label?: string
  /** Contenido a la derecha: atajo, chevron, toggle… */
  meta?: ReactNode
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  danger?: boolean
  title?: string
}

/** Fila estándar de un popover. Es la ÚNICA fila: no crear variantes por ventana. */
export function PopoverRow({ children, icon, label, meta, onClick, active, disabled, danger, title }: RowProps): JSX.Element {
  const state = disabled ? ROW_OFF : active ? ROW_ACTIVE : danger ? ROW_DANGER : ROW_IDLE
  const Tag = onClick && !disabled ? 'button' : 'div'
  return (
    <Tag
      {...(onClick && !disabled ? { onClick, type: 'button' as const } : {})}
      title={title}
      className={`${ROW_BASE} ${state}`}
    >
      {icon}
      <span className="flex-1 min-w-0 truncate">{label ?? children}</span>
      {meta && <span className="shrink-0 flex items-center gap-2 text-[12px] text-text-faint">{meta}</span>}
    </Tag>
  )
}

/** Etiqueta de sección ("Profiles", "Instaladas"…). */
export function PopoverLabel({ children }: { children: ReactNode }): JSX.Element {
  return <div className="px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-text-faint">{children}</div>
}

export function PopoverDivider(): JSX.Element {
  return <div className="h-px bg-white/[0.07] mx-1.5 my-1" />
}

/** Lista con scroll interno para popovers con muchos items. */
export function PopoverList({ children, max = 320 }: { children: ReactNode; max?: number }): JSX.Element {
  return (
    <div className="overflow-y-auto [&::-webkit-scrollbar]:w-0" style={{ maxHeight: max }}>
      {children}
    </div>
  )
}

/** Interruptor compartido (extensiones, permisos, skills…). */
export function PopoverToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}
      title={on ? 'Desactivar' : 'Activar'}
      className={'w-8 h-[18px] rounded-full shrink-0 relative transition-colors ' + (on ? 'bg-emerald-500/90' : 'bg-white/15')}
    >
      <span className={'absolute top-0.5 w-[14px] h-[14px] rounded-full bg-white transition-all ' + (on ? 'left-[16px]' : 'left-0.5')} />
    </button>
  )
}
