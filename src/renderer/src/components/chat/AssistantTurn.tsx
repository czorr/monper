import type { JSX } from 'react'
import { ThinkingOrb } from 'thinking-orbs'
import type { Msg, TextPart } from './types'
import { Markdown } from './Markdown'
import StepRow from './StepRow'
import MessageActions from './MessageActions'

/** Concatena las partes de texto (no-error) del turno, para copiar/leer. */
function plainText(msg: Msg): string {
  return (msg.parts ?? [])
    .filter((p): p is TextPart => p.type === 'text' && !p.error)
    .map((p) => p.text)
    .join('\n\n')
}

/** Turno del asistente: secuencia intercalada de texto (Markdown) y acciones (steps). */
export default function AssistantTurn({ msg }: { msg: Msg }): JSX.Element {
  const parts = msg.parts ?? []
  const lastIdx = parts.length - 1
  const text = plainText(msg)

  return (
    <div className="group self-start w-full flex flex-col gap-1.5 selectable">
      {parts.map((p, i) =>
        p.type === 'text' ? (
          p.error ? (
            <p key={i} className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-red-400">{p.text}</p>
          ) : (
            <Markdown key={i}>{p.text}</Markdown>
          )
        ) : (
          // Un step está activo (orb animado) si es la última parte y aún estamos en streaming.
          <StepRow key={i} step={p.step} active={!!msg.streaming && i === lastIdx} />
        )
      )}

      {/* Aún sin ninguna parte: orb inicial mientras el agente arranca. */}
      {msg.streaming && parts.length === 0 && <ThinkingOrb state="working" size={20} theme="dark" />}

      {/* Acciones (copiar / leer / hora): solo cuando el turno terminó y hay texto. */}
      {!msg.streaming && text && <MessageActions text={text} at={msg.at} />}
    </div>
  )
}
