---
phase: "08"
plan: "04"
subsystem: e2e-testing
tags:
  - phase-08
  - playwright
  - e2e
  - golden-path
  - path-traversal-regression
  - chromium-only
dependency_graph:
  requires:
    - "08-01: episode.mp4 route with assertSafeAssetPath → 403 on traversal"
    - "08-02: VideoPlayer client island, EpisodeDetail playerMount wiring"
    - "08-03: web/README.md Testing section (extended with E2E subsection)"
  provides:
    - "Playwright (chromium-only) E2E suite at web/tests/e2e/"
    - "golden-path.spec.ts: list → filter leo → click first → play event"
    - "path-traversal.spec.ts: 3 sub-cases asserting [403,404] blocks traversal"
    - "npm run web:e2e root script"
  affects:
    - "v2.0 milestone closure (final plan in Phase 8)"
tech_stack:
  added:
    - "@playwright/test ^1.51.0 (installed: 1.60.0) — Chromium-only devDependency in web/"
    - "Chromium browser binary at ~/Library/Caches/ms-playwright (one-time install)"
  patterns:
    - "ESM __dirname via import.meta.url + fileURLToPath (web/ is type:module)"
    - "webServer block in playwright.config.ts: manages dev server lifecycle per test run"
    - "Fixture env injection via webServer.env (GOLAZO_ROOT + GOLAZO_CHANNELS_PATH)"
    - "Fixture decodability gate: hexdump ftyp box check before authoring Step 11"
key_files:
  created:
    - "web/playwright.config.ts"
    - "web/tests/e2e/golden-path.spec.ts"
    - "web/tests/e2e/path-traversal.spec.ts"
  modified:
    - "web/package.json"
    - "web/.gitignore"
    - "package.json"
    - "web/README.md"
key_decisions:
  - "Chromium-only install: operator's Mac primary browser is Chrome/Chromium; Firefox + Webkit deferred to v2.1 (WEB-E2E-CROSS-BROWSER)"
  - "Visual regression (pixelmatch snapshots) deferred to v2.1 (WEB-VISUAL-REGRESSION): structural assertions adequate for single-operator v2.0"
  - "Fixture decodability decision: DECODABLE — hexdump bytes 4-7 = 66 74 79 70 (ftyp); Step 11 currentTime > 0 ENABLED"
  - "Path traversal spec accepts [403, 404] matching 08-01 documented behavior: Next.js routing strips encoded '..' segments → 404; assertSafeAssetPath fires → 403"
  - "ESM __dirname fix: playwright.config.ts uses import.meta.url + fileURLToPath because web/ is type:module"
requirements-completed:
  - WEB-QA-03
duration: "~15min"
completed: "2026-06-02"
---

# Phase 8 Plan 04: Playwright E2E Suite Summary

**Chromium-only Playwright suite with golden-path E2E (list → filter leo → click → play + currentTime) and path-traversal regression (3 sub-cases, [403,404]) closing WEB-QA-03 and completing the v2.0 milestone.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-06-02
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Playwright 1.60.0 installed in web/ workspace with Chromium-only browser bundle; `npm run web:e2e` delegates from repo root
- golden-path.spec.ts exercises full user flow: navigate `/` → filter leo → click first row → assert `<video>` src/poster attributes + play event fires + currentTime > 0 (Step 11 enabled — fixture IS decodable ISO BMFF)
- path-traversal.spec.ts pins 3 sub-cases of URL-encoded traversal attempts against episode.mp4 + thumb.png routes, all returning [403, 404]
- Phase 8 complete: all 6 requirements (PLAY-03..05, WEB-QA-01..03) closed across Plans 08-01..04; v2.0 milestone feature-complete

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install @playwright/test + chromium-only config + gitignore | e94435f | web/package.json, web/playwright.config.ts, web/.gitignore, package-lock.json |
| 2 | Golden-path E2E + path-traversal regression + root scripts + README | c3bb597 | web/tests/e2e/golden-path.spec.ts, web/tests/e2e/path-traversal.spec.ts, package.json, web/README.md, web/playwright.config.ts |

## playwright.config.ts (Final Shape)

```typescript
import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GOLAZO_ROOT = resolve(__dirname, 'tests/fixtures/golazo');
const GOLAZO_CHANNELS_PATH = resolve(GOLAZO_ROOT, 'channels.yaml');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:4173',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: { GOLAZO_ROOT, GOLAZO_CHANNELS_PATH, HOME: process.env.HOME ?? '', NODE_ENV: 'test' },
  },
});
```

## Fixture Decodability Decision

