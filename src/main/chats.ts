import { join } from 'path'
import { app } from 'electron'
import { readJson, writeJson } from './jsonfile'
import type { ChatSessionMeta, StoredChatMsg, StoredPart } from '../shared/types'

/**
 * Historial de conversaciones con el agente.
 *
 * Hasta ahora el chat vivía SOLO en el estado de React: un ⌘R y desaparecía. Aquí se guarda,
 * en el main, como el resto de los datos del usuario.
 *
 * Reglas de cuándo empieza una conversación nueva (decididas a propósito, no por defecto):
 *
 * - **Manual**, desde el pill del header. El camino principal.
 * - **Al ABRIR la app, no al cerrarla.** Si la última tiene menos de `RESUME_MS` se retoma.
 *   Cortar al cerrar castiga un cierre accidental o un reinicio para recoger un cambio del
 *   main, que en desarrollo pasa constantemente.
 * - **Por inactividad** (`IDLE_MS`) aunque la app siga abierta: un navegador se queda semanas
 *   abierto y si no, el hilo no termina nunca.
 * - **Nunca** al cambiar de pestaña o de dominio: el agente existe para tareas que cruzan
 *   varias páginas, y partir ahí rompería el caso de uso central.
 */

/** Retomar la última si se cerró hace menos de esto. */
const RESUME_MS = 30 * 60 * 1000
/** Con la app abierta, un mensaje después de este silencio abre conversación nueva. */
const IDLE_MS = 12 * 60 * 60 * 1000
/** Techo de conversaciones guardadas; se tiran las más viejas. */
const MAX_SESSIONS = 200
const TITLE_MAX = 48

interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: StoredChatMsg[]
}

let file = ''
let sessions: Session[] = []
let currentId = ''

const now = (): number => Date.now()
const newId = (): string => `${now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

function persist(): void {
  writeJson(file, sessions, 'el historial de chats')
}

/** Título a partir del primer mensaje del usuario. Sin llamar al modelo: es gratis y basta. */
function titleFor(messages: StoredChatMsg[]): string {
  const first = messages.find((m) => m.role === 'user' && (m.text ?? '').trim())
  const t = (first?.text ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return 'Nueva conversación'
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1)}…` : t
}

/**
 * El mensaje tal y como llega del panel: aquí los adjuntos y los screenshots SÍ son data URLs.
 * Se declara aparte del tipo guardado para que `strip` tenga que convertir de verdad y no se
 * pueda escribir una imagen a disco por descuido.
 */
interface IncomingMsg {
  role: 'user' | 'assistant'
  text?: string
  at?: number
  attachments?: unknown[]
  parts?: (
    | { type: 'text'; text: string; error?: boolean }
    | { type: 'step'; step: Record<string, unknown> & { image?: string } }
  )[]
}

/**
 * Quita las imágenes antes de escribir a disco.
 *
 * Los adjuntos del usuario y los screenshots de los pasos son data URLs: unas pocas capturas
 * son megas de JSON, y el fichero se lee entero en cada arranque. Se guarda la marca de que
 * hubo imagen, no la imagen.
 */
function strip(m: IncomingMsg): StoredChatMsg {
  const out: StoredChatMsg = { role: m.role, at: m.at }
  if (m.text !== undefined) out.text = m.text
  if (m.attachments?.length) out.attachments = m.attachments.length // solo cuántas, no las imágenes
  if (m.parts) {
    out.parts = m.parts.map((p): StoredPart => {
      if (p.type === 'text') return { type: 'text', text: p.text, error: p.error }
      const { image, ...step } = p.step
      return { type: 'step', step: step as StoredPart extends { step: infer S } ? S : never, hadImage: !!image }
    })
  }
  return out
}

export function initChats(): void {
  file = join(app.getPath('userData'), 'chats.json')
  sessions = readJson<Session[]>(file, [], 'el historial de chats')
  currentId = ''
}

export function listSessions(): ChatSessionMeta[] {
  return sessions
    .filter((s) => s.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt, count: s.messages.length }))
}

function find(id: string): Session | undefined {
  return sessions.find((s) => s.id === id)
}

function create(): Session {
  const s: Session = { id: newId(), title: 'Nueva conversación', createdAt: now(), updatedAt: now(), messages: [] }
  sessions.unshift(s)
  currentId = s.id
  return s
}

/** La conversación que debe cargar el panel al abrirse. */
export function resumeOrNew(): { id: string; messages: StoredChatMsg[] } {
  if (currentId) {
    const cur = find(currentId)
    if (cur) return { id: cur.id, messages: cur.messages }
  }
  const last = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (last && last.messages.length && now() - last.updatedAt < RESUME_MS) {
    currentId = last.id
    return { id: last.id, messages: last.messages }
  }
  const s = create()
  return { id: s.id, messages: [] }
}

/** "New chat". Si la actual está vacía se reutiliza: no acumulamos conversaciones en blanco. */
export function startSession(): { id: string; messages: StoredChatMsg[] } {
  const cur = find(currentId)
  if (cur && cur.messages.length === 0) return { id: cur.id, messages: [] }
  const s = create()
  return { id: s.id, messages: [] }
}

export function openSession(id: string): { id: string; messages: StoredChatMsg[] } | null {
  const s = find(id)
  if (!s) return null
  currentId = id
  return { id, messages: s.messages }
}

/**
 * La conversación en la que debe entrar el mensaje que se está por enviar. Devuelve otra id
 * si la actual llevaba demasiado tiempo callada (regla de inactividad).
 */
export function sessionForNextMessage(id: string): { id: string; fresh: boolean } {
  const s = find(id)
  if (!s) { const n = create(); return { id: n.id, fresh: true } }
  currentId = s.id
  if (s.messages.length > 0 && now() - s.updatedAt > IDLE_MS) {
    const n = create()
    return { id: n.id, fresh: true }
  }
  return { id: s.id, fresh: false }
}

/** Guarda el estado completo de la conversación (el panel es la fuente de verdad en vivo). */
export function saveSession(id: string, messages: IncomingMsg[]): void {
  const s = find(id) ?? create()
  s.messages = messages.map(strip)
  s.updatedAt = now()
  if (s.title === 'Nueva conversación') s.title = titleFor(s.messages)
  // Se tiran las vacías y las más viejas por encima del techo.
  sessions = sessions.filter((x) => x.messages.length > 0 || x.id === currentId)
  if (sessions.length > MAX_SESSIONS) {
    sessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS)
  }
  persist()
}

export function removeSession(id: string): void {
  sessions = sessions.filter((s) => s.id !== id)
  if (currentId === id) currentId = ''
  persist()
}

export function renameSession(id: string, title: string): void {
  const s = find(id)
  if (!s) return
  s.title = title.trim().slice(0, 120) || s.title
  persist()
}
