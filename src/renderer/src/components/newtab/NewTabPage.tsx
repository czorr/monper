import { useState, type JSX } from 'react'
import type { Suggestion } from '@shared/types'
import IconSearch from '~icons/tabler/search'
import IconKey from '~icons/tabler/key'
import IconBolt from '~icons/tabler/bolt'
import IconPalette from '~icons/tabler/palette'
import IconArrowUpRight from '~icons/tabler/arrow-up-right'
import { useAutocomplete, useInlineCompletion, SuggestionList } from '@renderer/components/omnibox'
import logo from '@renderer/assets/monper.png'

const { monperTab } = window

type Mode = 'search' | 'ai'

interface Task {
  title: string
  desc: string
  action: string
  grad: string
  Icon: typeof IconKey
  onClick: () => void
}

const TASKS: Task[] = [
  {
    title: 'Conecta tu IA',
    desc: 'Añade tu API key de Claude u OpenAI para activar el asistente.',
    action: 'Abrir Settings', grad: 'from-violet-400 to-sky-400', Icon: IconKey,
    onClick: () => monperTab.openSettings()
  },
  {
    title: 'Prueba el asistente',
    desc: 'Pídele a Monper que opere la página por ti: navega, busca, resume.',
    action: 'Abrir Ask Monper', grad: 'from-pink-300 to-rose-400', Icon: IconBolt,
    onClick: () => monperTab.openChat()
  },
  {
    title: 'Personaliza Monper',
    desc: 'Ajusta proveedores, privacidad y atajos a tu gusto.',
    action: 'Abrir Settings', grad: 'from-amber-300 to-orange-400', Icon: IconPalette,
    onClick: () => monperTab.openSettings()
  }
]

export default function NewTabPage(): JSX.Element {
  const [mode, setMode] = useState<Mode>('search')
  const ac = useAutocomplete(monperTab.suggest)
  // Mismo completado inline que la barra de direcciones (lo escrito en blanco, lo completado
  // en gris vía `::selection`). Por eso el input es no-controlado: ver useInlineCompletion.
  const ic = useInlineCompletion(ac)

  const choose = (s: Suggestion): void => monperTab.navigate(s.url)
  const submit = (): void => {
    if (mode === 'ai') { monperTab.openChat(); return }
    if (ac.current) return choose(ac.current)
    const v = ic.value().trim() || ac.query.trim()
    if (v) monperTab.navigate(v)
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Tab') { e.preventDefault(); setMode((m) => (m === 'search' ? 'ai' : 'search')); return }
    if (mode === 'ai') { if (e.key === 'Enter') { e.preventDefault(); submit() }; return }
    if (ic.onKeyDown(e)) return
    if (e.key === 'Enter') { e.preventDefault(); submit() }
    else if (e.key === 'Escape') ac.close()
  }

  const pill = (on: boolean): string =>
    'px-3 h-7 rounded-lg text-[12.5px] font-medium transition-colors ' + (on ? 'bg-white/[0.14] text-text' : 'text-text-dim hover:text-text')

  return (
    <div className="min-h-full page-backdrop text-text flex flex-col items-center pt-[13vh] px-6 select-none">
      {/* Logo con glow sutil */}
      <div className="relative mb-9">
        <div className="absolute inset-0 blur-2xl bg-white/[0.06] rounded-full scale-125" />
        <img src={logo} alt="Monper" className="relative w-[68px] h-[68px] object-contain" />
      </div>

      {/* Search box */}
      <div className="relative w-full max-w-[600px] mb-16">
        <div className="flex items-center gap-3 h-[52px] px-4 rounded-2xl bg-white/[0.05] border border-white/10 focus-within:border-white/25 shadow-xl shadow-black/20 transition-colors">
          <IconSearch className="text-text-faint shrink-0 w-[18px] h-[18px]" />
          <input
            autoFocus
            ref={ic.inputRef}
            type="text"
            spellCheck={false}
            autoComplete="off"
            onChange={ic.onChange}
            onKeyDown={onKeyDown}
            onBlur={ac.close}
            placeholder={mode === 'ai' ? 'Pregúntale a Monper…' : 'Busca o escribe una URL'}
            className="flex-1 min-w-0 bg-transparent outline-none text-[14px] placeholder:text-text-faint select-text [&::selection]:bg-white/15 [&::selection]:text-text-dim"
          />
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="flex items-center gap-1.5 text-[11px] text-text-faint">
              <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.08] font-sans">Tab</kbd> para cambiar
            </span>
            <div className="flex p-0.5 rounded-xl bg-white/[0.05]">
              <button onClick={() => setMode('search')} className={pill(mode === 'search')}>Search</button>
              <button onClick={() => setMode('ai')} className={pill(mode === 'ai')}>Ask AI</button>
            </div>
          </div>
        </div>
        {mode === 'search' && ac.open && (
          <div className="absolute z-50 top-full left-0 right-0 mt-2 rounded-2xl border border-white/10 bg-[#1c1c20]/95 shadow-2xl shadow-black/50 overflow-hidden">
            <SuggestionList items={ac.items} active={ac.active} query={ac.query} onHover={ac.setActive} onChoose={choose} />
          </div>
        )}
      </div>

      {/* Suggested tasks */}
      <div className="w-full max-w-[860px]">
        <h2 className="text-[15px] font-semibold text-text-dim mb-3.5">Para empezar</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TASKS.map((t) => (
            <div key={t.title} className="rounded-2xl bg-white/[0.03] border border-white/[0.07] overflow-hidden flex flex-col">
              <div className={`h-[88px] bg-gradient-to-br ${t.grad} grid place-items-center`}>
                <div className="w-12 h-12 rounded-2xl bg-white/25 backdrop-blur grid place-items-center [&>svg]:w-6 [&>svg]:h-6 [&>svg]:text-white">
                  <t.Icon />
                </div>
              </div>
              <div className="p-4 flex flex-col gap-1.5 flex-1">
                <h3 className="text-[14.5px] font-semibold">{t.title}</h3>
                <p className="text-[13px] text-text-dim leading-relaxed flex-1">{t.desc}</p>
                <button
                  onClick={t.onClick}
                  className="self-start mt-1.5 flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[12.5px] text-text transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-text-dim"
                >
                  {t.action} <IconArrowUpRight />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
