import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { launch, api } from './helpers'

/**
 * Historial de conversaciones. Las reglas de cuándo se abre una nueva son decisiones de
 * producto (ver src/main/chats.ts), así que se fijan aquí.
 */

interface Meta { id: string; title: string; updatedAt: number; count: number }

const turno = (texto: string): unknown[] => [
  { role: 'user', text: texto, at: Date.now() },
  { role: 'assistant', parts: [{ type: 'text', text: 'ok' }], at: Date.now() }
]

test('al abrir por primera vez hay una conversación vacía y la lista está vacía', async () => {
  const h = await launch()
  try {
    const s = await api<{ id: string; messages: unknown[] }>(h.win, 'chatsResume')
    expect(s.id).toBeTruthy()
    expect(s.messages).toEqual([])
    // Una conversación sin mensajes no se lista: si no, la lista se llena de vacías.
    expect(await api<Meta[]>(h.win, 'chatsList')).toEqual([])
  } finally { await h.close() }
})

test('se guarda, se titula con el primer mensaje y se puede reabrir', async () => {
  const h = await launch()
  try {
    const s = await api<{ id: string }>(h.win, 'chatsResume')
    await api(h.win, 'chatsSave', s.id, turno('Compara estos dos precios'))
    await expect.poll(async () => (await api<Meta[]>(h.win, 'chatsList')).length).toBe(1)
    const [meta] = await api<Meta[]>(h.win, 'chatsList')
    expect(meta.title).toBe('Compara estos dos precios')
    expect(meta.count).toBe(2)

    const abierta = await api<{ id: string; messages: { text?: string }[] }>(h.win, 'chatsOpen', s.id)
    expect(abierta.messages[0].text).toBe('Compara estos dos precios')
  } finally { await h.close() }
})

test('"New chat" con la actual vacía no crea otra', async () => {
  const h = await launch()
  try {
    const a = await api<{ id: string }>(h.win, 'chatsResume')
    const b = await api<{ id: string }>(h.win, 'chatsNew')
    expect(b.id, 'reutiliza la vacía en vez de acumular conversaciones en blanco').toBe(a.id)

    await api(h.win, 'chatsSave', a.id, turno('algo'))
    const c = await api<{ id: string }>(h.win, 'chatsNew')
    expect(c.id, 'con la actual ya usada, sí abre una nueva').not.toBe(a.id)
  } finally { await h.close() }
})

test('las imágenes NO llegan al disco', async () => {
  const h = await launch()
  try {
    const s = await api<{ id: string }>(h.win, 'chatsResume')
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    await api(h.win, 'chatsSave', s.id, [
      { role: 'user', text: 'mira esta', attachments: [{ type: 'image', dataUrl: png }] },
      { role: 'assistant', parts: [{ type: 'step', step: { state: 'working', label: 'Captura', image: png } }] }
    ])
    await expect.poll(async () => (await api<Meta[]>(h.win, 'chatsList')).length).toBe(1)
    const raw = readFileSync(join(h.userData, 'chats.json'), 'utf8')
    expect(raw, 'un data URL en el historial convierte el fichero en megas').not.toContain('data:image')
    // Pero queda la marca de que hubo imagen. Se comprueba sobre el objeto, no sobre el texto:
    // el fichero va indentado y comparar cadenas ataba el test al formato.
    const guardado = JSON.parse(raw) as { messages: { attachments?: number; parts?: { hadImage?: boolean }[] }[] }[]
    expect(guardado[0].messages[0].attachments).toBe(1)
    expect(guardado[0].messages[1].parts?.[0].hadImage).toBe(true)
  } finally { await h.close() }
})

test('al reabrir la app: retoma si es reciente, empieza nueva si es vieja', async () => {
  const primera = await launch()
  const perfil = primera.userData
  let id = ''
  try {
    id = (await api<{ id: string }>(primera.win, 'chatsResume')).id
    await api(primera.win, 'chatsSave', id, turno('Hilo de ayer'))
    await expect.poll(async () => (await api<Meta[]>(primera.win, 'chatsList')).length).toBe(1)
  } finally { await primera.close(true) }

  // Reciente (acaba de guardarse): se retoma la misma.
  const reciente = await launch({}, perfil)
  try {
    const s = await api<{ id: string; messages: unknown[] }>(reciente.win, 'chatsResume')
    expect(s.id).toBe(id)
    expect(s.messages).toHaveLength(2)
  } finally { await reciente.close(true) }

  // Se envejece a mano el fichero: 3 horas. Ahora debe empezar una nueva.
  const file = join(perfil, 'chats.json')
  const data = JSON.parse(readFileSync(file, 'utf8')) as { updatedAt: number }[]
  data.forEach((s) => { s.updatedAt = Date.now() - 3 * 60 * 60 * 1000 })
  writeFileSync(file, JSON.stringify(data), 'utf8')

  const vieja = await launch({}, perfil)
  try {
    const s = await api<{ id: string; messages: unknown[] }>(vieja.win, 'chatsResume')
    expect(s.id, 'una conversación de hace 3 h no se retoma').not.toBe(id)
    expect(s.messages).toEqual([])
    // La vieja sigue en el historial, no se pierde.
    expect((await api<Meta[]>(vieja.win, 'chatsList')).some((m) => m.id === id)).toBe(true)
  } finally {
    await vieja.close()
    rmSync(perfil, { recursive: true, force: true })
  }
})

test('borrar una conversación la quita del historial', async () => {
  const h = await launch()
  try {
    const s = await api<{ id: string }>(h.win, 'chatsResume')
    await api(h.win, 'chatsSave', s.id, turno('para borrar'))
    await expect.poll(async () => (await api<Meta[]>(h.win, 'chatsList')).length).toBe(1)
    await api(h.win, 'chatsRemove', s.id)
    await expect.poll(async () => (await api<Meta[]>(h.win, 'chatsList')).length).toBe(0)
  } finally { await h.close() }
})

test('el pill del header muestra la conversación y lista el historial', async () => {
  const h = await launch()
  try {
    const s = await api<{ id: string }>(h.win, 'chatsResume')
    await api(h.win, 'chatsSave', s.id, turno('Resume este artículo'))
    // Se abre CLICANDO: `setChat` por IPC mueve la vista nativa pero no cambia el estado de
    // React, así que el panel se quedaba fuera de pantalla y el click caducaba.
    await h.win.locator('button', { hasText: 'Ask Titanio' }).click()

    // El pill muestra la conversación actual (o "New chat" si no hay ninguna).
    const pill = h.win.locator('header button', { hasText: /^New chat$|Resume este/ }).first()
    await expect(pill).toBeVisible()
    await pill.click()

    // El dropdown, acotado por su clase: el título también sale en el pill y sin acotar el
    // selector casaba con los dos.
    const menu = h.win.locator('.chat-sessions')
    await expect(menu).toBeVisible()
    await expect(menu.locator('button', { hasText: 'Resume este artículo' })).toBeVisible()
    // Substring, no /^New chat$/: el JSX mete un espacio antes del texto y el ancla no casaba.
    await expect(menu.locator('button', { hasText: 'New chat' })).toBeVisible()

    // Abrirla la carga en el panel.
    await menu.locator('button', { hasText: 'Resume este artículo' }).click()
    await expect(h.win.locator('text=Resume este artículo').first()).toBeVisible()
  } finally { await h.close() }
})
