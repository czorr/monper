import { test, expect } from '@playwright/test'
import { rmSync } from 'node:fs'
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
