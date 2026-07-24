import type { Page } from '../../../../packages/monperwright/src'

/** Computer-use: captura visible + click por coordenadas. */
export function makeCua(page: Page) {
  return {
    async getVisibleScreenshot() {
      const s = await page.screenshot()
      return { dataUrl: `data:${s.mediaType};base64,${s.data}`, mediaType: s.mediaType, base64: s.data }
    },
    async click(x: number, y: number) {
      await page.mouse.click(x, y)
    }
  }
}
