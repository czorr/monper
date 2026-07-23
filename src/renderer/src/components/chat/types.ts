import type { ChatStep } from '@shared/types'

/** Estados válidos del ThinkingOrb usados en el chat */
export type OrbState = 'working' | 'searching' | 'listening' | 'composing' | 'solving' | 'shaping'

/** Un fragmento de texto del asistente (entre acciones) */
export interface TextPart {
  type: 'text'
  text: string
  error?: boolean
}

/** Una acción del agente (paso con herramienta) */
export interface StepPart {
  type: 'step'
  step: ChatStep
}

/** Parte de un turno del asistente, en orden de emisión */
export type Part = TextPart | StepPart

/** Un mensaje renderizado en el panel (vista local, distinta de ChatMessage del backend) */
export interface Msg {
  role: 'user' | 'assistant'
  /** Texto plano para el mensaje del usuario */
  text?: string
  /** Secuencia intercalada de texto y acciones para el asistente */
  parts?: Part[]
  streaming?: boolean
}
