import type { Page } from '../../../../packages/monperwright/src'

// Cliente MÍNIMO read-only sobre la API interna de Notion (/api/v3), best-effort.
// Requiere sesión iniciada; navegamos el tab a notion.so para que el fetch sea same-origin
// (hereda cookies). Las escrituras (addNew, addFromMarkdown, set, remove…) NO están portadas.

const API = 'https://www.notion.so/api/v3/'
const post = (page: Page, method: string, body: unknown): Promise<Record<string, unknown>> =>
  page.fetchJSON(API + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

function dashify(id: string): string {
  const raw = (id.match(/[0-9a-f]{32}/i) || [id.replace(/-/g, '')])[0]
  if (raw.length !== 32) return id
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
}
function richText(prop: unknown): string {
  if (!Array.isArray(prop)) return ''
  return prop.map((seg) => (Array.isArray(seg) ? String(seg[0] ?? '') : '')).join('')
}

type Rec = Record<string, { value?: Record<string, unknown> }>
interface NBlock {
  id: string
  type: string
  title: string
  get(path: string): unknown
  readonly children: NBlock[]
}
function makeBlock(id: string, blocks: Rec): NBlock {
  const value = blocks[id]?.value ?? {}
  const write = (op: string) => () => { throw new Error(`notion.${op}: escritura no portada. Edita en notion.so con page (goto + click/type).`) }
  return {
    id,
    get type() { return String(value.type ?? '') },
    get title() { return richText((value.properties as Record<string, unknown> | undefined)?.title) },
    get(path: string) { return path.split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), value) },
    get children() {
      const arr = ((value.content as string[]) ?? []).map((cid) => makeBlock(cid, blocks)) as NBlock[] & Record<string, unknown>
      arr.addNew = write('children.addNew'); arr.addFromMarkdown = write('children.addFromMarkdown')
      return arr as unknown as NBlock[]
    },
    set: write('set'), remove: write('remove'), moveTo: write('moveTo')
  } as NBlock
}

/** Convierte un bloque (y sus hijos) a markdown, usando la API pública del wrapper. */
export function blockToMarkdown(block: NBlock, depth = 0): string {
  const pad = '  '.repeat(depth)
  const t = block.type
  const title = block.title
  let line = ''
  switch (t) {
    case 'page': case 'header': line = '# ' + title; break
    case 'sub_header': line = '## ' + title; break
    case 'sub_sub_header': line = '### ' + title; break
    case 'bulleted_list': line = pad + '- ' + title; break
    case 'numbered_list': line = pad + '1. ' + title; break
    case 'to_do': {
      const checked = (block.get('properties.checked') as unknown[] | undefined)?.[0]
      const done = Array.isArray(checked) && checked[0] === 'Yes'
      line = pad + `- [${done ? 'x' : ' '}] ` + title
      break
    }
    case 'quote': line = '> ' + title; break
    case 'code': line = '```\n' + title + '\n```'; break
    case 'divider': line = '---'; break
    default: line = title
  }
  const nest = t.includes('list') || t === 'to_do' ? depth + 1 : depth
  const kids = block.children.map((c) => blockToMarkdown(c, nest)).filter(Boolean).join('\n')
  return [line, kids].filter(Boolean).join('\n')
}

export function makeNotion(page: Page) {
  let space: { id: string; value: Record<string, unknown> } | null = null
  let user: { id: string; value: Record<string, unknown> } | null = null

  const ensure = async (): Promise<void> => {
    if (space) return
    if (!/notion\.(so|com)/.test(await page.url())) await page.goto('https://www.notion.so')
    const spaces = await post(page, 'getSpaces', {})
    const uid = Object.keys(spaces)[0]
    if (!uid) throw new Error('No hay sesión de Notion. Inicia sesión en notion.so.')
    const rm = spaces[uid] as Record<string, Rec>
    const sid = Object.keys(rm.space || {})[0]
    space = { id: sid, value: (rm.space?.[sid]?.value ?? {}) as Record<string, unknown> }
    user = { id: uid, value: (rm.notion_user?.[uid]?.value ?? {}) as Record<string, unknown> }
  }

  const client = {
    get currentUser() { return { email: user?.value.email, fullName: user?.value.name } },
    get currentSpace() { return { get: (p: string) => p.split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), space?.value) } },
    async search(opts: { query: string; limit?: number; isNavigableOnly?: boolean }) {
      await ensure()
      const res = await post(page, 'search', {
        type: 'BlocksInSpace', query: opts.query, spaceId: space!.id, limit: opts.limit ?? 20,
        filters: { isDeletedOnly: false, excludeTemplates: false, isNavigableOnly: !!opts.isNavigableOnly, requireEditPermissions: false, ancestors: [], createdBy: [], editedBy: [], lastEditedTime: {}, createdTime: {} },
        sort: 'Relevance', source: 'quick_find_input_change'
      })
      const blocks = (res.recordMap as { block?: Rec })?.block ?? {}
      return ((res.results as Array<{ id: string }>) ?? []).map((r) => makeBlock(r.id, blocks))
    },
    async getBlock(idOrUrl: string) {
      await ensure()
      const id = dashify(idOrUrl)
      const res = await post(page, 'loadPageChunk', { pageId: id, limit: 100, cursor: { stack: [] }, chunkNumber: 0, verticalColumns: false })
      const blocks = (res.recordMap as { block?: Rec })?.block ?? {}
      return makeBlock(id, blocks)
    }
  }

  return {
    async listAccounts() { await ensure(); return [{ email: user?.value.email, spaceName: space?.value.name }] },
    async getClient() { await ensure(); return client },
    invalidateCache() { space = null; user = null }
  }
}
