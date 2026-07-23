import { useState, type JSX } from 'react'
import IconCopy from '~icons/tabler/copy'
import IconCheck from '~icons/tabler/check'
import IconVolume from '~icons/tabler/volume'
import IconVolumeOff from '~icons/tabler/volume-off'

interface Props {
  /** Texto plano para copiar / leer en voz alta */
  text: string
  /** Momento de creación (ms epoch) para el timestamp relativo */
  at?: number
}

function relativeTime(at?: number): string {
  if (!at) return ''
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 60) return 'justo ahora'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} d`
}

function ActionButton({ title, onClick, children }: { title: string; onClick: () => void; children: JSX.Element }): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-6 h-6 grid place-items-center rounded-md text-text-faint hover:text-text hover:bg-white/[0.08] transition-colors"
    >
      {children}
    </button>
  )
}

/** Barra de acciones bajo un mensaje del asistente. Aparece al hover del parent (group). */
export default function MessageActions({ text, at }: Props): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  const copy = (): void => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const toggleSpeak = (): void => {
    const synth = window.speechSynthesis
    if (speaking) { synth.cancel(); setSpeaking(false); return }
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    setSpeaking(true)
    synth.speak(u)
  }

  return (
    <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <ActionButton title={copied ? 'Copiado' : 'Copiar'} onClick={copy}>
        {copied ? <IconCheck className="w-3.5 h-3.5 text-emerald-400" /> : <IconCopy className="w-3.5 h-3.5" />}
      </ActionButton>
      <ActionButton title={speaking ? 'Detener lectura' : 'Leer en voz alta'} onClick={toggleSpeak}>
        {speaking ? <IconVolumeOff className="w-3.5 h-3.5 text-text" /> : <IconVolume className="w-3.5 h-3.5" />}
      </ActionButton>
      {at && <span className="ml-1.5 text-[11.5px] text-text-faint select-none">{relativeTime(at)}</span>}
    </div>
  )
}
