import type { Transport, MouseOptions, Screenshot } from './transport'
import { Locator, type ClickOptions, type WaitOptions } from './locator'
import { toKeyCode, isPrintable, toModifiers, parseCombo } from './keys'
import { takeSnapshot, formatSnapshot, REF_ATTR, type Snapshot, type SnapshotOptions } from './snapshot'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Teclado de la página (page.keyboard.*), forma Playwright. */
class Keyboard {
  constructor(private readonly t: Transport) {}

  async down(key: string, mods: string[] = []): Promise<void> {
    await this.t.key('keyDown', toKeyCode(key), { modifiers: mods })
  }
  async up(key: string, mods: string[] = []): Promise<void> {
    await this.t.key('keyUp', toKeyCode(key), { modifiers: mods })
  }
  async insertText(text: string): Promise<void> {
    for (const ch of text) await this.t.key('char', ch)
  }
  async type(text: string, opts: { delay?: number } = {}): Promise<void> {
    for (const ch of text) {
      await this.t.key('char', ch)
      if (opts.delay) await sleep(opts.delay)
    }
  }
  /** Acepta combinaciones: 'Enter', 'Control+A', 'Shift+Tab'. */
  async press(combo: string, opts: { delay?: number } = {}): Promise<void> {
    const { modifiers, key } = parseCombo(combo)
    const code = toKeyCode(key)
    await this.t.key('keyDown', code, { modifiers })
    if (isPrintable(key) && modifiers.length === 0) await this.t.key('char', key)
    if (opts.delay) await sleep(opts.delay)
    await this.t.key('keyUp', code, { modifiers })
  }
}

/** Mouse de la página (page.mouse.*), forma Playwright. */
class Mouse {
  private x = 0
  private y = 0
  constructor(private readonly t: Transport) {}

  async move(x: number, y: number): Promise<void> {
    this.x = x
    this.y = y
    await this.t.mouse('mouseMove', x, y)
  }
  async down(opts: MouseOptions = {}): Promise<void> {
    await this.t.mouse('mouseDown', this.x, this.y, { clickCount: 1, button: 'left', ...opts })
  }
  async up(opts: MouseOptions = {}): Promise<void> {
    await this.t.mouse('mouseUp', this.x, this.y, { clickCount: 1, button: 'left', ...opts })
  }
  async click(x: number, y: number, opts: MouseOptions = {}): Promise<void> {
    await this.move(x, y)
    await this.down(opts)
    await this.up(opts)
  }
  async wheel(deltaX: number, deltaY: number): Promise<void> {
    await this.t.mouse('mouseWheel', this.x, this.y, { deltaX, deltaY })
  }
}

export interface PageOptions {
  /** Pausa por defecto tras acciones que suelen navegar/mutar (ms). */
  actionDelay?: number
}

/**
 * Página automatizable con una API con la forma de Playwright, encima de un
 * `Transport`. El agente escribe código contra esto en el REPL.
 */
export class Page {
  readonly keyboard: Keyboard
  readonly mouse: Mouse

  constructor(
    private readonly transport: Transport,
    private readonly opts: PageOptions = {}
  ) {
    this.keyboard = new Keyboard(transport)
    this.mouse = new Mouse(transport)
  }

  // ---- Navegación / info ----

  async goto(url: string): Promise<void> {
    if (this.transport.goto) {
      await this.transport.goto(url)
      return
    }
    await this.transport.eval(`(() => { location.href = ${JSON.stringify(url)}; return true })()`)
    await this.waitForLoad()
  }

  async url(): Promise<string> {
    return this._eval<string>('location.href')
  }
  async title(): Promise<string> {
    return this._eval<string>('document.title')
  }
  async content(): Promise<string> {
    return this._eval<string>('document.documentElement.outerHTML')
  }
  async innerText(): Promise<string> {
    return this._eval<string>('document.body.innerText || ""')
  }

  async waitForLoad(timeout = 15000): Promise<void> {
    const start = Date.now()
    for (;;) {
      const ready = await this._eval<string>('document.readyState')
      if (ready === 'complete' || ready === 'interactive') return
      if (Date.now() - start > timeout) return
      await sleep(100)
    }
  }

  async waitForTimeout(ms: number): Promise<void> {
    await sleep(ms)
  }

  async waitForFunction(fn: string, timeout = 8000): Promise<void> {
    const start = Date.now()
    for (;;) {
      if (await this._eval<boolean>(`Boolean((${fn})())`)) return
      if (Date.now() - start > timeout) throw new Error(`waitForFunction timeout (${timeout}ms)`)
      await sleep(100)
    }
  }

  // ---- Locators y atajos por selector ----

