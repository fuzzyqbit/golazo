# Quick 260622-msz — Render: configurable browserExecutable (env)

## Problem
On macOS < 15, Remotion's auto-downloaded Chrome Headless Shell never launches — `render` hangs at browser launch (no chrome process, 0 CPU). Verified twice. A spike proved Remotion's `openBrowser` launches the already-present Playwright `chrome-headless-shell` cleanly when passed via `browserExecutable`.

## Goal
Let the operator point Remotion at a working Chrome binary, without changing default behavior on supported (macOS 15+) machines.

## Task 1 — thread browserExecutable through the render driver (TDD)
**Files:** `src/render/driver.ts`, `src/render/driver.test.ts`

**Action:**
- In `src/render/driver.ts`, read once near the top of the render function:
  `const browserExecutable = process.env.GOLAZO_BROWSER_EXECUTABLE || undefined;`
- Pass `browserExecutable` to ALL FOUR Remotion calls: the two `selectComposition` calls (Episode + Thumbnail), `renderMedia`, and `renderStill`. (All accept it in @remotion/renderer v4.)
- When the env var is unset → value is `undefined` → identical to today's behavior (Remotion default). Backward compatible; no change for macOS 15+.
- Do NOT hardcode any path. Do NOT add deps.

**Verify (RED→GREEN):**
- `src/render/driver.test.ts` already mocks `@remotion/renderer`. Add/extend a test: with `GOLAZO_BROWSER_EXECUTABLE` set (use `vi.stubEnv`), assert each mocked Remotion call received `browserExecutable: '<that value>'`; with it unset, assert `browserExecutable` is `undefined`.
- `npm test` (full vitest) — driver tests green. Note: prepare/render/publish *integration* tests that shell out to real ffmpeg/Remotion may fail in this env (pre-existing, ffmpeg/Chrome) — do not chase those; only the unit-level `driver.test.ts` must pass.
- `npm run typecheck` — no NEW errors in driver.ts (pre-existing repo errors out of scope).

**Done:** driver passes `browserExecutable` (env-sourced) to all 4 Remotion calls; unit tests prove threading both when set and unset; build clean.

## Commit
Atomic, code only. Stage only `src/render/driver.ts` + `src/render/driver.test.ts`. Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
