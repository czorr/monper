import type { JSX } from 'react'
import { ThinkingOrb } from 'thinking-orbs'
import type { Msg } from './types'
import { Markdown } from './Markdown'
import StepRow from './StepRow'

/** Turno del asistente: secuencia intercalada de texto (Markdown) y acciones (steps). */
export default function AssistantTurn({ msg }: { msg: Msg }): JSX.Element {
  const parts = msg.parts ?? []
  const lastIdx = parts.length - 1

  return (
    <div className="self-start w-full flex flex-col gap-1.5">
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
    </div>
  )
}
