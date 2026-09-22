import type { WebContents } from 'electron'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Snapshot compacto: texto visible + elementos interactivos etiquetados con un "ref".
const SNAPSHOT_JS = `(() => {
  const MAX = 120;
  const sel = 'a[href], button, input, textarea, select, [role=button], [role=link], [role=tab], [role=menuitem], [onclick], [contenteditable=true]';
  const out = []; let ref = 0;
  for (const el of Array.from(document.querySelectorAll(sel))) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const visible = r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 &&
      r.top < innerHeight && r.left < innerWidth && cs.visibility !== 'hidden' && cs.display !== 'none';
    if (!visible) continue;
    el.setAttribute('data-titanio-ref', String(ref));
    const label = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.value ||
      el.innerText || el.getAttribute('title') || '').trim().replace(/\\s+/g,' ').slice(0, 90);
    out.push({ ref, tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '', label });
    ref++; if (out.length >= MAX) break;
  }
  return {
    url: location.href, title: document.title,
    scrollY: Math.round(scrollY), scrollMax: Math.round(document.body.scrollHeight - innerHeight),
    text: (document.body.innerText || '').replace(/\\n{3,}/g,'\\n\\n').slice(0, 6000),
    elements: out
  };
})()`

interface Snapshot {
  url: string; title: string; scrollY: number; scrollMax: number
  text: string; elements: { ref: number; tag: string; type: string; label: string }[]
}

export async function snapshot(wc: WebContents): Promise<string> {
  const s = (await wc.executeJavaScript(SNAPSHOT_JS, true)) as Snapshot
  const list = s.elements.map((e) => `[${e.ref}] <${e.tag}${e.type ? ' ' + e.type : ''}> ${e.label}`).join('\n')
  return `URL: ${s.url}\nTítulo: ${s.title}\nScroll: ${s.scrollY}/${s.scrollMax}\n\nTEXTO:\n${s.text}\n\nELEMENTOS:\n${list}`
}

async function centerOf(wc: WebContents, ref: number): Promise<{ x: number; y: number } | null> {
  return wc.executeJavaScript(`(() => {
    const el = document.querySelector('[data-titanio-ref="${ref}"]');
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
  })()`, true)
}

export async function click(wc: WebContents, ref: number): Promise<string> {
  const c = await centerOf(wc, ref)
  if (!c) return `ERROR: no existe el ref=${ref}. Haz read_page de nuevo.`
  await sleep(120)
  wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y })
  wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x: c.x, y: c.y, button: 'left', clickCount: 1 })
  await sleep(400)
  return `Click en ref=${ref}.`
}

export async function type(wc: WebContents, ref: number, text: string, submit?: boolean): Promise<string> {
  const c = await centerOf(wc, ref)
  if (!c) return `ERROR: no existe el ref=${ref}.`
  // Enfoca y limpia el campo, sea <input>/<textarea> (value) o un contenteditable (textContent).
  await wc.executeJavaScript(`(() => {
    const el = document.querySelector('[data-titanio-ref="${ref}"]');
    if (!el) return;
    el.focus();
    if ('value' in el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
    else if (el.isContentEditable) { el.textContent = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
  })()`, true)
  await sleep(60)
  wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x: c.x, y: c.y, button: 'left', clickCount: 1 })
  wc.insertText(text)
  await sleep(100)
  if (submit) {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
    wc.sendInputEvent({ type: 'char', keyCode: '\r' })
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
    await sleep(500)
  }
  return `Escrito "${text}" en ref=${ref}${submit ? ' + Enter' : ''}.`
}

export async function scroll(wc: WebContents, direction: 'up' | 'down'): Promise<string> {
  await wc.executeJavaScript(`window.scrollBy({ top: ${direction === 'up' ? -600 : 600}, behavior: 'instant' })`, true)
  await sleep(250)
  return `Scroll ${direction}.`
}

export async function navigate(wc: WebContents, url: string): Promise<string> {
  let u = String(url).trim()
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  await wc.loadURL(u)
  await sleep(500)
  return `Navegado a ${u}.`
}

/** Espera hasta que aparezca un texto en la página o un selector CSS, con timeout. */
export async function waitFor(
  wc: WebContents,
  opts: { text?: string; selector?: string; timeoutMs?: number }
): Promise<string> {
  const timeout = Math.min(opts.timeoutMs ?? 8000, 30000)
  const deadline = Date.now() + timeout
  const target = opts.text ? `texto "${opts.text}"` : `selector "${opts.selector}"`
  const check = `(() => {
    ${opts.selector ? `if (document.querySelector(${JSON.stringify(opts.selector)})) return true;` : ''}
    ${opts.text ? `if ((document.body.innerText || '').includes(${JSON.stringify(opts.text)})) return true;` : ''}
    return false;
  })()`
  while (Date.now() < deadline) {
    if (await wc.executeJavaScript(check, true)) return `Apareció ${target}.`
    await sleep(300)
  }
  return `ERROR: ${target} no apareció en ${timeout}ms. Prueba a hacer scroll y volver a leer.`
}

