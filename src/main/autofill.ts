import type { WebContents } from 'electron'
import * as vault from './vault/store'

/**
 * Inyecta credenciales en la página desde el proceso main.
 * El secreto se lee del vault cifrado aquí y se escribe directo en el input:
 * NUNCA viaja al renderer del chrome ni al contexto del agente.
 */
export async function injectFill(wc: WebContents, username: string, secret: string): Promise<string[]> {
  const js = `(() => {
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
  if (!item) return []
  const secret = vault.getSecret(itemId)
  if (secret == null) return []
  return injectFill(wc, item.data.username || '', secret)
}

/** Credenciales guardadas que aplican a un origen (metadata, sin secretos). */
export function credentialsFor(origin: string): { id: string; label: string; username: string; origin: string }[] {
  const host = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }
  const h = host(origin)
  return vault
    .list()
    .filter((i) => i.type === 'web-credential' && !!i.data.origin && host(i.data.origin) === h)
    .map((i) => ({ id: i.id, label: i.label, username: i.data.username || '', origin: i.data.origin || '' }))
}
