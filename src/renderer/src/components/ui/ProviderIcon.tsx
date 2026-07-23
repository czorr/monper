import type { JSX } from 'react'
import type { ProviderKind } from '@shared/types'
import IconClaude from '~icons/simple-icons/claude'
import IconOpenAI from '~icons/simple-icons/openai'

/** Logo de marca del provider según su kind (Claude para anthropic, OpenAI para el resto). */
export default function ProviderIcon({ kind, className }: { kind: ProviderKind; className?: string }): JSX.Element {
  const Icon = kind === 'anthropic' ? IconClaude : IconOpenAI
  return <Icon className={className} />
}
