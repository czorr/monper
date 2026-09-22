import type { JSX } from 'react'
import type { AIProvider } from '@shared/types'
import IconClaude from '~icons/simple-icons/claude'
import IconOpenAI from '~icons/simple-icons/openai'
import IconAzure from '~icons/simple-icons/microsoftazure'
import IconOpenRouter from '~icons/simple-icons/openrouter'
import IconVllm from '~icons/simple-icons/vllm'
import IconOllama from '~icons/simple-icons/ollama'
import IconGemini from '~icons/simple-icons/googlegemini'
import IconServer from '~icons/tabler/server'

function iconFor(provider: Partial<AIProvider>) {
  let hostname = ''
  if (provider.baseUrl) {
    try { hostname = new URL(provider.baseUrl).hostname.toLowerCase() }
    catch { return IconServer /* Un endpoint inválido no se presenta como una API oficial. */ }
  }
  const domain = (value: string): boolean => hostname === value || hostname.endsWith(`.${value}`)
  // El alojamiento tiene prioridad sobre el protocolo: Claude en Azure sigue siendo Azure.
  if (domain('azure.com') || domain('azure.cn') || domain('azure.us') || domain('services.ai.azure.com')) return IconAzure
  if (domain('openrouter.ai')) return IconOpenRouter
  if (domain('openai.com')) return IconOpenAI
  if (domain('anthropic.com')) return IconClaude
  if (domain('generativelanguage.googleapis.com')) return IconGemini
  if (domain('ollama.com')) return IconOllama

  // Los servidores propios no tienen un dominio fijo; usamos su identidad declarada.
  const identity = `${provider.id || ''} ${provider.label || ''}`.toLowerCase()
  if (/\bazure\b/.test(identity)) return IconAzure
  if (/\bopenrouter\b/.test(identity)) return IconOpenRouter
  if (/\bvllm\b/.test(identity)) return IconVllm
  if (/\bollama\b/.test(identity)) return IconOllama
  if (/\b(gemini|google)\b/.test(identity)) return IconGemini
  if (provider.baseUrl) return IconServer
  if (provider.kind === 'anthropic') return IconClaude
  if (provider.kind === 'openai') return IconOpenAI
  return IconServer
}

/** La marca pertenece a la conexión, no al protocolo compatible que utiliza. */
export default function ProviderIcon({ provider = {}, className }: { provider?: Partial<AIProvider>; className?: string }): JSX.Element {
  const Icon = iconFor(provider)
  return <Icon aria-hidden="true" className={className ?? 'w-5 h-5'} />
}
