import { t as tr, subscribeLocale } from '../shared/i18n'
import { ipcRenderer } from 'electron'

/**
 * Inyecta un botón "Install to Titanio" en la página de la Chrome Web Store.
 * La Store deshabilita "Add to Chrome" fuera de Chrome, así que sin esto no hay
 * forma de instalar desde la propia página (como hacen Edge, Brave o Arc).
 */
export function setupStoreInstall(): void {
  if (!/(^|\.)chromewebstore\.google\.com$|(^|\.)chrome\.google\.com$/.test(location.hostname)) return
  console.log('[titanio] Chrome Web Store detectada, esperando el botón de instalar…')

  const BTN_ID = 'titanio-install-btn'
  let installing = false
  let installed = false

  const isDetailPage = (): boolean => /\/detail\//.test(location.pathname)

  const setLabel = (text: string, disabled: boolean): void => {
    const b = document.getElementById(BTN_ID) as HTMLButtonElement | null
    if (!b) return
    b.textContent = text
    b.disabled = disabled
    b.style.opacity = disabled ? '0.6' : '1'
    b.style.cursor = disabled ? 'default' : 'pointer'
  }

  const make = (): HTMLButtonElement => {
    const b = document.createElement('button')
    b.id = BTN_ID
    b.type = 'button'
    b.textContent = tr("Install to Titanio")
    b.style.cssText = [
      'appearance:none', 'border:none', 'cursor:pointer',
      'background:#1a73e8', 'color:#fff',
      'font:500 14px/1 "Google Sans",Roboto,-apple-system,sans-serif',
      'padding:12px 22px', 'border-radius:100px', 'margin-left:8px',
      'box-shadow:0 1px 2px rgba(0,0,0,.2)', 'white-space:nowrap'
    ].join(';')
    b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation()
      if (installing) return
      installing = true
      installed = false
      setLabel(tr("Instalando…"), true)
      ipcRenderer.send('extensions:installFromStore')
    })
    return b
  }

  /** El botón nativo de la Store ("Add to Chrome"), para anclarnos junto a él. */
  const findStoreButton = (): HTMLElement | null => {
    const re = /(add to chrome|añadir a chrome|agregar a chrome|remove from chrome|quitar de chrome)/i
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, [role=button]'))) {
      if (re.test(el.textContent || '')) return el
    }
    return null
  }

  const mount = (): void => {
    if (!isDetailPage()) { document.getElementById(BTN_ID)?.remove(); return }
    if (document.getElementById(BTN_ID)) return
    const anchor = findStoreButton()
    if (!anchor?.parentElement) return
    // Junto al botón deshabilitado de la Store, dentro de su mismo contenedor.
    anchor.parentElement.insertBefore(make(), anchor.nextSibling)
    console.log('[titanio] botón "Install to Titanio" añadido')
  }

  ipcRenderer.on('extensions:installResult', (_e, r: { ok: boolean; error?: string; name?: string }) => {
    installing = false
    if (r.ok) {
      installed = true
      setLabel(tr("Instalada ✓"), true)
    } else {
      setLabel(tr("Install to Titanio"), false)
      if (r.error) console.warn('[titanio] no se pudo instalar:', r.error)
    }
  })
  subscribeLocale(() => {
    setLabel(installed ? tr('Instalada ✓') : installing ? tr('Instalando…') : tr('Install to Titanio'), installed || installing)
  })

  // La Store es una SPA: el botón aparece tarde y cambia al navegar entre extensiones.
  const observer = new MutationObserver(() => mount())
  const start = (): void => {
    mount()
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
}
