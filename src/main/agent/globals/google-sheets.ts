import type { Page } from '../../../../packages/titaniowright/src'

interface SheetRef { docId: string; uid: number; gid: string }
function parseSheetUrl(input: string | Partial<SheetRef>): SheetRef {
  if (typeof input === 'object') return { docId: input.docId ?? '', uid: input.uid ?? 0, gid: input.gid ?? '0' }
  const s = String(input)
  const m = s.match(/spreadsheets\/(?:u\/(\d+)\/)?d\/([\w-]+)/)
  const g = s.match(/[#&]gid=(\d+)/)
  return { docId: m?.[2] ?? '', uid: m?.[1] ? Number(m[1]) : 0, gid: g?.[1] ?? '0' }
}

// Parser CSV mínimo (comillas, comas y saltos escapados).
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

/** Google Sheets read (export CSV cookie-auth). Las escrituras caen al fallback. */
export function makeGoogleSheets(page: Page) {
  const ensure = async (): Promise<void> => { if (!/docs\.google\.com/.test(await page.url())) await page.goto('https://docs.google.com') }
  return {
    parseUrl: parseSheetUrl,
    async readSheet(input: string | Partial<SheetRef>) {
      const s = parseSheetUrl(input)
      await ensure()
      const url = `https://docs.google.com/spreadsheets/u/${s.uid}/d/${s.docId}/export?format=csv&gid=${s.gid}`
      const csv = await page.fetchText(url)
      return { gid: s.gid, cells: parseCSV(csv) }
    }
  }
}
