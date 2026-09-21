import { ipcRenderer } from 'electron'
import type { QuickAction } from '../shared/types'

// SVGs (tabler-style) para los iconos soportados, inyectados en el menú.
const ICONS: Record<string, string> = {
  list: '<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><line x1="5" y1="6" x2="5" y2="6.01"/><line x1="5" y1="12" x2="5" y2="12.01"/><line x1="5" y1="18" x2="5" y2="18.01"/>',
  language: '<path d="M4 5h7"/><path d="M9 3v2c0 4.418 -2.239 8 -5 8"/><path d="M5 9c0 2.144 2.952 3.908 6.7 4"/><path d="M12 20l4 -9l4 9"/><path d="M19.1 18h-6.2"/>',
  sparkles: '<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z"/>',
  wand: '<path d="M6 21l15 -15l-3 -3l-15 15l3 3"/><path d="M15 6l3 3"/>',
  message: '<path d="M8 9h8"/><path d="M8 13h6"/><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z"/>',
  pencil: '<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><line x1="13.5" y1="6.5" x2="17.5" y2="10.5"/>',
  bulb: '<path d="M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3"/><line x1="9.7" y1="17" x2="14.3" y2="17"/>',
  world: '<circle cx="12" cy="12" r="9"/><line x1="3.6" y1="9" x2="20.4" y2="9"/><line x1="3.6" y1="15" x2="20.4" y2="15"/><path d="M11.5 3a17 17 0 0 0 0 18"/><path d="M12.5 3a17 17 0 0 1 0 18"/>',
  quote: '<path d="M10 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5"/><path d="M19 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5"/>',
  code: '<polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/><line x1="14" y1="4" x2="10" y2="20"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>',
  search: '<circle cx="10" cy="10" r="7"/><line x1="21" y1="21" x2="15" y2="15"/>',
  send: '<path d="M10 14l11 -11"/><path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5"/>'
}
function svg(name: string, size = 16): string {
  const inner = ICONS[name] || ICONS.sparkles
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}
function setHTML(el: { innerHTML: string }, html: string): void { try { el.innerHTML = html } catch { /* Trusted Types: sin icono */ } }

export function setupSelectionUI(): void {
  let host: HTMLDivElement | null = null
  let root: ShadowRoot | null = null
  let selection = ''
  let menuOpen = false

  const ensureHost = (): ShadowRoot => {
    if (root) return root
    host = document.createElement('div')
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;'
    root = host.attachShadow({ mode: 'open' })
    ;(document.body || document.documentElement).appendChild(host)
    return root
  }

  const hide = (): void => {
    menuOpen = false
    if (root) setHTML(root, '')
  }

  const run = (id: string): void => { ipcRenderer.send('quickaction:run', id, selection); hide() }
  const runFree = (text: string): void => { if (text.trim()) { ipcRenderer.send('quickaction:runFree', text, selection); hide() } }

  const box = (x: number, y: number): HTMLDivElement => {
    const d = document.createElement('div')
    d.style.cssText = `position:fixed;left:${x}px;top:${y}px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif;`
    return d
  }

  // El icono trigger, en la esquina de la selección.
  const showTrigger = (x: number, y: number): void => {
    const r = ensureHost()
    setHTML(r, '')
    const wrap = box(x, y)
    const btn = document.createElement('button')
    btn.style.cssText = 'all:unset;box-sizing:border-box;display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:#1c1c20;color:#ececee;border:1px solid rgba(255,255,255,.12);box-shadow:0 4px 14px rgba(0,0,0,.4);cursor:pointer;'
    setHTML(btn, svg('sparkles', 16))
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openMenu(x, y) })
    wrap.appendChild(btn)
    r.appendChild(wrap)
  }

  const openMenu = async (x: number, y: number): Promise<void> => {
    let actions: QuickAction[] = []
    // Sin acciones el menú sale solo con "Preguntar a Titanio", que sigue sirviendo.
    try { actions = await ipcRenderer.invoke('quickactions:list') } catch (e) {
      console.error('[quickactions] no se pudieron cargar:', e)
    }
    const r = ensureHost()
    setHTML(r, '')
    menuOpen = true
    // Clamp para que no se salga por la derecha.
    const left = Math.min(x, window.innerWidth - 300)
    const panel = box(Math.max(8, left), y + 4)
    const menu = document.createElement('div')
    menu.style.cssText = 'width:284px;padding:6px;border-radius:14px;background:#1c1c20;border:1px solid rgba(255,255,255,.1);box-shadow:0 12px 40px rgba(0,0,0,.5);color:#ececee;'
    menu.addEventListener('mousedown', (e) => e.stopPropagation())

    for (const a of actions) {
      const item = document.createElement('button')
      item.style.cssText = "all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border-radius:9px;font-size:14px;cursor:pointer;color:#ececee;"
      const ic = document.createElement('span')
      ic.style.cssText = 'display:grid;place-items:center;width:18px;height:18px;color:rgba(235,235,245,.7);'
      setHTML(ic, svg(a.icon, 18))
      const label = document.createElement('span')
      label.textContent = a.name
      item.appendChild(ic); item.appendChild(label)
      item.addEventListener('mouseenter', () => (item.style.background = 'rgba(255,255,255,.06)'))
      item.addEventListener('mouseleave', () => (item.style.background = 'transparent'))
      item.addEventListener('click', () => run(a.id))
      menu.appendChild(item)
    }

    const div = document.createElement('div')
    div.style.cssText = 'height:1px;background:rgba(255,255,255,.08);margin:6px 4px;'
    menu.appendChild(div)

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px 6px;'
    const input = document.createElement('input')
    input.placeholder = 'What would you like to do?'
    input.style.cssText = 'all:unset;flex:1;font-size:14px;color:#ececee;'
    const send = document.createElement('button')
    send.style.cssText = 'all:unset;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.9);color:#000;cursor:pointer;'
    setHTML(send, svg('send', 15))
    send.addEventListener('click', () => runFree(input.value))
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runFree(input.value) } else if (e.key === 'Escape') hide() })
    row.appendChild(input); row.appendChild(send)
    menu.appendChild(row)

    panel.appendChild(menu)
    r.appendChild(panel)
    setTimeout(() => input.focus(), 0)
  }

  const onSelect = (): void => {
    const sel = window.getSelection()
    const text = sel?.toString().trim() || ''
    if (!sel || sel.isCollapsed || text.length < 1) { if (!menuOpen) hide(); return }
    selection = text
    let rect: DOMRect
    try { rect = sel.getRangeAt(0).getBoundingClientRect() } catch { return }
    if (!rect || (rect.width === 0 && rect.height === 0)) return
    showTrigger(Math.min(rect.right + 4, window.innerWidth - 34), rect.bottom + 6)
  }

  document.addEventListener('mouseup', () => setTimeout(onSelect, 0), true)
  document.addEventListener('keyup', (e) => { if (e.shiftKey || e.key.startsWith('Arrow')) setTimeout(onSelect, 0) }, true)
  document.addEventListener('mousedown', (e) => { if (host && !e.composedPath().includes(host)) hide() }, true)
  document.addEventListener('scroll', () => hide(), true)
  window.addEventListener('resize', () => hide())
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide() }, true)
}
