# Monper

A desktop agentic browser: Electron 43 + React 19 + electron-vite + TypeScript + Tailwind v4.
It renders web pages, but the product is the agent that operates them — not a Chrome
replacement. When in doubt, invest in the agent, not in browser parity.

## Commands

```bash
pnpm dev          # the USER runs this — see below
pnpm typecheck    # tsc on node + web projects; includes tests/
pnpm build        # electron-vite build (required before tests)
pnpm test         # build + the Playwright smoke suite — CI runs this on every commit
pnpm test:only    # tests without rebuilding
pnpm dist:mac     # DMG + ZIP (the ZIP is mandatory for auto-update)
```

## Hard rules

**Do not launch the app, and do not run the test suite.** The user runs `pnpm dev`
themselves, and CI runs the tests on every commit — running them locally just burns minutes.
Verify with `pnpm typecheck` and `pnpm build`. Write and update tests as usual; let CI run
them. Run a single spec only if the user asks, or to debug a specific failure they reported.

**Main-process and preload changes need a full restart.** ⌘R only reloads the renderer. This
has bitten us repeatedly (the store button, the Appearance section). Say so when handing off.

**The agent never sees passwords.** This is the crown jewel of the product. Secrets are read
in the main process (`safeStorage`) and injected via `executeJavaScript`; the agent only
learns *which fields were filled*. No IPC channel, tool, or log may carry a secret. See
[docs/vault-architecture.md](docs/vault-architecture.md).

**AI provider auth is API key / OpenAI-compatible only.** Never subscription OAuth.

**Do not touch the page-view corners or vibrancy without reading
[docs/esquinas-y-vibrancy.md](docs/esquinas-y-vibrancy.md).** The rounding and the window
vibrancy are, in the user's words, part of Monper's soul. Four failed attempts came from
theorising instead of diffing against the last good state. The `Content` div has **no
background on purpose**.

**Never leave a failure invisible.** An empty `catch` is only acceptable when the failure
changes nothing the user sees, and even then it must state why (`catch { /* already closed */ }`).
Otherwise: tagged `console.error`, visible UI state, or a native dialog — the lowest level
that works. Never leave the UI claiming success.
See [docs/errores-silenciosos.md](docs/errores-silenciosos.md).

**Before theorising, diff against the last known-good state.** `git log`/`git show` first.
Both the corners saga and a no-op focus "fix" were caused by reasoning ahead of measuring.

**Measure before optimising, and measure after.** `pnpm test:only tests/perf.spec.ts` prints
medians for startup, paint, bundle size, interactions and memory. A change that moves no
number is a hypothesis, not an optimisation. See [docs/rendimiento.md](docs/rendimiento.md).

**Verify your fix actually fixes it.** A fix that is not measured is a guess. If it cannot be
measured, say so instead of implying it works.

## Layout

| Path | What lives there |
|---|---|
| `src/main/` | Main process. `index.ts` is still a god file (~1700 lines): tabs, layout, menus, IPC. |
| `src/main/agent/` | Mastra agent, REPL (`run_js`), headless pages, one file per service in `globals/` |
| `src/main/vault/` | Encrypted secret store. Secrets never leave the main process. |
| `src/main/popover.ts` | Factory for the native overlay windows |
| `src/main/jsonfile.ts` | `readJson`/`writeJson` — every state file goes through here (atomic writes) |
| `src/preload/` | One preload per window/feature; each `contextBridge` surface is separate |
| `src/renderer/src/` | Chrome UI plus one entry per internal page (newtab, settings, error, downloads) and per popover |
| `packages/monperwright/` | Publishable npm library: Playwright-shaped automation over a transport |
| `tests/` | Playwright-over-Electron smoke tests |

## Things that will surprise you

- **Native overlay windows are not optional.** Pages are `WebContentsView`, which draws
  *above* the DOM, so a positioned `div` ends up underneath. Popovers must be real windows.
  Five of them come from `createPopover`; four are bespoke for stated reasons —
  see [docs/popovers.md](docs/popovers.md).
- **A control next to the content edge only works on the chrome side.** The page view starts
  exactly at the edge and draws above the DOM, so anything past it gets neither pointer
  events nor pixels. The resize handle used to straddle the edge (±4px) and half of it was
  dead — that is why aiming at it was hard. Keep such hit areas entirely on the chrome side.
- **Only internal pages may touch private data over IPC.** `isInternalSender()` allows
  `newtab/settings/error/downloads`. The chrome (`index.html`) is *not* internal, so
  `addBookmark`/`removeBookmark` in the preload silently do nothing from there.
- **`state:update` is push-only**, sent on `did-finish-load` and on every change.
- **The renderer CSP forbids `unsafe-eval`**, so nothing can compile a function in the page.
- **Extensions with blocking APIs can never work.** Electron does not implement
  `declarativeNetRequest`, `chrome.contextMenus` or `chrome.action`. Not a bug to fix.
- **`corner-shape: superellipse()` is scoped to `rounded-*` but not `rounded-full`.**
- Passkeys, code signing, notarization and installing a real update are all blocked on an
  Apple Developer account — see [docs/pendiente-passkeys-firma.md](docs/pendiente-passkeys-firma.md).

## Debug flags

```bash
MONPER_NO_VIBRANCY=1     # rule out the macOS compositor
MONPER_DEBUG_CORNERS=1   # print sampled vs real corner pixels
MONPER_FAKE_UPDATE=1     # simulate the whole update cycle (UI only)
MONPER_UPDATE_FEED=http://localhost:8788   # real detect → download → verify
MONPER_TEAM_ID=...       # required for passkeys (needs a signed build)
MONPER_DEBUG_TOPCOLOR=1  # log every topbar sample: reason, scrollY and colour
```

## Read before you touch

| Area | Document |
|---|---|
| Corners, vibrancy, window chrome | [esquinas-y-vibrancy.md](docs/esquinas-y-vibrancy.md) |
| Native overlay windows | [popovers.md](docs/popovers.md) |
| Vault, autofill, secret handling | [vault-architecture.md](docs/vault-architecture.md) |
| Error handling, state files | [errores-silenciosos.md](docs/errores-silenciosos.md) |
| Tests and CI | [tests.md](docs/tests.md) |
| Performance: baselines and what was optimised | [rendimiento.md](docs/rendimiento.md) |
| Packaging, signing, auto-update | [distribucion.md](docs/distribucion.md) |
| Permissions, session restore, hardening | [browser-hardening.md](docs/browser-hardening.md) |
| Where the product is going, what was dropped | [diagnostico.md](docs/diagnostico.md) |
| What Aside has that we don't | [aside-gap-analysis.md](docs/aside-gap-analysis.md) |

The documents under `docs/` are internal notes and are written in Spanish; they record *why*
a decision was made and which approaches already failed. Keep them that way, and add to them
when a session teaches something a future one would otherwise rediscover the hard way.

## Conventions

- Comments explain **why**, in Spanish, matching the surrounding code. A comment that
  restates the code is noise; one that records a trap is the point.
- New state files go through `jsonfile.ts`. New popovers go through `createPopover` unless
  there is a reason worth writing down.
- The Monper mark on a variable background goes through `MonperMark` (the PNG's alpha as a
  CSS mask filled with `currentColor`). A plain `<img>` cannot be recoloured, and the white
  iso vanished on light pages. Where the background is always dark, the PNG is fine.
- Popover rows use `PopoverRow`. Do not invent a new row style per window — that is the
  inconsistency the shared primitives exist to remove.
- Talk to the user in Spanish.
