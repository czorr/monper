import { test, expect } from '@playwright/test'
import { launch, api, waitForState, serve, html, type Harness } from './helpers'

let h: Harness
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  site = await serve({ '/': html('Hola Monper'), '/otra': html('Otra página') })
  h = await launch()
})
test.afterAll(async () => { await h?.close(); await site?.close() })

test('crea una pestaña nueva y queda activa', async () => {
  const before = await waitForState(h.win, (s) => s.tabs.length > 0)
  const id = await api<number>(h.win, 'newTab')
  const after = await waitForState(h.win, (s) => s.tabs.length === before.tabs.length + 1)
  expect(after.activeId).toBe(id)
})

test('navega y refleja el título de la página en el estado', async () => {
  await api(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/')
  const s = await waitForState(h.win, (s) =>
    s.tabs.some((t) => t.title === 'Hola Monper')
  )
  expect(s.tabs.find((t) => t.id === s.activeId)?.title).toBe('Hola Monper')
})

test('cambia de pestaña con selectTab', async () => {
  const a = await api<number>(h.win, 'newTab')
  const b = await api<number>(h.win, 'newTab')
  await waitForState(h.win, (s) => s.activeId === b)
  await api(h.win, 'selectTab', a)
  const s = await waitForState(h.win, (s) => s.activeId === a)
  expect(s.activeId).toBe(a)
})

test('cierra una pestaña y desaparece del estado', async () => {
  const id = await api<number>(h.win, 'newTab')
  await waitForState(h.win, (s) => s.tabs.some((t) => t.id === id))
  await api(h.win, 'closeTab', id)
  const s = await waitForState(h.win, (s) => !s.tabs.some((t) => t.id === id))
  expect(s.tabs.some((t) => t.id === id)).toBe(false)
})

test('cerrar la última pestaña deja siempre una abierta', async () => {
  // Nunca debe quedarse en cero: la ventana sin contenido es un estado sin salida.
  let s = await waitForState(h.win, (s) => s.tabs.length > 0)
  for (const t of [...s.tabs]) await api(h.win, 'closeTab', t.id)
  s = await waitForState(h.win, (s) => s.tabs.length >= 1)
  expect(s.tabs.length).toBeGreaterThanOrEqual(1)
  expect(s.activeId).not.toBeNull()
})

test('reordena las pestañas', async () => {
  await api(h.win, 'newTab')
  await api(h.win, 'newTab')
  const s = await waitForState(h.win, (s) => s.tabs.length >= 3)
  const reversed = [...s.tabs.map((t) => t.id)].reverse()
  await api(h.win, 'reorderTabs', reversed)
  const after = await waitForState(h.win, (s) => s.tabs[0]?.id === reversed[0])
  expect(after.tabs.map((t) => t.id)).toEqual(reversed)
})

test('silencia y desilencia una pestaña', async () => {
  const id = await api<number>(h.win, 'newTab')
  await waitForState(h.win, (s) => s.tabs.some((t) => t.id === id))
  await api(h.win, 'toggleMute', id)
  const muted = await waitForState(h.win, (s) => !!s.tabs.find((t) => t.id === id)?.muted)
  expect(muted.tabs.find((t) => t.id === id)?.muted).toBe(true)
  await api(h.win, 'toggleMute', id)
  const un = await waitForState(h.win, (s) => !s.tabs.find((t) => t.id === id)?.muted)
  expect(un.tabs.find((t) => t.id === id)?.muted).toBeFalsy()
})

test('una URL que no resuelve muestra la página de error, no una pantalla en blanco', async () => {
  await api(h.win, 'newTab')
  await api(h.win, 'go', 'https://dominio-que-no-existe.monper-test')
  // La URL de la pestaña conserva lo que pidió el usuario (para que la omnibox lo muestre),
  // así que la señal de que se pintó la página de error es el título.
  const s = await waitForState(
    h.win,
    (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'Error',
    20_000
  )
  expect(s.tabs.find((t) => t.id === s.activeId)?.url).toContain('dominio-que-no-existe')
})

test('el efecto de pulsación no impide cerrar una pestaña', async () => {
  // La fila se hunde al pulsarla (`scale` + `translate-y`). Cuando ese efecto se aplicaba
  // también al pulsar sus BOTONES, el transform movía el botón de cerrar de debajo del
  // puntero y el click no llegaba a dispararse: parecía que cerrar no funcionaba.
  await api(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/')
  await waitForState(h.win, (s) => s.tabs.some((t) => t.title === 'Hola Monper'))
  const antes = (await waitForState(h.win, () => true)).tabs.length

  const fila = h.win.locator('.group\\/tab').first()
  await fila.hover()
  await fila.locator('[title="Cerrar"]').click()
  await expect.poll(async () => (await waitForState(h.win, () => true)).tabs.length).toBe(antes - 1)
})

test('marcar una pestaña la CONVIERTE en el marcador, no la duplica', async () => {
  /**
   * `TabInfo.bookmarkId` es lo que hace que la pestaña se pinte en el slot del marcador y
   * salga de "Tabs". Se ataba al ABRIR un marcador pero no al crearlo, así que al marcar
   * salían dos filas: el marcador y la pestaña, como si fueran cosas distintas.
   */
  const id = await api<number>(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/otra')
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === id)?.title === 'Otra página')

  await api(h.win, 'toggleBookmark')
  const marcadores = await api<{ id: string }[]>(h.win, 'getBookmarks')
  const bm = marcadores.find((b) => b)!

  const s = await waitForState(h.win, (st) => !!st.tabs.find((t) => t.id === id)?.bookmarkId)
  const tab = s.tabs.find((t) => t.id === id)!
  expect(tab.bookmarkId, 'la pestaña tiene que quedar atada al marcador que acaba de crear').toBe(bm.id)
})

test('quitar el marcador devuelve la pestaña a Tabs, no la deja invisible', async () => {
  /**
   * El bug de verdad, y peor que la duplicación: el sidebar excluye de "Tabs" las pestañas
   * con `bookmarkId`. Si se borra el marcador sin soltarlas, no hay fila de marcador donde
   * pintarlas y la pestaña sigue VIVA pero no se ve — no se puede ni seleccionar ni cerrar.
   */
  const id = await api<number>(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/')
  await waitForState(h.win, (s) => s.tabs.find((t) => t.id === id)?.title === 'Hola Monper')
  await api(h.win, 'toggleBookmark')
  const s1 = await waitForState(h.win, (st) => !!st.tabs.find((t) => t.id === id)?.bookmarkId)
  const bmId = s1.tabs.find((t) => t.id === id)!.bookmarkId!

  // `bookmarks:remove` está restringido a páginas internas (ver isInternalSender), así que
  // se llama desde una: es el camino real, y emitirlo a pelo no pasaría el filtro.
  await api(h.win, 'openSettings')
  await h.win.waitForTimeout(400)
  await h.app.evaluate(async ({ webContents }, b) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('settings'))
    if (!wc) throw new Error('no hay página interna desde la que borrar')
    return wc.executeJavaScript(`window.monperTab.removeBookmark(${JSON.stringify(b)})`)
  }, bmId)

  const s2 = await waitForState(h.win, (st) => !st.tabs.find((t) => t.id === id)?.bookmarkId)
  const tab = s2.tabs.find((t) => t.id === id)
  expect(tab, 'la pestaña tiene que seguir existiendo').toBeTruthy()
  expect(tab!.bookmarkId, 'y volver a ser una pestaña normal, visible en Tabs').toBeFalsy()
})

test('reordenar marcadores nunca pierde ninguno', async () => {
  /**
   * El reorden llega del sidebar como una lista de ids, y esa lista puede venir incompleta o
   * traer basura: borraste un marcador mientras arrastrabas, o el renderer va un frame por
   * detrás. Un reorden que pierde marcadores es peor que uno que no ordena.
   */
  // `toggleBookmark` ALTERNA, y estos tests comparten harness: llamarlo a ciegas sobre una
  // página que un test anterior ya marcó la DESMARCA. Se comprueba antes de tocar.
  for (const ruta of ['/', '/otra']) {
    await api(h.win, 'newTab')
    await api(h.win, 'go', site.url + ruta)
    // Por la pestaña ACTIVA, no por "alguna": con ruta='/' casaba cualquier otra pestaña ya
    // abierta y seguíamos antes de que esta navegara — entonces `toggleBookmark` veía todavía
    // la new tab, caía en su guarda y no marcaba nada.
    await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.url.endsWith(ruta) === true)
    const actuales = await api<{ url: string }[]>(h.win, 'getBookmarks')
    if (!actuales.some((b) => b.url.endsWith(ruta))) await api(h.win, 'toggleBookmark')
  }

  const antes = await api<{ id: string }[]>(h.win, 'getBookmarks')
  expect(antes.length).toBeGreaterThanOrEqual(2)

  // Se invierte, y además se cuela una id inexistente: debe ignorarse sin tirar nada.
  const invertido = [...antes.map((b) => b.id)].reverse()
  await api(h.win, 'reorderBookmarks', [...invertido, 'id-que-no-existe'])
  await expect
    .poll(async () => (await api<{ id: string }[]>(h.win, 'getBookmarks')).map((b) => b.id))
    .toEqual(invertido)

  // Y una lista PARCIAL conserva los que no venían, al final, en vez de borrarlos.
  await api(h.win, 'reorderBookmarks', [invertido[1]])
  const parcial = await api<{ id: string }[]>(h.win, 'getBookmarks')
  expect(parcial.length, 'una lista incompleta no debe perder marcadores').toBe(antes.length)
  expect(parcial[0].id).toBe(invertido[1])
})
