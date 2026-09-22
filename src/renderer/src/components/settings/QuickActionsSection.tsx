import { useEffect, useState, type JSX, type ComponentType, type SVGProps } from 'react'
import { QUICK_ICONS, type QuickAction } from '@shared/types'
import IconList from '~icons/tabler/list'
import IconLanguage from '~icons/tabler/language'
import IconSparkles from '~icons/tabler/sparkles'
import IconWand from '~icons/tabler/wand'
import IconMessage from '~icons/tabler/message'
import IconPencil from '~icons/tabler/pencil'
import IconBulb from '~icons/tabler/bulb'
import IconWorld from '~icons/tabler/world'
import IconQuote from '~icons/tabler/quote'
import IconCode from '~icons/tabler/code'
import IconMail from '~icons/tabler/mail'
import IconSearch from '~icons/tabler/search'
import IconPlus from '~icons/tabler/plus'
import IconTrash from '~icons/tabler/trash'
import { SettingsHeader } from './ui'

const { titanioTab } = window

const ICON_MAP: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  list: IconList, language: IconLanguage, sparkles: IconSparkles, wand: IconWand,
  message: IconMessage, pencil: IconPencil, bulb: IconBulb, world: IconWorld,
  quote: IconQuote, code: IconCode, mail: IconMail, search: IconSearch
}
function Icon({ name }: { name: string }): JSX.Element {
  const C = ICON_MAP[name] || IconSparkles
  return <C />
}

const BLANK: QuickAction = { id: '', name: '', icon: 'sparkles', template: '{{selection}}' }

export default function QuickActionsSection(): JSX.Element {
  const [list, setList] = useState<QuickAction[]>([])
  const [editing, setEditing] = useState<QuickAction | null>(null)

  useEffect(() => { titanioTab.listQuickActions().then(setList) }, [])

  const save = async (): Promise<void> => {
    if (!editing) return
    setList(await titanioTab.saveQuickAction(editing))
    setEditing(null)
  }
  const remove = async (id: string): Promise<void> => { setList(await titanioTab.removeQuickAction(id)) }

  return (
    <>
      <SettingsHeader
        title="Quick actions"
        description={<>
          Estas acciones aparecen al seleccionar texto en una página.
          Usa <code className="px-1 py-0.5 rounded bg-white/[0.08] text-[12.5px]">{'{{selection}}'}</code> para incluirlo en las instrucciones del agente.
        </>}
        actions={
        <button
          onClick={() => setEditing({ ...BLANK })}
          className="flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-white/[0.08] hover:bg-white/[0.13] text-[13.5px] [&>svg]:w-4 [&>svg]:h-4"
        >
          <IconPlus /> Nueva
        </button>
        }
      />

      <div className="flex flex-col gap-1.5 mb-8">
        {list.map((a) => (
          <div key={a.id} className="group flex items-center gap-3 px-3.5 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05]">
            <div className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-white/[0.06] text-text-dim [&>svg]:w-[18px] [&>svg]:h-[18px]"><Icon name={a.icon} /></div>
            <button onClick={() => setEditing({ ...a })} className="flex-1 min-w-0 text-left">
              <div className="text-[14px] text-text">{a.name}</div>
              <div className="text-[12.5px] text-text-faint truncate">{a.template.replace(/\s+/g, ' ')}</div>
            </button>
            <button onClick={() => remove(a.id)} title="Eliminar" className="w-8 h-8 grid place-items-center rounded-lg text-text-faint hover:text-red-400 hover:bg-white/[0.08] opacity-0 group-hover:opacity-100 [&>svg]:w-4 [&>svg]:h-4"><IconTrash /></button>
          </div>
        ))}
        {list.length === 0 && <div className="text-[13.5px] text-text-faint py-6 text-center">No hay acciones guardadas.</div>}
      </div>

      {editing && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-4">
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Nombre (por ejemplo, Resumir)"
            className="w-full h-10 px-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[14px] outline-none focus:border-white/25 placeholder:text-text-faint"
          />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ICONS.map((n) => (
              <button
                key={n}
                onClick={() => setEditing({ ...editing, icon: n })}
                className={'w-9 h-9 grid place-items-center rounded-lg [&>svg]:w-[18px] [&>svg]:h-[18px] ' + (editing.icon === n ? 'bg-white/[0.16] text-text' : 'bg-white/[0.04] text-text-dim hover:bg-white/[0.08]')}
              >
                <Icon name={n} />
              </button>
            ))}
          </div>
          <textarea
            value={editing.template}
            onChange={(e) => setEditing({ ...editing, template: e.target.value })}
            rows={4}
            placeholder="Instrucciones para el agente. Usa {{selection}} para incluir el texto."
            className="w-full px-3.5 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13.5px] leading-relaxed outline-none focus:border-white/25 resize-none placeholder:text-text-faint"
          />
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={!editing.name.trim()} className="px-4 h-10 rounded-xl bg-white/90 text-black text-[13.5px] font-medium hover:bg-white disabled:opacity-40">Guardar</button>
            <button onClick={() => setEditing(null)} className="px-4 h-10 rounded-xl text-[13.5px] text-text-dim hover:text-text hover:bg-white/[0.06]">Cancelar</button>
          </div>
        </div>
      )}
    </>
  )
}
