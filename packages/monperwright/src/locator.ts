import type { Page } from './page'
import type { MouseButton } from './transport'

export interface ClickOptions {
  button?: MouseButton
  clickCount?: number
  modifiers?: string[]
  /** ms de pausa entre mouseDown y mouseUp (realismo humano). */
  delay?: number
}

export interface FillOptions {
  /** No dispara eventos input/change (raro). */
  quiet?: boolean
}

export interface WaitOptions {
  timeout?: number
  state?: 'attached' | 'visible' | 'hidden'
}

/**
 * Referencia perezosa a uno o varios elementos por selector CSS, con la misma
 * forma que el Locator de Playwright. Las acciones se resuelven en el momento
 * de ejecutarse (no al crearse).
 */
export class Locator {
  constructor(
    private readonly page: Page,
    readonly selector: string,
    private readonly index = 0
  ) {}

  first(): Locator {
    return new Locator(this.page, this.selector, 0)
  }

  nth(i: number): Locator {
    return new Locator(this.page, this.selector, i)
  }

  async count(): Promise<number> {
    return this.page._eval<number>(
      `document.querySelectorAll(${JSON.stringify(this.selector)}).length`
    )
  }

  async click(opts: ClickOptions = {}): Promise<void> {
    const c = await this.page._center(this.selector, this.index)
    await this.page.mouse.move(c.x, c.y)
    await this.page.mouse.down(opts)
    if (opts.delay) await sleep(opts.delay)
    await this.page.mouse.up(opts)
  }

  async hover(): Promise<void> {
    const c = await this.page._center(this.selector, this.index)
    await this.page.mouse.move(c.x, c.y)
  }

  async focus(): Promise<void> {
    await this.page._elEval(this.selector, this.index, '(el) => { el.focus(); return true }')
  }

  async fill(value: string, opts: FillOptions = {}): Promise<void> {
    await this.page._center(this.selector, this.index) // asegura que esté en viewport
    await this.page._elEval(
      this.selector,
      this.index,
      `(el) => {
        el.focus();
        const v = ${JSON.stringify(value)};
        if (el.isContentEditable) { el.textContent = v; }
        else {
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, v);
        }
        ${opts.quiet ? '' : "el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));"}
        return true;
      }`
    )
  }

  /** Escribe carácter a carácter simulando teclado real (para inputs quisquillosos). */
  async type(text: string, opts: { delay?: number } = {}): Promise<void> {
    await this.click()
    await this.page.keyboard.type(text, opts)
  }

  async press(key: string, opts: { delay?: number } = {}): Promise<void> {
    await this.focus()
    await this.page.keyboard.press(key, opts)
  }

  async selectOption(value: string): Promise<void> {
    await this.page._elEval(
      this.selector,
      this.index,
      `(el) => {
        const v = ${JSON.stringify(value)};
        const opts = Array.from(el.options || []);
        const m = opts.find(o => o.value === v) || opts.find(o => (o.label||o.text).trim() === v);
        if (!m) return false;
        el.value = m.value;
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
        return true;
      }`
    )
  }

  async check(): Promise<void> {
    if (!(await this.isChecked())) await this.click()
  }

  async uncheck(): Promise<void> {
    if (await this.isChecked()) await this.click()
  }

  async textContent(): Promise<string | null> {
    return this.page._elEval<string | null>(
      this.selector,
      this.index,
      '(el) => el.textContent'
    )
  }

  async innerText(): Promise<string> {
    return this.page._elEval<string>(this.selector, this.index, '(el) => el.innerText || ""')
  }

  async getAttribute(name: string): Promise<string | null> {
    return this.page._elEval<string | null>(
      this.selector,
      this.index,
      `(el) => el.getAttribute(${JSON.stringify(name)})`
    )
  }

  async inputValue(): Promise<string> {
    return this.page._elEval<string>(this.selector, this.index, '(el) => el.value || ""')
  }

  async isVisible(): Promise<boolean> {
    const n = await this.count()
    if (n <= this.index) return false
    return this.page._elEval<boolean>(
      this.selector,
      this.index,
      `(el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
      }`
    ).catch(() => false)
  }

  async isEnabled(): Promise<boolean> {
    return this.page._elEval<boolean>(
      this.selector,
      this.index,
      "(el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true'"
    )
  }

  async isChecked(): Promise<boolean> {
    return this.page._elEval<boolean>(
      this.selector,
      this.index,
      "(el) => !!el.checked || el.getAttribute('aria-checked') === 'true'"
    )
  }

  async scrollIntoViewIfNeeded(): Promise<void> {
    await this.page._elEval(
      this.selector,
      this.index,
      "(el) => { el.scrollIntoView({block:'center', inline:'center'}); return true }"
    )
  }

  async waitFor(opts: WaitOptions = {}): Promise<void> {
    const timeout = opts.timeout ?? 8000
    const state = opts.state ?? 'visible'
    const start = Date.now()
    for (;;) {
      const ok =
        state === 'hidden' ? !(await this.isVisible()) : state === 'attached' ? (await this.count()) > this.index : await this.isVisible()
      if (ok) return
      if (Date.now() - start > timeout) {
        throw new Error(`waitFor timeout (${timeout}ms) for ${this.selector} [state=${state}]`)
      }
      await sleep(100)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
