import { ipcRenderer } from 'electron'

/**
 * Captura credenciales al enviar un login para ofrecer guardarlas en el Vault.
 * Corre en el mundo aislado del preload: lee los campos del propio formulario y los
 * manda al main (que pregunta y cifra). El agente/LLM NUNCA recibe esto.
 */
export function setupPasswordCapture(): void {
  let sentKey = ''

  const readFields = (): { username: string; password: string } | null => {
    const pw = Array.from(document.querySelectorAll<HTMLInputElement>('input[type=password]')).find((el) => el.value)
    if (!pw || !pw.value) return null
    const scope: ParentNode = pw.closest('form') || document
    const cands = Array.from(
      scope.querySelectorAll<HTMLInputElement>(
        'input[autocomplete=username], input[type=email], input[type=text], input[name*=user i], input[name*=email i]'
      )
    ).filter((el) => el.value)
    return { username: cands[cands.length - 1]?.value || '', password: pw.value }
  }

  const send = (): void => {
    const f = readFields()
    if (!f) return
    const key = f.username + '|' + f.password
    if (key === sentKey) return // evita duplicados del mismo submit
    sentKey = key
    ipcRenderer.send('vault:capture', f)
  }

  document.addEventListener('submit', send, true)
  window.addEventListener('pagehide', send, true)
  // SPA sin submit real: al hacer click en un botón de login, lee tras un tick.
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null
    if (t && t.closest('button, [type=submit], [role=button]')) setTimeout(send, 80)
  }, true)
}
