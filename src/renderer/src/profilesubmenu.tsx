import { createRoot } from 'react-dom/client'
import { useEffect, useState, type JSX } from 'react'
import type { SubmenuData } from '@shared/types'
import { PopoverPanel, PopoverRow, PopoverLabel, PopoverDivider, PopoverList } from '@renderer/components/popover'
import IconDownload from '~icons/tabler/download'
import IconFile from '~icons/tabler/file'
import IconPuzzle from '~icons/tabler/puzzle'
import IconBookmark from '~icons/tabler/bookmark'
import IconHistory from '~icons/tabler/history'
import IconCode from '~icons/tabler/code'
import IconGauge from '~icons/tabler/gauge'
import IconList from '~icons/tabler/list'
import './styles.css'

/**
 * Submenú del menú de perfil (Downloads, Extensions, Developers…).
 *
 * Es una ventana nativa aparte, no un div dentro del menú: sale FUERA del panel, y la vista
 * de la página se dibuja encima del DOM, así que ahí un div no se vería. No roba el foco
 * (`focusable: false` en el main) — si lo robara, el menú padre se cerraría al perderlo.
 *
 * No sabe de dónde salen las filas: el main se las manda masticadas y aquí solo se pintan.
 */

const sm = window.profilesubmenu

const ICONS = {
  download: IconDownload,
  file: IconFile,
  puzzle: IconPuzzle,
  bookmark: IconBookmark,
  history: IconHistory,
  code: IconCode,
  gauge: IconGauge,
  list: IconList
} as const

function SubmenuWindow(): JSX.Element {
  const [data, setData] = useState<SubmenuData | null>(null)
  useEffect(() => sm.onData(setData), [])

  if (!data) return <div className="p-3" />
  const principales = data.rows.filter((r) => r.primary)
  const resto = data.rows.filter((r) => !r.primary)

  const fila = (r: (typeof data.rows)[number]): JSX.Element => {
    const Icon = r.icon ? ICONS[r.icon] : null
    return (
      <PopoverRow
        key={r.id}
        icon={
          r.image ? (
            <img src={r.image} alt="" className="w-[18px] h-[18px] shrink-0 rounded-[3px] object-contain" />
          ) : Icon ? (
            <Icon />
          ) : undefined
        }
        label={r.label}
        meta={r.meta}
        onClick={() => sm.action(r.action)}
      >
        {r.sub ? (
          <span className="flex flex-col leading-tight">
            <span className="truncate">{r.label}</span>
            <span className="text-[11.5px] text-text-faint truncate">{r.sub}</span>
          </span>
        ) : undefined}
      </PopoverRow>
    )
  }

  return (
    <PopoverPanel onHeight={sm.reportHeight} measure={data}>
      {principales.map(fila)}
      {!!principales.length && !!resto.length && <PopoverDivider />}
      {data.listLabel && !!resto.length && <PopoverLabel>{data.listLabel}</PopoverLabel>}
      {!!resto.length && <PopoverList max={280}>{resto.map(fila)}</PopoverList>}
      {!data.rows.length && (
        <div className="px-3 py-4 text-center text-[13px] text-text-faint">Nada por aquí todavía</div>
      )}
    </PopoverPanel>
  )
}

createRoot(document.getElementById('root')!).render(<SubmenuWindow />)
