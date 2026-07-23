import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'
import type { Bookmark } from '../shared/types'

let file = ''
let items: Bookmark[] = []

const SEED: Bookmark[] = [
  { id: 'gmail', title: 'Gmail', url: 'https://mail.google.com' },
  { id: 'youtube', title: 'YouTube', url: 'https://youtube.com' },
  { id: 'github', title: 'GitHub', url: 'https://github.com' },
  { id: 'figma', title: 'Figma', url: 'https://figma.com' },
  { id: 'x', title: 'X', url: 'https://x.com' },
  { id: 'wa', title: 'WhatsApp', url: 'https://web.whatsapp.com' }
]

function persist(): void {
  try { writeFileSync(file, JSON.stringify(items, null, 2)) } catch { /* noop */ }
}

export function initBookmarks(): void {
  file = join(app.getPath('userData'), 'bookmarks.json')
  if (existsSync(file)) {
    try { items = JSON.parse(readFileSync(file, 'utf-8')) } catch { items = [...SEED] }
  } else {
    items = [...SEED]
    persist()
  }
}

export function listBookmarks(): Bookmark[] {
  return items
}

export function isBookmarked(url: string): boolean {
  return items.some((b) => b.url === url)
}

export function addBookmark(b: Omit<Bookmark, 'id'>): Bookmark {
  const existing = items.find((x) => x.url === b.url)
  if (existing) return existing
  const bm: Bookmark = { id: Math.random().toString(36).slice(2), ...b }
  items = [...items, bm]
  persist()
  return bm
}

export function removeBookmark(id: string): void {
  items = items.filter((b) => b.id !== id)
  persist()
}

/** Alterna el bookmark de una URL; devuelve true si quedó guardada */
export function toggleBookmark(url: string, title: string, favicon?: string | null): boolean {
  const existing = items.find((b) => b.url === url)
  if (existing) { removeBookmark(existing.id); return false }
  addBookmark({ url, title, favicon })
  return true
}
