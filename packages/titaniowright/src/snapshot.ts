import type { Transport } from './transport'

/** Un elemento interactivo del snapshot, etiquetado con un `ref` estable. */
export interface SnapshotNode {
  ref: number
  role: string
  name: string
  /** Estado compacto: p. ej. 'focused', 'checked', 'disabled', 'value=…'. */
  state?: string
  /** id del iframe contenedor, si el elemento vive dentro de uno. */
  frame?: string
}

export interface Snapshot {
  url: string
  title: string
  scrollY: number
  scrollMax: number
  /** Texto visible (recortado) para dar contexto de la página. */
  text: string
  nodes: SnapshotNode[]
}

/** Atributo que marcamos en cada elemento para resolver un `ref` después. */
export const REF_ATTR = 'data-mw-ref'

/**
 * Script inyectado que produce un árbol de accesibilidad podado en lugar del DOM
 * crudo: sólo elementos accionables, con role/name derivados de accesibilidad,
 * señales de foco/estado/iframe, y sin nodos intermedios. Objetivo: máxima señal
 * por token (la técnica clave de Aside para snapshots ~70% más pequeños).
 */
const SNAPSHOT_JS = (maxNodes: number, maxText: number): string => `(() => {
  const MAX = ${maxNodes};
  const SEL = 'a[href],button,input,textarea,select,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[role=switch],[role=option],[role=textbox],[onclick],[contenteditable=true],[tabindex]:not([tabindex="-1"])';
  const roleOf = (el) => {
    const r = el.getAttribute('role');
    if (r) return r;
    const t = el.tagName.toLowerCase();
    if (t === 'a') return 'link';
    if (t === 'button' || t === 'summary') return 'button';
    if (t === 'select') return 'combobox';
    if (t === 'textarea') return 'textbox';
    if (t === 'input') {
      const ty = (el.getAttribute('type') || 'text').toLowerCase();
      if (ty === 'checkbox') return 'checkbox';
      if (ty === 'radio') return 'radio';
      if (ty === 'submit' || ty === 'button') return 'button';
      return 'textbox';
    }
    return t;
  };
  const nameOf = (el) => {
    let n = el.getAttribute('aria-label') || '';
    if (!n) {
      const lb = el.getAttribute('aria-labelledby');
      if (lb) { const t = document.getElementById(lb); if (t) n = t.innerText || ''; }
    }
    if (!n) n = el.getAttribute('placeholder') || el.getAttribute('title') || '';
    if (!n && el.tagName === 'INPUT' && el.labels && el.labels[0]) n = el.labels[0].innerText || '';
    if (!n) n = (el.innerText || el.value || el.getAttribute('alt') || '').trim();
    return n.replace(/\\s+/g, ' ').trim().slice(0, 100);
  };
  const nodes = []; let ref = 0;
  for (const el of Array.from(document.querySelectorAll(SEL))) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const inView = r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 &&
      r.top < innerHeight && r.left < innerWidth && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    if (!inView) continue;
    el.setAttribute('${REF_ATTR}', String(ref));
    const states = [];
    if (document.activeElement === el) states.push('focused');
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') states.push('disabled');
    if (el.checked || el.getAttribute('aria-checked') === 'true') states.push('checked');
    if (el.getAttribute('aria-expanded')) states.push('expanded=' + el.getAttribute('aria-expanded'));
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.value) states.push('value=' + String(el.value).slice(0, 40));
    nodes.push({ ref, role: roleOf(el), name: nameOf(el), state: states.join(' ') || undefined });
    ref++;
    if (nodes.length >= MAX) break;
  }
  return {
    url: location.href,
    title: document.title,
    scrollY: Math.round(scrollY),
    scrollMax: Math.round(document.body.scrollHeight - innerHeight),
    text: (document.body.innerText || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, ${maxText}),
    nodes
  };
})()`

export interface SnapshotOptions {
  maxNodes?: number
  maxText?: number
}

export async function takeSnapshot(t: Transport, opts: SnapshotOptions = {}): Promise<Snapshot> {
  return t.eval<Snapshot>(SNAPSHOT_JS(opts.maxNodes ?? 150, opts.maxText ?? 6000))
}

/** Renderiza el snapshot a un texto compacto y determinista para el modelo. */
export function formatSnapshot(s: Snapshot): string {
  const list = s.nodes
    .map((n) => `[${n.ref}] ${n.role} "${n.name}"${n.state ? ` (${n.state})` : ''}`)
    .join('\n')
  return [
    `URL: ${s.url}`,
    `Title: ${s.title}`,
    `Scroll: ${s.scrollY}/${s.scrollMax}`,
    '',
    'TEXT:',
    s.text,
    '',
    'ELEMENTS:',
    list
  ].join('\n')
}
