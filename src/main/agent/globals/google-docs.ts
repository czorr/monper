import type { Page } from '../../../../packages/monperwright/src'

interface DocRef { docId: string; uid: number }
function parseDocUrl(input: string | DocRef): DocRef {
  if (typeof input === 'object') return { docId: input.docId, uid: input.uid ?? 0 }
  const m = String(input).match(/document\/(?:u\/(\d+)\/)?d\/([\w-]+)/)
  return { docId: m?.[2] ?? '', uid: m?.[1] ? Number(m[1]) : 0 }
}

/** Google Docs read (export cookie-auth). Las ediciones caen al fallback. */
export function makeGoogleDocs(page: Page) {
  const ensure = async (): Promise<void> => { if (!/docs\.google\.com/.test(await page.url())) await page.goto('https://docs.google.com') }
  const exportUrl = (d: DocRef, fmt: string) => `https://docs.google.com/document/u/${d.uid}/d/${d.docId}/export?format=${fmt}`
  return {
    parseUrl: parseDocUrl,
    async getDocumentHTML(input: string | DocRef) {
      const d = parseDocUrl(input)
      await ensure()
      return page.fetchText(exportUrl(d, 'html'))
    },
    async getDocumentText(input: string | DocRef) {
      const d = parseDocUrl(input)
      await ensure()
      return page.fetchText(exportUrl(d, 'txt'))
    }
  }
}
