import { useEffect, useState, type JSX } from 'react'
import type { Suggestion } from '@shared/types'
import IconSearch from '~icons/tabler/search'
import { useAutocomplete, useInlineCompletion, SuggestionList } from '@renderer/components/omnibox'
import logo from '@renderer/assets/titanio.png'
import DefaultBrowserBanner from './DefaultBrowserBanner'
import Widgets from './Widgets'

const { titanioTab } = window

type Mode = 'search' | 'ai'


export default function NewTabPage(): JSX.Element {
  const [mode, setMode] = useState<Mode>('search')
  const ac = useAutocomplete(titanioTab.suggest)
  // Mismo completado inline que la barra de direcciones (lo escrito en blanco, lo completado
  // en gris vía `::selection`). Por eso el input es no-controlado: ver useInlineCompletion.
  const ic = useInlineCompletion(ac)

  // `autoFocus` solo actúa al montar, y en ese momento la vista puede no tener el foco todavía
  // (lo da el main al activarla, ver `enfocarSiNewtab`). Así el input lo recupera también
  // cuando se vuelve a esta pestaña desde otra.
  useEffect(() => {
    const enfocar = (): void => ic.inputRef.current?.focus()
    enfocar()
    window.addEventListener('focus', enfocar)
    return () => window.removeEventListener('focus', enfocar)
  }, [ic.inputRef])

  const choose = (s: Suggestion): void => titanioTab.navigate(s.url)
  const submit = (): void => {
    if (mode === 'ai') { titanioTab.openChat(); return }
    if (ac.current) return choose(ac.current)
    const v = ic.value().trim() || ac.query.trim()
    if (v) titanioTab.navigate(v)
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
        <img src={logo} alt="Titanio" className="relative w-[68px] h-[68px] object-contain" />
      </div>

      <DefaultBrowserBanner />

      {/* Search box */}
      <div className="relative w-full max-w-[760px] mb-16">
        <div className="flex items-center gap-3.5 h-[64px] px-5 rounded-[20px] bg-white/[0.05] border border-white/10 focus-within:border-white/25 shadow-xl shadow-black/20 transition-colors">
          <IconSearch className="text-text-faint shrink-0 w-[21px] h-[21px]" />
          <input
            autoFocus
            ref={ic.inputRef}
            type="text"
            spellCheck={false}
            autoComplete="off"
            onChange={ic.onChange}
            onPointerDown={ic.onPointerDown}
            onKeyDown={onKeyDown}
            onBlur={ac.close}
            placeholder={mode === 'ai' ? 'Pregúntale a Titanio…' : 'Busca o escribe una URL'}
            className="flex-1 min-w-0 bg-transparent outline-none text-[16.5px] placeholder:text-text-faint select-text [&[data-completado]::selection]:bg-white/15 [&[data-completado]::selection]:text-text-dim"
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

      <Widgets />
    </div>
  )
}
