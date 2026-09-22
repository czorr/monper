import { parse, modify, applyEdits, type ParseError } from 'jsonc-parser'
import { z } from 'zod'

const modelSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional()
}).passthrough()

export const connectionSchema = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(['anthropic', 'openai']),
  options: z.object({
    baseURL: z.string().url().refine((value) => {
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
    }, 'Usa una URL HTTP o HTTPS sin credenciales.').optional(),
    apiKey: z.string().regex(/^\{(?:env:[A-Za-z_][A-Za-z0-9_]*|vault:[a-zA-Z0-9_-]+)\}$/, 'Usa {env:NOMBRE} o una referencia del vault.').optional()
  }).passthrough().default({}),
  models: z.record(z.string().min(1), modelSchema).optional()
}).passthrough()

const schema = z.object({ provider: z.record(z.string().min(1), connectionSchema).default({}) }).passthrough()
export type Connection = z.infer<typeof connectionSchema>
export type ProviderDocument = z.infer<typeof schema>

export function parseConfig(text: string): ProviderDocument {
  const errors: ParseError[] = []
  const value: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length) {
    const line = text.slice(0, errors[0].offset).split('\n').length
    throw new Error(`titanio.jsonc: JSONC inválido en la línea ${line}.`)
  }
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    // Los errores no incluyen valores: el archivo puede contener una clave pegada por error.
    throw new Error(`titanio.jsonc: revisa ${issue.path.join('.') || 'el documento'} (${issue.code}).`)
  }
  return result.data
}

export function editConfig(text: string, path: string[], value: unknown): string {
  return applyEdits(text, modify(text, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } }))
}
