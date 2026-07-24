import type { Page } from '../../../../packages/monperwright/src'
import { stripHtml } from './shared'

function gmailBase(uid: unknown): string {
  const n = typeof uid === 'number' ? uid : 0
  return `https://mail.google.com/mail/u/${n}/`
}

/** Gmail read + abrir composer (sin enviar) sobre `page`. Requiere sesión iniciada. */
export function makeGmail(page: Page) {
  const SEARCH_PARSER = `(lim) => Array.from(document.querySelectorAll('tr.zA')).map((r) => {
    const from = r.querySelector('.yX span[email], .yW span[email]');
    const subj = r.querySelector('.y6 span.bog') || r.querySelector('.y6');
    const snip = r.querySelector('.y2');
    const time = r.querySelector('td.xW span[title], .xW span');
    const idEl = r.hasAttribute('data-legacy-thread-id') ? r : r.querySelector('[data-legacy-thread-id]');
    return {
      threadId: idEl ? idEl.getAttribute('data-legacy-thread-id') : '',
      from: from ? (from.getAttribute('email') || from.textContent.trim()) : (r.querySelector('.yW') ? r.querySelector('.yW').textContent.trim() : ''),
      subject: subj ? subj.textContent.trim() : '',
      snippet: snip ? snip.textContent.trim() : '',
      date: time ? (time.getAttribute('title') || time.textContent.trim()) : '',
      unread: r.classList.contains('zE')
    };
  }).slice(0, lim)`

  const search = async (uid: unknown, query: string, opts: { limit?: number } = {}) => {
    await page.goto(gmailBase(uid) + '#search/' + encodeURIComponent(query))
    await page.waitForTimeout(1600)
    const results = await page.evaluate<unknown[]>(SEARCH_PARSER, opts.limit ?? 25)
    return { results }
  }

  return {
    search,
    getInbox: (uid: unknown, opts: { limit?: number } = {}) => search(uid, 'in:inbox', opts),
    async getThread(uid: unknown, threadId: string) {
      await page.goto(gmailBase(uid) + '#all/' + threadId)
      await page.waitForTimeout(1600)
      const parser = `() => {
        const subject = (document.querySelector('h2.hP') || {}).textContent || '';
        const messages = Array.from(document.querySelectorAll('.adn')).map((m) => {
          const from = m.querySelector('.gD');
          const body = m.querySelector('.a3s');
          const time = m.querySelector('span.g3, .gK span[title]');
          return { from: from ? (from.getAttribute('email') || from.textContent.trim()) : '', date: time ? (time.getAttribute('title') || time.textContent.trim()) : '', body: body ? body.innerText.trim() : '' };
        }).filter((x) => x.body);
        return { subject: subject.trim(), messages };
      }`
      const t = await page.evaluate<{ subject: string; messages: unknown[] }>(parser)
      return { threadId, ...t }
    },
    async openComposer(uid: unknown, opts: { to?: string; cc?: string; bcc?: string; subject?: string; bodyHtml?: string }) {
      const p = new URLSearchParams({ view: 'cm', fs: '1', tf: '1' })
      if (opts.to) p.set('to', opts.to)
      if (opts.cc) p.set('cc', opts.cc)
      if (opts.bcc) p.set('bcc', opts.bcc)
      if (opts.subject) p.set('su', opts.subject)
      if (opts.bodyHtml) p.set('body', stripHtml(opts.bodyHtml))
      await page.goto(gmailBase(uid) + '?' + p.toString())
      return { opened: true, note: 'Composer abierto (no enviado). Revisa y envía tú, o pide confirmación al usuario.' }
    },
    async openThreadDetailsPage(uid: unknown, threadId: string) {
      await page.goto(gmailBase(uid) + '#all/' + threadId)
      return { opened: true }
    }
  }
}