// Teclas soportadas → keyCode de Electron (sendInputEvent).
const KEY_MAP: Record<string, string> = {
  enter: 'Return', return: 'Return', escape: 'Escape', esc: 'Escape', tab: 'Tab',
  backspace: 'Backspace', delete: 'Delete', space: 'Space',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown'
}

/** Pulsa una tecla (Enter, Escape, Tab, flechas…), opcionalmente con modificadores (cmd/ctrl/shift/alt). */
export async function pressKey(wc: WebContents, key: string, modifiers?: string[]): Promise<string> {
  const code = KEY_MAP[key.trim().toLowerCase()]
  if (!code) return `ERROR: tecla desconocida "${key}". Soportadas: ${Object.keys(KEY_MAP).join(', ')}.`
  const mods = (modifiers ?? []).map((m) => m.toLowerCase()) as ('cmd' | 'ctrl' | 'shift' | 'alt')[]
  wc.sendInputEvent({ type: 'keyDown', keyCode: code, modifiers: mods })
  if (code === 'Return') wc.sendInputEvent({ type: 'char', keyCode: '\r' })
  wc.sendInputEvent({ type: 'keyUp', keyCode: code, modifiers: mods })
  await sleep(300)
  return `Tecla ${modifiers?.length ? modifiers.join('+') + '+' : ''}${key}.`
}

/** Mueve el mouse sobre un elemento (para revelar menús/tooltips en hover). */
export async function hover(wc: WebContents, ref: number): Promise<string> {
  const c = await centerOf(wc, ref)
  if (!c) return `ERROR: no existe el ref=${ref}. Haz read_page de nuevo.`
  await wc.executeJavaScript(`(() => {
    const el = document.querySelector('[data-titanio-ref="${ref}"]');
    if (el) el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  })()`, true)
  wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y })
  await sleep(300)
  return `Hover sobre ref=${ref}.`
}

/** Elige una opción de un <select> por valor o por texto visible. */
export async function selectOption(wc: WebContents, ref: number, value: string): Promise<string> {
  const res = (await wc.executeJavaScript(`(() => {
    const el = document.querySelector('[data-titanio-ref="${ref}"]');
    if (!el || el.tagName !== 'SELECT') return 'noselect';
    const v = ${JSON.stringify(value)};
    for (const o of Array.from(el.options)) {
      if (o.value === v || o.text.trim() === v) {
        el.value = o.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'ok';
      }
    }
    return 'notfound';
  })()`, true)) as string
  if (res === 'noselect') return `ERROR: ref=${ref} no es un <select>.`
  if (res === 'notfound') return `ERROR: ninguna opción coincide con "${value}" en ref=${ref}.`
  await sleep(200)
  return `Seleccionado "${value}" en ref=${ref}.`
}

/** Resultado con imagen para el modelo (visión). */
export interface MediaResult {
  text: string
  data: string // base64
  mediaType: string
}

/** Captura la pantalla de la página activa, redimensionada al tamaño lógico del viewport (px CSS). */
export async function screenshot(wc: WebContents): Promise<MediaResult> {
  const vp = (await wc.executeJavaScript('({ w: innerWidth, h: innerHeight })', true)) as { w: number; h: number }
  const img = await wc.capturePage()
  // Redimensiona a px CSS para que las coordenadas que estime el modelo coincidan con click_at.
  const resized = img.resize({ width: vp.w, height: vp.h })
  return {
    text: `Captura del viewport (${vp.w}×${vp.h} px). Usa click_at con coordenadas dentro de ese rango.`,
    data: resized.toPNG().toString('base64'),
    mediaType: 'image/png'
  }
}

/** Click en coordenadas absolutas del viewport (px CSS), para cuando no hay un ref utilizable. */
export async function clickAt(wc: WebContents, x: number, y: number): Promise<string> {
  const px = Math.round(x)
  const py = Math.round(y)
  await sleep(80)
  wc.sendInputEvent({ type: 'mouseMove', x: px, y: py })
  wc.sendInputEvent({ type: 'mouseDown', x: px, y: py, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x: px, y: py, button: 'left', clickCount: 1 })
  await sleep(400)
  return `Click en (${px}, ${py}).`
}

/** Navegación de historial de la pestaña. */
export async function history(wc: WebContents, action: 'back' | 'forward' | 'reload'): Promise<string> {
  const nav = wc.navigationHistory
  if (action === 'back') {
    if (!nav.canGoBack()) return 'ERROR: no hay página anterior.'
    nav.goBack()
  } else if (action === 'forward') {
    if (!nav.canGoForward()) return 'ERROR: no hay página siguiente.'
    nav.goForward()
  } else {
    wc.reload()
  }
  await sleep(500)
  return `Historial: ${action}.`
}
