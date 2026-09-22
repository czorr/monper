import type { Page } from '../../../../packages/titaniowright/src'

// Cliente sobre la Slack Web API. Extrae el token xoxc- del localStorage de la sesión
// (localConfig_v2) y llama https://<team>.slack.com/api/<method> con el cookie de sesión.
// Devuelve un WebClient genérico: client.<ns>.<method>(args) → POST /api/<ns>.<method>.

interface Team { id: string; name: string; url: string; token: string; user_id?: string }

function slug(url: string): string {
  try { return new URL(url).hostname.split('.')[0] } catch { return '' }
}

function webClient(page: Page, team: Team): unknown {
  const call = async (method: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    const form = new URLSearchParams()
    form.set('token', team.token)
    for (const [k, v] of Object.entries(args)) {
      if (v === undefined || v === null) continue
      form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    }
    const base = team.url.replace(/\/$/, '')
    return page.fetchJSON(`${base}/api/${method}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    })
  }
  // client.<ns>.<method>(args) — p. ej. conversations.history, chat.postMessage, search.messages.
  return new Proxy(
    {},
    {
      get: (_t, ns) =>
        new Proxy({}, { get: (_t2, method) => (args: Record<string, unknown>) => call(`${String(ns)}.${String(method)}`, args) })
    }
  )
}

export function makeSlack(page: Page) {
  let config: { teams?: Record<string, Team>; lastActiveTeamId?: string } | null = null

  const ensure = async (): Promise<void> => {
    if (config?.teams) return
    if (!/slack\.com/.test(await page.url())) await page.goto('https://app.slack.com')
    await page.waitForTimeout(900)
    config = await page.evaluate<typeof config>(`() => { try { return JSON.parse(localStorage.localConfig_v2 || localStorage.localConfig || 'null'); } catch (e) { return null; } }`)
    if (!config?.teams || !Object.keys(config.teams).length) {
      throw new Error('No hay sesión de Slack (o no se pudo leer el token). Inicia sesión en Slack web.')
    }
  }

  return {
    async listWorkspaces() {
      await ensure()
      return Object.values(config!.teams!).map((t) => ({
        teamId: t.id, name: t.name, url: t.url, slug: slug(t.url), userId: t.user_id ?? null, status: t.token ? 'joined' : 'needs-login'
      }))
    },
    async getClient(teamId?: string) {
      await ensure()
      const teams = config!.teams!
      const team = (teamId && teams[teamId]) || (config!.lastActiveTeamId && teams[config!.lastActiveTeamId]) || Object.values(teams)[0]
      if (!team?.token) throw new Error('No se encontró token de Slack para ese workspace (¿sesión expirada?).')
      return webClient(page, team)
    }
  }
}