  locator(selector: string): Locator {
    return new Locator(this, selector)
  }

  async click(selector: string, opts?: ClickOptions): Promise<void> {
    await this.locator(selector).click(opts)
    if (this.opts.actionDelay) await sleep(this.opts.actionDelay)
  }
  async fill(selector: string, value: string): Promise<void> {
    await this.locator(selector).fill(value)
  }
  async type(selector: string, text: string, opts?: { delay?: number }): Promise<void> {
    await this.locator(selector).type(text, opts)
  }
  async press(selector: string, key: string): Promise<void> {
    await this.locator(selector).press(key)
  }
  async hover(selector: string): Promise<void> {
    await this.locator(selector).hover()
  }
  async selectOption(selector: string, value: string): Promise<void> {
    await this.locator(selector).selectOption(value)
  }
  async check(selector: string): Promise<void> {
    await this.locator(selector).check()
  }
  async uncheck(selector: string): Promise<void> {
    await this.locator(selector).uncheck()
  }
  async textContent(selector: string): Promise<string | null> {
    return this.locator(selector).textContent()
  }
  async getAttribute(selector: string, name: string): Promise<string | null> {
    return this.locator(selector).getAttribute(name)
  }
  async isVisible(selector: string): Promise<boolean> {
    return this.locator(selector).isVisible()
  }

  async waitForSelector(selector: string, opts?: WaitOptions): Promise<void> {
    await this.locator(selector).waitFor(opts)
  }

  /** Espera a que un texto aparezca en la página. */
  async waitForText(text: string, timeout = 8000): Promise<void> {
    await this.waitForFunction(
      `() => document.body && document.body.innerText.includes(${JSON.stringify(text)})`,
      timeout
    )
  }

  // ---- Evaluación de código (el corazón del coding-agent) ----

  /** page.evaluate(fn, arg): serializa la función y la ejecuta en la página. */
  async evaluate<T = unknown, A = unknown>(fn: ((arg: A) => T) | string, arg?: A): Promise<T> {
    const body = typeof fn === 'string' ? fn : fn.toString()
    const expr = `(${body})(${arg === undefined ? '' : JSON.stringify(arg)})`
    return this.transport.eval<T>(expr)
  }

  /** Devuelve los `textContent` de todos los nodos que casan (como $$eval simple). */
  async $$text(selector: string): Promise<string[]> {
    return this._eval<string[]>(
      `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map(e => (e.textContent||'').trim())`
    )
  }

  // ---- Percepción para el agente ----

  /** Snapshot de accesibilidad podado (estructurado). */
  async snapshot(opts?: SnapshotOptions): Promise<Snapshot> {
    return takeSnapshot(this.transport, opts)
  }

  /** Snapshot renderizado a texto compacto, listo para el prompt. */
  async snapshotText(opts?: SnapshotOptions): Promise<string> {
    return formatSnapshot(await this.snapshot(opts))
  }

  /** Click sobre un `ref` de un snapshot previo. */
  async clickRef(ref: number, opts?: ClickOptions): Promise<void> {
    await this.locator(`[${REF_ATTR}="${ref}"]`).click(opts)
    if (this.opts.actionDelay) await sleep(this.opts.actionDelay)
  }
  async fillRef(ref: number, value: string): Promise<void> {
    await this.locator(`[${REF_ATTR}="${ref}"]`).fill(value)
  }
  async hoverRef(ref: number): Promise<void> {
    await this.locator(`[${REF_ATTR}="${ref}"]`).hover()
  }

  async screenshot(): Promise<Screenshot> {
    if (!this.transport.screenshot) throw new Error('El transport no soporta screenshot()')
    return this.transport.screenshot()
  }

  // ---- Red: descubrir y reusar las APIs internas del sitio ----

  /**
   * Lista los recursos que la página ya solicitó (via Performance API). Útil
   * para descubrir endpoints internos sin instrumentar nada — funciona
   * retroactivamente para toda la carga. Filtra por tipo ('fetch',
   * 'xmlhttprequest', 'script'…) o por subcadena de URL.
   */
  async resourceRequests(filter: { type?: string; contains?: string } = {}): Promise<
    { url: string; type: string; duration: number }[]
  > {
    return this._eval(`performance.getEntriesByType('resource')
      .map((e) => ({ url: e.name, type: e.initiatorType, duration: Math.round(e.duration) }))
      .filter((r) => (${JSON.stringify(filter.type ?? null)} == null || r.type === ${JSON.stringify(filter.type ?? null)})
        && (${JSON.stringify(filter.contains ?? null)} == null || r.url.includes(${JSON.stringify(filter.contains ?? '')})))`)
  }

