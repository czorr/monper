import { test, expect } from '@playwright/test'
import { rmSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, api, waitForState, serve, html, type Harness } from './helpers'

interface BookmarkLike { id: string; url: string; title: string }

let h: Harness
let site: { url: string; close: () => Promise<void> }

/** La app trae marcadores por defecto, así que todo se mide contra la lista inicial. */
let baseline = 0

test.beforeAll(async () => {
  site = await serve({ '/': html('Marcable') })
  h = await launch()
  baseline = (await api<BookmarkLike[]>(h.win, 'getBookmarks')).length
})
test.afterAll(async () => { await h?.close(); await site?.close() })

const bookmarks = (harness: Harness): Promise<BookmarkLike[]> => api<BookmarkLike[]>(harness.win, 'getBookmarks')

test('marca la pestaña activa y aparece en la lista', async () => {
  await api(h.win, 'go', site.url + '/')
  await waitForState(h.win, (s) => s.tabs.some((t) => t.title === 'Marcable'))
  await api(h.win, 'toggleBookmark')
  await expect.poll(async () => (await bookmarks(h)).length).toBe(baseline + 1)
  expect((await bookmarks(h)).some((b) => b.url.includes('127.0.0.1'))).toBe(true)
})

test('el estado marca la pestaña como bookmarked', async () => {
  const s = await waitForState(h.win, (s) => !!(s.active as { bookmarked?: boolean })?.bookmarked)
  expect((s.active as { bookmarked?: boolean }).bookmarked).toBe(true)
})

test('desmarcar la misma pestaña quita el marcador', async () => {
  // Por `toggleBookmark`, no por `removeBookmark`: ese canal está restringido a las
  // páginas internas y desde el chrome no hace nada (ver security.spec.ts).
  await api(h.win, 'toggleBookmark')
  await expect.poll(async () => (await bookmarks(h)).length).toBe(baseline)
  expect((await bookmarks(h)).some((b) => b.url.includes('127.0.0.1'))).toBe(false)
})

test('los tamaños de los paneles vienen con sus límites', async () => {
  const panels = await api<{ sidebar: number; chat: number; limits: unknown }>(h.win, 'getPanels')
  expect(panels.sidebar).toBeGreaterThan(0)
  expect(panels.chat).toBeGreaterThan(0)
  expect(panels.limits).toBeTruthy()
})

test('sin feed configurado no anuncia actualizaciones', async () => {
  const u = await api<{ available: boolean; downloading: boolean; error: string | null }>(h.win, 'getUpdateState')
  expect(u.available).toBe(false)
  expect(u.downloading).toBe(false)
  expect(u.error).toBeNull()
})

test('los marcadores sobreviven a un reinicio', async () => {
  const site2 = await serve({ '/': html('Persistente') })
  const first = await launch()
  let profile = ''
  try {
    profile = first.userData
    const base = (await bookmarks(first)).length
    await api(first.win, 'go', site2.url + '/')
    await waitForState(first.win, (s) => s.tabs.some((t) => t.title === 'Persistente'))
    await api(first.win, 'toggleBookmark')
    await expect.poll(async () => (await bookmarks(first)).length).toBe(base + 1)
  } finally {
    await first.close(true) // conserva el perfil para el segundo arranque
  }

  const second = await launch({}, profile)
  try {
    expect((await bookmarks(second)).some((b) => b.title === 'Persistente')).toBe(true)
  } finally {
    await second.close()
    rmSync(profile, { recursive: true, force: true })
    await site2.close()
  }
})

test('un fichero de estado corrupto no impide arrancar', async () => {
  // Antes esto se tragaba en silencio (`catch { items = [...SEED] }`). Ahora se avisa por
  // consola, pero lo importante sigue siendo que la app abra y no se lleve nada por delante.
  const first = await launch()
  const profile = first.userData
  await first.close(true)

  writeFileSync(join(profile, 'bookmarks.json'), '{ esto no es json', 'utf8')

  const second = await launch({}, profile)
  try {
    // Arranca, y con los marcadores por defecto en vez de una lista vacía.
    await waitForState(second.win, (s) => s.tabs.length > 0)
    expect((await bookmarks(second)).length).toBeGreaterThan(0)
  } finally {
    await second.close()
    rmSync(profile, { recursive: true, force: true })
  }
})

test('la escritura de estado es atómica (no deja .tmp por ahí)', async () => {
  // writeJson escribe en un .tmp y hace rename para que un cierre a mitad no deje el JSON
  // truncado. El .tmp no debe sobrevivir a la operación.
  const h2 = await launch()
  try {
    await api(h2.win, 'toggleBookmark')
    await new Promise((r) => setTimeout(r, 300))
    const sobras = readdirSync(h2.userData).filter((f) => f.endsWith('.tmp'))
    expect(sobras, `quedaron temporales: ${sobras.join(', ')}`).toEqual([])
  } finally {
    await h2.close()
  }
})
