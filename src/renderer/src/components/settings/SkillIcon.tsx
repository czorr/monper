import { useState, type JSX } from 'react'
import type { SkillMeta } from '@shared/types'
import IconFilePdf from '~icons/tabler/file-type-pdf'
import IconFileDocx from '~icons/tabler/file-type-docx'
import IconFileXls from '~icons/tabler/file-type-xls'
import IconFilePpt from '~icons/tabler/file-type-ppt'
import IconPencil from '~icons/tabler/pencil'
import IconListDetails from '~icons/tabler/list-details'
import IconPhotoSearch from '~icons/tabler/photo-search'
import IconBell from '~icons/tabler/bell'
import IconShieldLock from '~icons/tabler/shield-lock'
import IconWand from '~icons/tabler/wand'
import IconReceiptTax from '~icons/tabler/receipt-tax'
import IconViewfinder from '~icons/tabler/viewfinder'
import IconBolt from '~icons/tabler/bolt'

/**
 * El icono de una skill: un cuadrado redondeado con su identidad dentro.
 *
 * Dos fuentes, según lo que la skill ES:
 *  - **De servicio** (`host: notion.so`) → el favicon REAL del sitio. Se le pide al propio
 *    sitio, nunca a un servicio de terceros: pedirle a Google el icono de cada servicio que
 *    el usuario tiene configurado sería filtrar justo esa lista. Ver docs/browser-hardening.md.
 *  - **De capacidad** (`icon: file-type-pdf`) → un glifo, que hereda `currentColor` y por
 *    tanto se ve igual sobre la vibrancy con cualquier escritorio detrás.
 *
 * El mapa es CURADO a propósito, no dinámico: `unplugin-icons` resuelve en build, así que
 * `~icons/tabler/${nombre}` no existiría. Y de paso acota el lenguaje visual y el bundle.
 * Añadir una skill con un glifo nuevo = una línea aquí.
 */
const GLIFOS: Record<string, typeof IconBolt> = {
  'file-type-pdf': IconFilePdf,
  'file-type-docx': IconFileDocx,
  'file-type-xls': IconFileXls,
  'file-type-ppt': IconFilePpt,
  pencil: IconPencil,
  'list-details': IconListDetails,
  'photo-search': IconPhotoSearch,
  bell: IconBell,
  'shield-lock': IconShieldLock,
  wand: IconWand,
  'receipt-tax': IconReceiptTax,
  viewfinder: IconViewfinder
}

/**
 * `sm` para la lista (fila de 32px) y `md` para la cabecera del detalle. El redondeo pasa por
 * `rounded-*`, así que hereda la superelipse del tema — la misma esquina que el resto de la app.
 */
const TAMANOS = {
  sm: { caja: 'w-5 h-5 rounded-md', dentro: 'w-3.5 h-3.5' },
  md: { caja: 'w-9 h-9 rounded-xl', dentro: 'w-[18px] h-[18px]' }
}

export default function SkillIcon({ skill, size = 'sm' }: { skill: SkillMeta; size?: keyof typeof TAMANOS }): JSX.Element {
  // Un favicon puede dar 404 o venir roto; sin esto quedaría un hueco en vez de un icono.
  const [fallido, setFallido] = useState<string | null>(null)
  const t = TAMANOS[size]
  const Glifo = (skill.icon && GLIFOS[skill.icon]) || IconBolt
  const usaFavicon = !!skill.favicon && skill.favicon !== fallido

  return (
    <span
      className={
        `${t.caja} grid place-items-center shrink-0 overflow-hidden ` +
        // Sin fondo opaco: es un velo, para que la vibrancy siga pasando por detrás.
        'bg-white/[0.06] border border-white/[0.06] text-text-dim'
      }
    >
      {usaFavicon
        ? <img key={skill.favicon} src={skill.favicon!} alt="" className={`${t.dentro} object-contain`} onError={() => setFallido(skill.favicon)} />
        : <Glifo className={t.dentro} />}
    </span>
  )
}
