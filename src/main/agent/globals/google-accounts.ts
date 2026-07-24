import type { Page } from '../../../../packages/monperwright/src'

// Descubre las cuentas de Google logueadas vía el endpoint ListAccounts (cookie-only).
export function makeGoogleAccounts(page: Page) {
  const list = async () => {
    if (!/\.google\.com/.test(await page.url())) await page.goto('https://myaccount.google.com')
    let raw = ''
    try {
      raw = await page.fetchText('https://accounts.google.com/ListAccounts?gpsia=1&source=ChromeOgb&mo=1&mn=1', { credentials: 'include' })
    } catch { /* noop */ }
    try {
      const data = JSON.parse(raw) as unknown[]
      const arr = (data[1] as unknown[][]) || []
      // Cada cuenta: [tag, ?, name, email, ?, photoUrl, ...]. El orden ≈ /u/{uid}.
      return arr.map((a, i) => ({ accountId: i, name: String(a[2] ?? ''), email: String(a[3] ?? ''), profileImageUrl: String(a[5] ?? a[4] ?? '') }))
        .filter((a) => a.email)
    } catch {
      return []
    }
  }
  return {
    list,
    async print() {
      const a = await list()
      return a.length ? a.map((x) => `u/${x.accountId}: ${x.name} <${x.email}>`).join('\n') : 'No se detectaron cuentas de Google.'
    }
  }
}
