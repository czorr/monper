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
    el.setAttribute('data-monper-ref', String(ref));
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
    const el = document.querySelector('[data-monper-ref="${ref}"]');
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
  await wc.executeJavaScript(`(() => { const el = document.querySelector('[data-monper-ref="${ref}"]'); if (el){ el.focus(); if ('value' in el) el.value=''; } })()`, true)
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
