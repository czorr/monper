export type VaultItemType = 'ai-key' | 'web-credential' | 'service-token' | 'secret'

/** Metadata pública de un ítem del vault (NUNCA incluye el secreto) */
export interface VaultItemMeta {
  id: string
  type: VaultItemType
  label: string
  createdAt: number
  updatedAt: number
  /** metadata no-secreta específica del tipo (kind, origin, username, service, name…) */
  data: Record<string, string>
}

export interface VaultItemInput {
  type: VaultItemType
  label: string
  data: Record<string, string>
}

/** La misma normalización para alta, importación, edición y autorrelleno. */
export function normalizeCredentialOrigin(value: string): string | null {
  try {
    const input = value.trim()
    if (!input) return null
    if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^https?:\/\//i.test(input) && !/^[^/:]+:\d+(?:[/?#]|$)/.test(input)) return null
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null
    return url.origin
  } catch { return null }
}

/** Se admite el alias www, pero no otros subdominios, protocolos ni puertos. */
export function sameCredentialSite(a: string, b: string): boolean {
  const left = normalizeCredentialOrigin(a)
  const right = normalizeCredentialOrigin(b)
  if (!left || !right) return false
  const x = new URL(left)
  const y = new URL(right)
  return x.protocol === y.protocol && x.port === y.port &&
    x.hostname.replace(/^www\./, '') === y.hostname.replace(/^www\./, '')
}
