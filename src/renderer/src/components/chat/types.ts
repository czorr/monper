import type { ChatStep, ChatAttachment, ChatFallo } from '@shared/types'

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

/**
 * Un fallo del proveedor, ya clasificado.
 *
 * Es una parte propia y no un `TextPart` con `error: true` porque no es texto: tiene título,
 * una acción que resuelve el problema y el error crudo escondido. Meterlo en un párrafo rojo
 * era exactamente lo que hacía que el usuario no supiera qué hacer.
 */
export interface FailPart {
  type: 'fail'
  fail: ChatFallo
}

/** Parte de un turno del asistente, en orden de emisión */
export type Part = TextPart | StepPart | FailPart

/** Un mensaje renderizado en el panel (vista local, distinta de ChatMessage del backend) */
export interface Msg {
  role: 'user' | 'assistant'
  /** Texto plano para el mensaje del usuario */
  text?: string
  /** Imágenes adjuntadas por el usuario a este mensaje */
  attachments?: ChatAttachment[]
  /** Secuencia intercalada de texto y acciones para el asistente */
  parts?: Part[]
  streaming?: boolean
  /** Momento de creación (ms epoch), para el timestamp relativo */
  at?: number
}
