import type { Page } from '../../../../packages/titaniowright/src'
import { decodeEntities } from './shared'

function ytId(s: string): string | null {
  const m = s.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/)
  return m ? m[1] : /^[\w-]{11}$/.test(s) ? s : null
}
function watchUrl(s: string): string {
  const id = ytId(s)
  return id ? 'https://www.youtube.com/watch?v=' + id : s
}

/** YouTube read-only sobre `page` (público, sin login). */
export function makeYoutube(page: Page) {
  return {
    async search(query: string, opts: { limit?: number } = {}) {
      await page.goto('https://www.youtube.com/results?search_query=' + encodeURIComponent(query))
      await page.waitForTimeout(700)
      const parser = `(lim) => Array.from(document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer')).map((el) => {
        const a = el.querySelector('a#video-title, a#video-title-link');
        const ch = el.querySelector('ytd-channel-name a, #channel-name a');
        const meta = el.querySelector('#metadata-line');
        return { title: a ? (a.getAttribute('title') || a.textContent || '').trim() : '', url: a ? a.href : '', channel: ch ? ch.textContent.trim() : '', meta: meta ? meta.textContent.replace(/\\s+/g,' ').trim() : '' };
      }).filter((v) => v.url && v.title).slice(0, lim)`
      return page.evaluate<Array<{ title: string; url: string; channel: string; meta: string }>>(parser, opts.limit ?? 15)
    },
    async getMetadata(idOrUrl: string) {
      await page.goto(watchUrl(idOrUrl))
      await page.waitForTimeout(500)
      return page.evaluate(`() => { const r = window.ytInitialPlayerResponse; const d = r && r.videoDetails; if (!d) return null; return { title: d.title, author: d.author, videoId: d.videoId, views: Number(d.viewCount||0), lengthSeconds: Number(d.lengthSeconds||0), description: d.shortDescription, keywords: d.keywords||[] }; }`)
    },
    async getTranscript(idOrUrl: string) {
      await page.goto(watchUrl(idOrUrl))
      await page.waitForTimeout(700)
      const baseUrl = await page.evaluate<string | null>(`() => { try { const t = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks; if (!t || !t.length) return null; const en = t.find((x) => (x.languageCode||'').startsWith('en')) || t[0]; return en.baseUrl || null; } catch (e) { return null; } }`)
      if (!baseUrl) throw new Error('No hay transcripción disponible para este video.')
      const res = await page.fetch(baseUrl)
      const segments: Array<{ start: number; dur: number; text: string }> = []
      const re = /<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g
      let m: RegExpExecArray | null
      while ((m = re.exec(res.body))) {
        segments.push({ start: Number(m[1]), dur: Number(m[2] || 0), text: decodeEntities(m[3]).replace(/\s+/g, ' ').trim() })
      }
      return { text: segments.map((s) => s.text).join(' '), segments }
    },
    async getComments(idOrUrl: string, opts: { limit?: number; scrolls?: number } = {}) {
      await page.goto(watchUrl(idOrUrl))
      await page.waitForTimeout(800)
      for (let i = 0; i < (opts.scrolls ?? 4); i++) { await page.scrollBy(1600); await page.waitForTimeout(700) }
      return page.evaluate<string[]>(`(lim) => Array.from(document.querySelectorAll('ytd-comment-thread-renderer #content-text')).map((e) => (e.textContent||'').trim()).filter(Boolean).slice(0, lim)`, opts.limit ?? 30)
    }
  }
}
