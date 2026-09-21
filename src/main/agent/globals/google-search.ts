import type { Page } from '../../../../packages/titaniowright/src'

export interface GoogleSearchOptions {
  limit?: number
  language?: string
  country?: string
  start?: number
  time?: 'day' | 'week' | 'month' | 'year'
}

/** Busca en Google navegando el tab activo y parseando el SERP (selectores estables). */
export function makeGoogleSearch(page: Page) {
  return {
    async search(query: string, opts: GoogleSearchOptions = {}) {
      const limit = opts.limit ?? 10
      const p = new URLSearchParams({ q: query, num: String(Math.min(limit + 5, 30)) })
      if (opts.language) p.set('hl', opts.language)
      if (opts.country) p.set('gl', opts.country)
      if (opts.start) p.set('start', String(opts.start))
      if (opts.time) p.set('tbs', 'qdr:' + opts.time[0])
      await page.goto('https://www.google.com/search?' + p.toString())
      await page.waitForTimeout(500)
      const parser = `(lim) => {
        const out = [];
        for (const a of Array.from(document.querySelectorAll('a'))) {
          const h3 = a.querySelector('h3');
          if (!h3) continue;
          const href = a.href;
          if (!href || !/^https?:/.test(href) || href.includes('google.com/')) continue;
          const title = (h3.textContent || '').trim();
          if (!title) continue;
          const box = a.closest('div[data-rpos]') || a.closest('div.g') || a.parentElement;
          let snippet = '';
          if (box) { const s = box.querySelector('[data-sncf], .VwiC3b, .st'); snippet = s ? (s.textContent || '').trim() : ''; }
          if (out.some((r) => r.url === href)) continue;
          out.push({ title, url: href, snippet });
          if (out.length >= lim) break;
        }
        return out;
      }`
      return page.evaluate<Array<{ title: string; url: string; snippet: string }>>(parser, limit)
    }
  }
}
