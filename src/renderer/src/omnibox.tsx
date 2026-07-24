import { createRoot } from 'react-dom/client'
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import type { OmniData, Suggestion } from '@shared/types'
import SuggestionList from '@renderer/components/omnibox/SuggestionList'
import './styles.css'

const omni = window.omniwin

function OmniboxWindow(): JSX.Element {
  const [data, setData] = useState<OmniData>({ items: [], active: -1, query: '' })
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => omni.onData(setData), [])

  // Reporta la altura natural del box al main para que redimensione la ventana.
  useLayoutEffect(() => {
    if (boxRef.current) omni.reportHeight(Math.ceil(boxRef.current.getBoundingClientRect().height))
  }, [data])

  const choose = (s: Suggestion): void => omni.choose(data.items.indexOf(s))

  return (
    <div className="p-3">
      <div ref={boxRef} className="rounded-2xl border border-white/10 bg-[#1c1c20] shadow-xl shadow-black/50 overflow-hidden">
        <SuggestionList items={data.items} active={data.active} query={data.query} onHover={(i) => omni.hover(i)} onChoose={choose} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<OmniboxWindow />)
