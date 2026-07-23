import type { JSX } from 'react'

/** Burbuja del mensaje del usuario (alineada a la derecha). */
export default function UserBubble({ text }: { text: string }): JSX.Element {
  return (
    <div className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.10] px-3.5 py-2 text-[13.5px] whitespace-pre-wrap">
      {text}
    </div>
  )
}
