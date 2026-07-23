import { useEffect, useState, type JSX } from 'react'
import type { VaultItemMeta, VaultItemType } from '@shared/vault'
import IconLock from '~icons/tabler/lock'
import IconSparkles from '~icons/tabler/sparkles'
import IconKey from '~icons/tabler/key'
import IconWorld from '~icons/tabler/world'
import IconTag from '~icons/tabler/tag'
import IconSettings from '~icons/tabler/settings'

const { vaultwin } = window

const GROUPS: { type: VaultItemType; label: string; icon: JSX.Element }[] = [
  { type: 'ai-key', label: 'AI Keys', icon: <IconSparkles /> },
  { type: 'web-credential', label: 'Passwords', icon: <IconWorld /> },
  { type: 'service-token', label: 'Tokens', icon: <IconKey /> },
  { type: 'secret', label: 'Secrets', icon: <IconTag /> }
]

function subtext(it: VaultItemMeta): string {
  return it.data.username || it.data.origin || it.data.service || it.data.kind || it.data.name || ''
}

export default function VaultWindow(): JSX.Element {
  const [items, setItems] = useState<VaultItemMeta[]>([])

  useEffect(() => {
    vaultwin.onItems(setItems)
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') vaultwin.close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="h-full flex flex-col bg-[#1b1b1f] text-text select-none">
      <div className="flex items-center gap-2 px-4 h-11 shrink-0 border-b border-border">
        <IconLock className="w-[15px] h-[15px] text-text-dim" />
        <span className="flex-1 text-[13px] font-semibold">Vault</span>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5 [&::-webkit-scrollbar]:w-0">
        {items.length === 0 && (
          <div className="px-4 py-6 text-center text-[13px] text-text-dim">Vacío. Agrega secretos en Settings.</div>
        )}
        {GROUPS.map((g) => {
          const rows = items.filter((i) => i.type === g.type)
          if (rows.length === 0) return null
          return (
            <div key={g.type} className="mb-1">
              <div className="px-4 pt-2 pb-1 text-[11px] font-medium text-text-faint">{g.label}</div>
              {rows.map((it) => (
                <div key={it.id} className="flex items-center gap-2.5 px-3 mx-1.5 h-11 rounded-lg hover:bg-white/[0.05]">
                  <span className="w-8 h-8 rounded-lg grid place-items-center bg-white/[0.06] text-text-dim shrink-0 [&>svg]:w-[16px] [&>svg]:h-[16px]">
                    {g.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] text-text truncate leading-tight">{it.label}</div>
                    {subtext(it) && <div className="text-[12px] text-text-dim truncate">{subtext(it)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <button
        onClick={() => vaultwin.manage()}
        className="flex items-center gap-2 w-full h-11 shrink-0 px-4 border-t border-border text-[13px] text-text-dim hover:text-text hover:bg-white/[0.04] transition-colors [&>svg]:w-4 [&>svg]:h-4"
      >
        <IconSettings /> Gestionar en Settings
      </button>
    </div>
  )
}
