import type { WebContents } from 'electron'
import { dialog, BrowserWindow } from 'electron'
import type { Page } from '../../../../packages/monperwright/src'
import type { VaultItemMeta } from '../../../shared/vault'
import * as vault from '../../vault/store'

// ---- La joya: rellenar credenciales SIN que el agente vea la contraseña ----
// El REPL (agente) solo llama passwordManager.fill(...). Esta función corre en el MAIN:
// lee el secreto del vault cifrado y lo INYECTA en la página (como si el usuario lo tecleara).
// El secreto se queda dentro de esta closure — nunca se devuelve al agente ni se registra.

function originOf(url: string): string { try { return new URL(url).origin } catch { return '' } }
function hostOf(url: string): string { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

// Inyecta usuario (no secreto) + contraseña (secreto) en los campos detectados.
async function injectFill(wc: WebContents, username: string, secret: string): Promise<string[]> {
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
      const cands = Array.from(document.querySelectorAll('input[autocomplete=username], input[type=email], input[name*=user i], input[name*=email i], input[id*=user i], input[id*=email i], input[type=text]')).filter(vis);
      if (cands[0]) { set(cands[0], userVal); filled.push('username'); }
    }
    return filled;
  })()`
  return wc.executeJavaScript(js, true) as Promise<string[]>
}

export function makePasswordManager(page: Page, wc: WebContents) {
  const creds = (): VaultItemMeta[] => vault.itemsByType('web-credential')
  const meta = (i: VaultItemMeta) => ({ id: i.id, label: i.label, origin: i.data.origin || '', username: i.data.username || '' })

  const resolve = async (arg: unknown): Promise<VaultItemMeta | undefined> => {
    if (typeof arg === 'string') return vault.get(arg)
    const a = (arg ?? {}) as { id?: string; origin?: string }
    if (a.id) return vault.get(a.id)
    const origin = a.origin || originOf(await page.url())
    return vault.findCredential(origin) || creds().find((i) => hostOf(i.data.origin || '') === hostOf(origin))
  }

  // Gate de aprobación del usuario (el "password manager" pide permiso, no el agente).
  const approve = (origin: string): boolean => {
    const opts = {
      type: 'question' as const,
      message: `¿Rellenar tu contraseña guardada para ${hostOf(origin)}?`,
      detail: 'Monper rellenará las credenciales directamente; el agente no las ve.',
      buttons: ['Cancelar', 'Rellenar'],
      defaultId: 1,
      cancelId: 0,
      noLink: true
    }
    const w = BrowserWindow.getFocusedWindow()
    return (w ? dialog.showMessageBoxSync(w, opts) : dialog.showMessageBoxSync(opts)) === 1
  }

  const findForOrigin = async (origin?: string) => {
    const o = origin || originOf(await page.url())
    return creds().filter((i) => hostOf(i.data.origin || '') === hostOf(o)).map(meta)
  }

  const fill = async (arg?: unknown) => {
    const item = await resolve(arg)
    if (!item) return { ok: false, error: 'No hay credencial guardada para este sitio. Pídele al usuario que la agregue en el Vault.' }
    const secret = vault.getSecret(item.id)
    if (secret == null) return { ok: false, error: 'No se pudo leer el secreto del vault (¿cifrado no disponible?).' }
    if (!approve(item.data.origin || (await page.url()))) return { ok: false, cancelled: true }
    const filled = await injectFill(wc, item.data.username || '', secret)
    // Nota: el secreto NO se devuelve ni se loguea. Solo qué campos se rellenaron.
    return { ok: filled.length > 0, filled }
  }

  const fillAndSubmit = async (arg?: unknown) => {
    const r = await fill(arg)
    if (!r.ok) return r
    const submitted = await wc.executeJavaScript(
      `(() => { const pw = Array.from(document.querySelectorAll('input[type=password]')).find((e) => e.offsetParent); if (!pw) return false; const f = pw.closest('form'); if (f && f.requestSubmit) { f.requestSubmit(); return true; } pw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true })); return true; })()`,
      true
    )
    return { ...r, submitted }
  }

  return {
    /** Metadata de credenciales guardadas (SIN secretos). */
    list: () => creds().map(meta),
    findForOrigin,
    hasCredentialForCurrentSite: async () => (await findForOrigin()).length > 0,
    /** Rellena la credencial en la página (el agente nunca ve la contraseña). */
    fill,
    fillAndSubmit,
    // Compat con las skills de gestores externos:
    listItems: () => creds().map(meta),
    listVaults: () => [{ id: 'monper', name: 'Monper Vault' }],
    unlockExternalPasswordManager: () => ({ ok: true, note: 'Monper usa su vault interno cifrado (safeStorage).' })
  }
}