  /**
   * Instala (idempotente) un interceptor de fetch/XHR para capturar método,
   * URL y status de las peticiones FUTURAS. Llámalo antes de la acción que
   * dispara la request que te interesa; luego lee con `capturedRequests()`.
   */
  async installNetworkCapture(): Promise<void> {
    await this._eval(`(() => {
      if (window.__mw_net) return true;
      window.__mw_net = [];
      const push = (r) => { window.__mw_net.push(r); if (window.__mw_net.length > 200) window.__mw_net.shift(); };
      const of = window.fetch;
      window.fetch = function(...a) {
        const url = (a[0] && a[0].url) || a[0];
        const method = (a[1] && a[1].method) || (a[0] && a[0].method) || 'GET';
        return of.apply(this, a).then((res) => { push({ method, url: String(url), status: res.status, type: 'fetch' }); return res; })
          .catch((e) => { push({ method, url: String(url), status: 0, type: 'fetch', error: String(e) }); throw e; });
      };
      const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(m, u) { this.__mw = { method: m, url: u }; return XO.apply(this, arguments); };
      XMLHttpRequest.prototype.send = function() {
        const x = this;
        this.addEventListener('loadend', () => push({ method: (x.__mw && x.__mw.method) || 'GET', url: String(x.__mw && x.__mw.url), status: x.status, type: 'xhr' }));
        return XS.apply(this, arguments);
      };
      return true;
    })()`)
  }

  /** Peticiones capturadas desde `installNetworkCapture()`. */
  async capturedRequests(): Promise<{ method: string; url: string; status: number; type: string }[]> {
    return this._eval('window.__mw_net || []')
  }

  /**
   * Reproduce una petición DESDE el contexto de la página: hereda cookies,
   * origin y headers del sitio, así que es indistinguible de sus propias
   * llamadas. Devuelve status, headers y body (recortado). Este es el atajo
   * para "reverse-engineerar" la API interna y saltarte la UI.
   */
  async fetch(
    url: string,
    init: Record<string, unknown> = {}
  ): Promise<{ status: number; ok: boolean; headers: Record<string, string>; body: string }> {
    const js = `(async () => {
      const res = await fetch(${JSON.stringify(url)}, ${JSON.stringify(init)});
      const headers = {}; res.headers.forEach((v, k) => headers[k] = v);
      let body = ''; try { body = await res.text(); } catch (e) {}
      return { status: res.status, ok: res.ok, headers, body: body.slice(0, 8000) };
    })()`
    return this.transport.eval(js)
  }

  /** Como fetch pero devuelve el JSON parseado sin truncar (para APIs internas de sitios). */
  async fetchJSON<T = unknown>(url: string, init: Record<string, unknown> = {}): Promise<T> {
    const js = `(async () => { const r = await fetch(${JSON.stringify(url)}, ${JSON.stringify(init)}); return await r.json(); })()`
    return this.transport.eval<T>(js)
  }

  /** Como fetch pero devuelve el texto completo sin truncar (export de Docs/Sheets, etc.). */
  async fetchText(url: string, init: Record<string, unknown> = {}): Promise<string> {
    const js = `(async () => { const r = await fetch(${JSON.stringify(url)}, ${JSON.stringify(init)}); return await r.text(); })()`
    return this.transport.eval<string>(js)
  }

  async scrollBy(dy: number): Promise<void> {
    await this._eval(`(() => { window.scrollBy({ top: ${dy}, behavior: 'instant' }); return true })()`)
  }

  // ---- Internos usados por Locator ----

  /** @internal Evalúa una expresión y devuelve su valor. */
  _eval<T = unknown>(expression: string): Promise<T> {
    return this.transport.eval<T>(`(() => (${expression}))()`)
  }

  /** @internal Ejecuta `fn(el)` sobre el elemento nº index del selector. */
  async _elEval<T = unknown>(selector: string, index: number, fn: string): Promise<T> {
    const js = `(() => {
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if (!el) return { __mw_missing: true };
      return (${fn})(el);
    })()`
    const res = (await this.transport.eval(js)) as T & { __mw_missing?: boolean }
    if (res && (res as { __mw_missing?: boolean }).__mw_missing) {
      throw new Error(`No element for selector ${JSON.stringify(selector)} at index ${index}`)
    }
    return res
  }

  /** @internal Centro del elemento (px viewport), tras hacerlo visible. */
  async _center(selector: string, index: number): Promise<{ x: number; y: number }> {
    const c = await this._elEval<{ x: number; y: number }>(
      selector,
      index,
      `(el) => {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      }`
    )
    return c
  }

  /** @internal Modificadores neutros (reexport para adaptadores). */
  static modifiers = toModifiers
}
