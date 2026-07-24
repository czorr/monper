# monperwright

Token-efficient, **Playwright-shaped** browser automation over a pluggable
transport. Built for LLM coding agents: the model writes ordinary Playwright-like
code, and a thin wrapper runs it against a real browser via a low-level
transport (Electron `WebContents` today, raw CDP next).

Inspired by Aside's "Asidewright" approach — *"what data have LLMs seen the most?
Code."* — the API is intentionally identical in **shape** to Playwright so the
model's prior knowledge transfers, while the wire format stays small.

## Why

A tool-calling agent needs a new tool for every new capability. A coding agent
writes code, so it can do anything the page allows — fill complex forms, diff
frames, or call a site's internal API — with one surface: a JS REPL whose
globals are a `Page`.

## Install

```bash
npm install monperwright
# electron is an optional peer, only needed for the Electron adapter
```

## Usage (Electron)

```ts
import { pageFromWebContents } from 'monperwright/electron'

// wc: Electron WebContents (e.g. a WebContentsView's webContents)
const page = pageFromWebContents(wc, { actionDelay: 200 })

await page.goto('https://example.com')
await page.fill('input[name=q]', 'hello')
await page.press('input[name=q]', 'Enter')
await page.waitForText('Results')

// Perception for the model: a pruned accessibility snapshot (small + high-signal)
const snap = await page.snapshotText()   // -> compact string with [ref] role "name" (state)
await page.clickRef(3)                    // act on a ref from the snapshot

// Arbitrary code — the coding-agent superpower
const prices = await page.evaluate(() =>
  [...document.querySelectorAll('.price')].map((e) => e.textContent)
)
```

## Usage (custom transport / CDP)

Implement `Transport` and pass it to `new Page(transport)`:

```ts
import { Page, type Transport } from 'monperwright'

const transport: Transport = {
  eval: (expr) => cdp.Runtime.evaluate({ expression: expr, awaitPromise: true, returnByValue: true }).then(r => r.result.value),
  mouse: (type, x, y, o) => cdp.Input.dispatchMouseEvent(/* … */),
  key:   (type, code, o) => cdp.Input.dispatchKeyEvent(/* … */),
  screenshot: async () => ({ data: (await cdp.Page.captureScreenshot()).data, mediaType: 'image/png' }),
  goto: (url) => cdp.Page.navigate({ url })
}

const page = new Page(transport)
```

## API surface

- **Navigation**: `goto`, `url`, `title`, `content`, `innerText`, `waitForLoad`,
  `waitForTimeout`, `waitForFunction`, `waitForSelector`, `waitForText`.
- **Actions (by selector)**: `click`, `fill`, `type`, `press`, `hover`,
  `selectOption`, `check`, `uncheck`.
- **Locators**: `page.locator(sel)` → `.first()`, `.nth(i)`, `.count()`,
  `.click()`, `.fill()`, `.type()`, `.press()`, `.textContent()`, `.innerText()`,
  `.getAttribute()`, `.inputValue()`, `.isVisible()`, `.isEnabled()`,
  `.isChecked()`, `.scrollIntoViewIfNeeded()`, `.waitFor()`.
- **Input primitives**: `page.mouse.*`, `page.keyboard.*` (supports combos like
  `Control+A`).
- **Code**: `page.evaluate(fn, arg)` (serializes the function), `page.$$text(sel)`.
- **Agent perception**: `page.snapshot()` / `page.snapshotText()` (pruned a11y
  tree with `[ref]` handles), `page.clickRef/fillRef/hoverRef`, `page.screenshot()`.

## Transport contract

```ts
interface Transport {
  eval<T>(expression: string): Promise<T>
  mouse(type, x, y, opts?): Promise<void>
  key(type, keyCode, opts?): Promise<void>
  screenshot?(): Promise<{ data: string; mediaType: string }>   // optional
  goto?(url: string): Promise<void>                              // optional
}
```

`eval` receives an expression string, runs it in the page, and returns the
JSON-serializable result (awaiting promises). Everything else is built on top.

## Status

`0.1.0` — MVP. Roadmap: raw-CDP transport, network capture + `replay_request`
(reuse a site's internal API), iframe traversal, and a REPL runner that keeps a
persistent scope across turns.
