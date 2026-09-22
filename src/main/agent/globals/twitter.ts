import type { Page } from '../../../../packages/titaniowright/src'

const TWEETS_PARSER = `(lim) => Array.from(document.querySelectorAll('article')).map((a) => {
  const t = a.querySelector('[data-testid=tweetText]');
  const time = a.querySelector('time');
  const link = time && time.closest('a') ? time.closest('a').href : '';
  const user = a.querySelector('[data-testid=User-Name]');
  return { text: t ? t.textContent.trim() : '', url: link, time: time ? time.getAttribute('datetime') : '', author: user ? user.textContent.replace(/\\s+/g,' ').trim() : '' };
}).filter((x) => x.text).slice(0, lim)`

/** X/Twitter read-only best-effort sobre `page` (requiere sesión iniciada). */
export function makeTwitter(page: Page) {
  const scrape = (lim: number) => page.evaluate<Array<{ text: string; url: string; time: string; author: string }>>(TWEETS_PARSER, lim)
  return {
    async search(query: string, opts: { limit?: number } = {}) {
      await page.goto('https://x.com/search?f=live&q=' + encodeURIComponent(query))
      await page.waitForTimeout(1200)
      return scrape(opts.limit ?? 20)
    },
    async getTimeline(opts: { limit?: number } = {}) {
      await page.goto('https://x.com/home')
      await page.waitForTimeout(1200)
      return scrape(opts.limit ?? 20)
    },
    async getUser(handle: string, opts: { limit?: number } = {}) {
      await page.goto('https://x.com/' + handle.replace(/^@/, ''))
      await page.waitForTimeout(1200)
      return scrape(opts.limit ?? 20)
    },
    async getTweet(url: string) {
      await page.goto(url)
      await page.waitForTimeout(1000)
      return (await scrape(1))[0] ?? null
    }
  }
}
