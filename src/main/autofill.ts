import type { WebContents } from 'electron'
import * as vault from './vault/store'
import { faviconFor } from './favicons'
import { sameCredentialSite } from '../shared/vault'

/**
 * Inyecta credenciales en la página desde el proceso main.
 * El secreto se lee del vault cifrado aquí y se escribe directo en el input:
 * NUNCA viaja al renderer del chrome ni al contexto del agente.
 */
export async function injectFill(wc: WebContents, username: string, secret: string): Promise<string[]> {
  const origin = new URL(wc.getURL()).origin
  const js = `(() => {
    if (location.origin !== ${JSON.stringify(origin)}) return [];
    const set = (el, val) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const filled = [];
    const pw = Array.from(document.querySelectorAll('input[type=password]')).find(vis);
    if (pw) { set(pw, ${JSON.stringify(secret)}); filled.push('password'); }
    const userVal = ${JSON.stringify(username)};
    if (userVal) {
      const scope = pw && pw.closest('form') ? pw.closest('form') : document;
      const cands = Array.from(scope.querySelectorAll('input[autocomplete=username], input[type=email], input[name*=user i], input[name*=email i], input[id*=user i], input[id*=email i], input[type=text]')).filter(vis);
      if (cands[0]) { set(cands[0], userVal); filled.push('username'); }
    }
    return filled;
  })()`
  return wc.executeJavaScript(js, true) as Promise<string[]>
}

/** Rellena por id de ítem del vault. Devuelve qué campos se llenaron (nunca el secreto). */
export async function fillFromVault(wc: WebContents, itemId: string): Promise<string[]> {
  const item = vault.get(itemId)
  if (!item || item.type !== 'web-credential' || !sameCredentialSite(item.data.origin || '', wc.getURL())) return []
  const secret = vault.getSecret(itemId)
  if (secret == null) return []
  return injectFill(wc, item.data.username || '', secret)
}

/** Credenciales guardadas que aplican a un origen (metadata, sin secretos). */
export function credentialsFor(origin: string): { id: string; label: string; username: string; origin: string; favicon: string | null }[] {
  return vault
    .credentialsForSite(origin)
    // El favicon sale de lo que ya vimos al visitar el sitio: pedírselo a Google delataría
    // en qué páginas guarda contraseñas el usuario.
    .map((i) => ({
      id: i.id,
      label: i.label,
      username: i.data.username || '',
      origin: i.data.origin || '',
      favicon: faviconFor(i.data.origin || '')
    }))
}
