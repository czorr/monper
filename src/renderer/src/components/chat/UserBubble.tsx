import { useState, type JSX } from 'react'
import IconCopy from '~icons/tabler/copy'
import IconCheck from '~icons/tabler/check'

/** Burbuja del mensaje del usuario (alineada a la derecha) con copiar al hover. */
export default function UserBubble({ text }: { text: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = (): void => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="group self-end max-w-[85%] flex flex-col items-end">
      <div className="rounded-2xl rounded-br-md bg-white/[0.10] px-3.5 py-2 text-[13.5px] whitespace-pre-wrap selectable">
        {text}
      </div>
      <button
        onClick={copy}
        title={copied ? 'Copiado' : 'Copiar'}
        className="w-6 h-6 mt-1 grid place-items-center rounded-md text-text-faint hover:text-text hover:bg-white/[0.08] opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
      >
        {copied ? <IconCheck className="w-3.5 h-3.5 text-emerald-400" /> : <IconCopy className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}