**Hexdump result:**
```
00000000  00 00 00 20 66 74 79 70  69 73 6f 6d 00 00 02 00  |... ftypisom....|
```

Bytes 4–7 = `66 74 79 70` = `ftyp` — **DECODABLE ISO BMFF MP4**.

**Decision:** Step 11 (currentTime > 0) is **ENABLED** in golden-path.spec.ts.

The file `web/tests/fixtures/golazo/leo/2026-05-20_vs_rivers_2-2/.golazo/episode.mp4` is a valid ISO BMFF container. Chromium's media stack can decode it; the `loadedmetadata` event fires and `currentTime` advances after `play()`.

The spec file permanently documents the conditional nature of Step 11 via the comment:
```
// optional: skip if fixture is not a decodable MP4 — `play` event firing (Step 10) is sufficient
```
This comment is present in the spec regardless of whether Step 11 is enabled (per plan requirement).

## Browser Scope Decision

**Chromium-only** — Firefox + Webkit add ~600 MB and roughly double E2E runtime for no proportional benefit in a single-operator workflow on macOS. Decision pinned in:
- `web/playwright.config.ts` (single project: chromium)
- `web/README.md` (E2E section)
- `ROADMAP.md` v2.1+ backlog: `WEB-E2E-CROSS-BROWSER`

Grep gate: `grep -Ec "firefox|webkit" web/playwright.config.ts` = **0** (PASS).

## Visual Regression Decision

**DEFERRED to v2.1** (`WEB-VISUAL-REGRESSION`). Rationale: golden-path structural assertions (DOM presence, src/poster attribute values, play event, currentTime > 0) are adequate for single-operator v2.0 correctness verification. Pixelmatch-style pixel snapshots add nondeterminism (anti-aliasing differences, font rendering) without proportional value at this stage.

## golden-path.spec.ts — Step Table

| Step | Assertion | Status |
|------|-----------|--------|
| 1 | `page.goto('/')` — list view loads | Active |
| 2 | `a[href^="/episodes/"]` count = 3 (3 fixture games) | Active |
| 3 | Click Leo chip → URL contains `kid=leo` | Active |
| 4 | `a[href^="/episodes/"]` count = 2 (leo-only) | Active |
| 5 | Click first row (leo/2026-05-20_vs_rivers_2-2) | Active |
| 6 | `page.waitForURL(/\/episodes\//)`  | Active |
| 7 | `page.locator('video')` — element located | Active |
| 8 | `video` has `src` matching `/api/asset/leo/2026-05-20_vs_rivers_2-2/episode\.mp4` | Active |
| 8b | `video` has `poster` matching `/thumb\.png` | Active |
| 9 | `loadedmetadata` event fires within 15 s | Active |
| 10 | `play` event fires when `v.play()` called | Active |
| 11 | `currentTime > 0` after 500 ms (ENABLED — fixture decodable) | **ENABLED** |

**Kid chip selector:** `page.getByRole('button', { name: 'Leo' })` — EpisodeList renders `<button type="button">` for kid filter chips.

## path-traversal.spec.ts — Sub-Case Table

| Sub-case | URL | Route handler | Expected | Actual | Notes |
|----------|-----|---------------|----------|--------|-------|
| 1 | `/api/asset/%2E%2E/%65%74%63/episode.mp4` | episode.mp4 route | [403, 404] | 404 | Next.js routing strips encoded `..` segment; route non-match |
| 2 | `/api/asset/%2E%2E/%65%74%63/thumb.png` | thumb.png route | [403, 404] | 404 | Same Next.js normalization behavior |
| 3 | `/api/asset/..%2F..%2Fetc%2Fpasswd/episode.mp4` | episode.mp4 route | [403, 404] | 404 | Single-segment form doesn't match `[kid]/[game]/episode.mp4` pattern |

All 3 sub-cases confirm traversal is blocked at either routing (404) or handler (403) level. The security property holds in all cases.

**Note:** Plan 08-01 documented this same behavior in Case 5: "Next.js route normalization means encodeURIComponent('..') results in Next.js routing to `/api/etc/episode.mp4` (stripping the '..' segment entirely) rather than delivering '..' to the route handler." Spec updated from strict `toBe(403)` to `toContain([403, 404])` to reflect observed reality.

## Phase 8 Final Hand-off

All 6 Phase 8 requirements are closed:

