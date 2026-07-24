import type { WebContents } from 'electron'
import type { Page } from '../../../../packages/monperwright/src'
import { withFallback } from './shared'
import { makePasswordManager } from './password-manager'
import { makeGoogleSearch } from './google-search'
import { makeImageSearch } from './image-search'
import { makeCua } from './cua'
import { makeYoutube } from './youtube'
import { makeTwitter } from './twitter'
import { makeGmail } from './gmail'
import { makeNotion, blockToMarkdown } from './notion'
import { makeSlack } from './slack'
import { makeGoogleAccounts } from './google-accounts'
import { makeGoogleDocs } from './google-docs'
import { makeGoogleSheets } from './google-sheets'

/**
 * Globals del REPL que usan las skills (portadas de Aside): googleSearch, cua, youtube, …
 * Los implementados viven en un archivo por servicio; el resto son stubs que guían al
 * agente a operar el servicio con `page` (monperwright).
 *
 * Para portar un servicio nuevo: crea `./<servicio>.ts` con su `make…(page)` y añádelo aquí
 * envuelto en `withFallback(...)` (para que los métodos aún no implementados guíen a `page`).
 */
export function buildGlobals(page: Page, wc: WebContents): Record<string, unknown> {
  return {
    googleSearch: makeGoogleSearch(page),
    imageSearch: makeImageSearch(page),
    cua: makeCua(page),
    youtube: withFallback(makeYoutube(page), 'youtube', 'YouTube', 'https://www.youtube.com'),
    twitter: withFallback(makeTwitter(page), 'twitter', 'X (Twitter)', 'https://x.com'),
    gmail: withFallback(makeGmail(page), 'gmail', 'Gmail', 'https://mail.google.com'),
    notion: withFallback(makeNotion(page), 'notion', 'Notion', 'https://www.notion.so'),
    // Helper global que usa la skill de Notion para convertir un bloque a markdown.
    blockToMarkdown,
    markdownToNotion: () => { throw new Error('markdownToNotion: escritura en Notion no portada. Edita en notion.so con page.') },
    slack: withFallback(makeSlack(page), 'slack', 'Slack', 'https://app.slack.com'),
    googleAccounts: makeGoogleAccounts(page),
    googleDocs: withFallback(makeGoogleDocs(page), 'googleDocs', 'Google Docs', 'https://docs.google.com'),
    googleSheets: withFallback(makeGoogleSheets(page), 'googleSheets', 'Google Sheets', 'https://docs.google.com'),
    // Vault interno de Monper: rellena credenciales sin exponer el secreto al agente.
    passwordManager: withFallback(makePasswordManager(page, wc), 'passwordManager', 'el gestor de contraseñas', '')
  }
}
