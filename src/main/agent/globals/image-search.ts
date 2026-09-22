import type { Page } from '../../../../packages/titaniowright/src'

/** Búsqueda de imágenes en Google (srcs de los thumbnails). */
export function makeImageSearch(page: Page) {
  return {
    async search(query: string, opts: { limit?: number } = {}) {
      await page.goto('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(query))
      await page.waitForTimeout(600)
      const parser = `(lim) => Array.from(document.querySelectorAll('img'))
        .map((im) => ({ thumbnail: im.src, alt: im.alt || '' }))
        .filter((x) => x.thumbnail && x.thumbnail.startsWith('http'))
        .slice(0, lim)`
      return page.evaluate<Array<{ thumbnail: string; alt: string }>>(parser, opts.limit ?? 20)
    }
  }
}
