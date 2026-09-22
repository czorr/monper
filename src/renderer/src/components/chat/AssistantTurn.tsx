import type { JSX } from 'react'
import { t as tr, useLocale } from '@renderer/lib/i18n'
import type { Msg, TextPart } from './types'
import { Markdown } from './Markdown'
import StepRow from './StepRow'
import FailBlock from './FailBlock'
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
  useLocale()
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
        ) : p.type === 'fail' ? (
          <FailBlock key={i} fail={p.fail} />
        ) : (
          // El último paso mantiene el brillo mientras el turno sigue en streaming.
          <StepRow key={i} step={p.step} active={!!msg.streaming && i === lastIdx} />
        )
      )}

      {msg.streaming && parts.length === 0 && (
        <span role="status" className="chat-step-shimmer self-start text-[13px] text-text">{tr("Pensando…")}</span>
      )}

      {/* Acciones (copiar / leer / hora): solo cuando el turno terminó y hay texto. */}
      {!msg.streaming && text && <MessageActions text={text} at={msg.at} />}
    </div>
  )
}
