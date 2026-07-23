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
