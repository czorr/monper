import { t as tr, useLocale } from '@renderer/lib/i18n'
import { createRoot } from 'react-dom/client'
import { useEffect, useState, type JSX } from 'react'
import type { ExtensionInfo, ExtensionsData } from '@shared/types'
import { PopoverPanel, PopoverRow, PopoverLabel, PopoverDivider, PopoverList, PopoverToggle } from '@renderer/components/popover'
import IconPuzzle from '~icons/tabler/puzzle'
import IconPlus from '~icons/tabler/plus'
import IconFolder from '~icons/tabler/folder'
import IconDots from '~icons/tabler/dots'
import IconAlert from '~icons/tabler/alert-triangle'
import IconCheck from '~icons/tabler/check'
import './styles.css'

const ex = window.extensionswin
const EMPTY: ExtensionsData = { items: [], storeCandidate: null, installing: false }

function Row({ e }: { e: ExtensionInfo }): JSX.Element {
  useLocale()
  const icon = e.icon
    ? <img src={e.icon} alt="" className="w-[18px] h-[18px] rounded-[4px] object-contain" />
    : <IconPuzzle />
  return (
    <PopoverRow
      icon={icon}
      label={e.name}
      title={e.enabled ? tr("Abrir") : tr("Actívala para usarla")}
      onClick={() => e.enabled && ex.openPopup(e.path)}
      meta={
        <>
          {e.missing && <IconAlert className="w-3.5 h-3.5 text-amber-400" />}
          <button
            type="button"
            onClick={(ev) => { ev.stopPropagation(); ex.menu(e.path) }}
            title={tr("Más opciones")}
            className="w-6 h-6 grid place-items-center rounded-md hover:text-text hover:bg-white/[0.1] [&>svg]:w-4 [&>svg]:h-4"
          >
            <IconDots />
          </button>
          <PopoverToggle on={e.enabled} onChange={(v) => ex.toggle(e.path, v)} />
        </>
      }
    />
  )
}

function Extensions(): JSX.Element {
  useLocale()
  const [d, setD] = useState<ExtensionsData>(EMPTY)
  useEffect(() => ex.onData(setD), [])
  const cand = d.storeCandidate

  return (
    <PopoverPanel onHeight={ex.reportHeight} measure={d}>
      {/* Instalar la extensión de la página actual (si estás en la Store) */}
      {cand?.installed && <PopoverRow icon={<IconCheck />} label={tr("Ya la tienes instalada")} disabled />}
      {cand && !cand.installed && (
        <PopoverRow
          icon={<IconPlus />}
          label={d.installing ? tr("Instalando…") : tr("Añadir esta extensión a Titanio")}
          active
          disabled={d.installing}
          onClick={() => ex.installFromStore()}
        />
      )}

      <PopoverRow icon={<IconPuzzle />} label={tr("Explorar extensiones")} onClick={() => ex.browseStore()} />
      <PopoverRow icon={<IconFolder />} label={tr("Instalar desde una carpeta")} onClick={() => ex.installFromFolder()} />

      <PopoverDivider />
      <PopoverLabel>{tr("Tus extensiones")}</PopoverLabel>
      {d.items.length === 0 ? (
        <div className="px-2.5 pb-2 text-[12.5px] text-text-faint leading-relaxed">
          {tr("Todavía no tienes extensiones. Toca")} <span className="text-text-dim">{tr("Explorar extensiones")}</span>{tr(", abre la que te guste y vuelve aquí para añadirla.")} </div>
      ) : (
        <PopoverList>{d.items.map((e) => <Row key={e.path} e={e} />)}</PopoverList>
      )}
    </PopoverPanel>
  )
}

createRoot(document.getElementById('root')!).render(<Extensions />)
