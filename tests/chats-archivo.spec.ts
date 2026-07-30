import { test, expect } from '@playwright/test'
import { launch, type Harness } from './helpers'
import type { ChatSessionBusqueda } from '../src/shared/types'

/**
 * Settings → Chats: buscar, archivar y retomar conversaciones.
 *
 * Las dos invariantes que de verdad importan y que un test de UI no cogería:
 * 1. Se busca en el CONTENIDO, no solo en el título — el título es el primer mensaje, así que
 *    buscar por él encuentra conversaciones por cómo empezaron, no por lo que trataron.
 * 2. Archivar protege del techo de 200. Si el recorte por antigüedad se llevara una archivada
 *    haría exactamente lo contrario de lo que el usuario pidió.
 */

let h: Harness

test.beforeAll(async () => {
  h = await launch()
  await h.app.evaluate(({ Menu }) => {
    const buscar = (l: string): Electron.MenuItem | undefined =>
      Menu.getApplicationMenu()?.items.flatMap((i) => i.submenu?.items ?? []).find((i) => i.label === l)
    ;(buscar('Settings…') ?? buscar('Ajustes…') ?? buscar('Preferencias…'))?.click()
  })
  await expect.poll(async () => h.app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().some((w) => w.getURL().includes('settings.html'))
  ), { timeout: 10_000 }).toBe(true)
})
test.afterAll(async () => { await h?.close() })

/** Llama a `window.monperTab.<metodo>` dentro de Settings, que es una página interna. */
async function enSettings<T>(metodo: string, ...args: unknown[]): Promise<T> {
  return h.app.evaluate(async ({ webContents }, { metodo, args }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('settings.html'))
    if (!wc) throw new Error('Settings no está abierto')
    return (await wc.executeJavaScript(`window.monperTab.${metodo}(${args.map((a) => JSON.stringify(a)).join(',')})`)) as T
  }, { metodo, args }) as Promise<T>
}

/**
 * Crea una conversación por el MISMO camino que el panel del chat: `chatsNew` + `chatsSave`
 * desde la ventana del chrome. Fabricarla escribiendo el JSON a mano probaría un formato que
 * quizá el panel ya no usa.
 */
async function conversacion(primero: string, resto: string[] = []): Promise<string> {
  const id = await h.win.evaluate(async () => {
    const m = (window as never as Record<string, Record<string, unknown>>)['monper']
    const s = await (m['chatsNew'] as () => Promise<{ id: string }>)()
    return s.id
  })
  await h.win.evaluate(({ id, primero, resto }) => {
    const m = (window as never as Record<string, Record<string, unknown>>)['monper']
    const mensajes = [
      { role: 'user', text: primero },
      ...resto.map((t) => ({ role: 'assistant', parts: [{ type: 'text', text: t }] }))
    ]
    ;(m['chatsSave'] as (i: string, ms: unknown[]) => void)(id, mensajes)
  }, { id, primero, resto })
  // `chats:save` es un send: hay que darle un instante al main antes de leer.
  await new Promise((r) => setTimeout(r, 150))
  return id
}

test('busca dentro de la conversación, no solo en el título', async () => {
  // El título es el PRIMER mensaje. Esta conversación empieza hablando de una cosa y acaba
  // mencionando otra: buscar la segunda solo funciona si se mira el contenido.
  const id = await conversacion('ayúdame con el deploy', ['el benchmark de Postgres salió en 14ms'])
  expect(id, 'no se pudo crear la conversación de prueba').toBeTruthy()

  const porTitulo = await enSettings<ChatSessionBusqueda[]>('chatsSearch', 'deploy', true)
  expect(porTitulo.some((s) => s.id === id)).toBe(true)

  const porContenido = await enSettings<ChatSessionBusqueda[]>('chatsSearch', 'Postgres', true)
  const encontrada = porContenido.find((s) => s.id === id)
  expect(encontrada, 'buscar por contenido no encontró la conversación').toBeTruthy()
  expect(encontrada!.snippet, 'el fragmento explica por qué salió este resultado').toContain('Postgres')
})

test('archivar la saca del desplegable del panel, pero no la borra', async () => {
  const id = await conversacion('conversación que quiero guardar')
  await enSettings('chatsArchive', id, true)

  const enPanel = await h.win.evaluate(async () => {
    const m = (window as never as Record<string, Record<string, unknown>>)['monper']
    return (await (m['chatsList'] as () => Promise<{ id: string }[]>)())
  })
  expect(enPanel.some((s) => s.id === id), 'archivada no debe salir en el desplegable del panel').toBe(false)

  const todas = await enSettings<ChatSessionBusqueda[]>('chatsSearch', '', true)
  const a = todas.find((s) => s.id === id)
  expect(a, 'archivar no puede borrarla').toBeTruthy()
  expect(a!.archived).toBe(true)

  // Y sin incluir archivadas, no sale.
  const soloActivas = await enSettings<ChatSessionBusqueda[]>('chatsSearch', '', false)
  expect(soloActivas.some((s) => s.id === id)).toBe(false)
})

test('desarchivar la devuelve al desplegable', async () => {
  const todas = await enSettings<ChatSessionBusqueda[]>('chatsSearch', '', true)
  const archivada = todas.find((s) => s.archived)!
  await enSettings('chatsArchive', archivada.id, false)
  const despues = await enSettings<ChatSessionBusqueda[]>('chatsSearch', '', false)
  expect(despues.some((s) => s.id === archivada.id)).toBe(true)
})

test('renombrar y borrar devuelven la lista ya actualizada', async () => {
  const id = await conversacion('para renombrar')
  const trasRenombrar = await enSettings<ChatSessionBusqueda[]>('chatsRename', id, 'Nombre nuevo')
  expect(trasRenombrar.find((s) => s.id === id)?.title).toBe('Nombre nuevo')

  const trasBorrar = await enSettings<ChatSessionBusqueda[]>('chatsDelete', id)
  expect(trasBorrar.some((s) => s.id === id)).toBe(false)
})