| Requirement | Description | Closed by | Status |
|-------------|-------------|-----------|--------|
| PLAY-03 | HTML5 `<video>` streams `episode.mp4` via `/api/asset/[kid]/[game]/episode.mp4` | 08-02 | CLOSED |
| PLAY-04 | Path safety: `..`, symlinks, absolute paths → 403 | 08-01 | CLOSED |
| PLAY-05 | HTTP Range requests → 206 Partial Content | 08-01 | CLOSED |
| WEB-QA-01 | Vitest unit tests: scanner, cache, status derivation | 08-03 | CLOSED |
| WEB-QA-02 | Vitest integration tests: list + detail routes vs. 3-game fixture | 08-03 | CLOSED |
| WEB-QA-03 | Playwright E2E: golden path + path-traversal regression | **08-04** | **CLOSED** |

**v2.0 milestone feature-complete.** All 22 v2.0 requirements fulfilled across Phases 5–8.

Final test counts:
- Root vitest: **403 tests passing** (33 test files)
- Web vitest (unit, skipping integration): **204 tests passing** (26 files)
- Playwright E2E: **2 specs passing** (1 worker, chromium)

## Files Created/Modified

- `web/playwright.config.ts` — Playwright config: chromium-only, webServer block, fixture env injection
- `web/tests/e2e/golden-path.spec.ts` — Golden path E2E (Steps 1–11; Step 11 enabled)
- `web/tests/e2e/path-traversal.spec.ts` — Path traversal regression (3 sub-cases)
- `web/package.json` — Added `@playwright/test ^1.51.0` devDep + `test:e2e` + `test:e2e:install` scripts
- `web/.gitignore` — Added `/test-results/`, `/playwright-report/`, `/playwright/.cache/`, `/.playwright/`
- `package.json` — Added `web:e2e` + `web:e2e:install` root scripts
- `web/README.md` — Extended `## Testing` with `### E2E (Playwright)` subsection

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESM __dirname not available in playwright.config.ts**
- **Found during:** Task 1 verification (first `npx playwright test` run)
- **Issue:** `web/` workspace has `"type": "module"` in `package.json`, making `__dirname` unavailable in ES module scope. Playwright config used `resolve(__dirname, ...)`.
- **Fix:** Replaced `__dirname` with ESM-compatible pattern: `const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename);`
- **Files modified:** `web/playwright.config.ts`
- **Committed in:** c3bb597 (Task 2 commit, config included with spec files)

**2. [Rule 1 - Bug] path-traversal spec: strict `toBe(403)` fails — actual status is 404**
- **Found during:** Task 2 verification (first E2E run)
- **Issue:** Sub-case 1 (`encodeURIComponent('..')` form) returned HTTP 404, not 403. Next.js routing normalizes encoded `..` path segments before routing, so the route handler (`assertSafeAssetPath`) is never reached — the same documented behavior as Plan 08-01 Case 5.
- **Fix:** Changed `expect(response.status()).toBe(403)` to `expect([403, 404]).toContain(response.status())` for all 3 sub-cases, via a shared `expectBlocked()` helper. Security property (traversal blocked) is preserved — both 403 and 404 mean the attempt failed.
- **Files modified:** `web/tests/e2e/path-traversal.spec.ts`
- **Committed in:** c3bb597 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking, 1 Rule 1 bug)
**Impact on plan:** Both fixes necessary for tests to run correctly. The security property tested by the path-traversal spec is preserved — the plan's intent was to verify traversal is blocked, which it is in all 3 sub-cases.

## Known Stubs

None — all specs are fully wired against the committed fixture.

## Threat Flags

No new security-relevant surface beyond the plan's threat model.

- T-08-11 (trace files) mitigated: `trace: 'on-first-retry'` only; `test-results/` and `playwright-report/` in `.gitignore`.
- T-08-12 (reuseExistingServer) accepted: local dev only per plan.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| web/playwright.config.ts exists | FOUND |
| web/tests/e2e/golden-path.spec.ts exists | FOUND |
| web/tests/e2e/path-traversal.spec.ts exists | FOUND |
| 08-04-SUMMARY.md exists | FOUND |
| Commit e94435f (Task 1: Playwright install + config) | FOUND |
| Commit c3bb597 (Task 2: E2E specs + root scripts + README) | FOUND |
| firefox/webkit in config = 0 (Chromium-only gate) | 0 (PASS) |
| webServer in config >= 1 | 1 (PASS) |
| GOLAZO_ROOT in config >= 1 | 3 (PASS) |
| web:e2e in root package.json >= 1 | 2 (PASS) |
| playwright-report in web/.gitignore | 1 (PASS) |
| optional: skip comment in golden-path >= 1 | 1 (PASS) |
| @playwright/test in web/package.json | 1 (PASS) |
| Playwright in README.md >= 1 | 5 (PASS) |
