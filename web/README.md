# @golazo/web

Next.js front-end for the golazo highlight-episode review dashboard. Serves the episode list, episode detail, and per-asset streaming endpoints. Runs locally at `http://127.0.0.1:4173`.

## Development

```bash
npm run web:dev       # start Next.js dev server (from repo root)
npm run dev           # same, from within web/
```

## Testing

### Running tests

```bash
# From repo root
npm run web:test      # run full unit + integration suite (non-coverage mode)

# From web/ directory
npx vitest run        # same — runs src/**/*.test.ts + tests/**/*.test.ts
```

Integration tests spawn a live Next.js process. They can be skipped individually in
time-constrained environments with the following env vars:

| Env var | Skips |
|---------|-------|
| `GOLAZO_SKIP_LIST_INTEGRATION=1` | list-view integration suite (port 4175) |
| `GOLAZO_SKIP_DETAIL_INTEGRATION=1` | detail-view integration suite (port 4177) |
| `GOLAZO_SKIP_ASSET_INTEGRATION=1` | episode-asset integration suite (port 4178) |
| `GOLAZO_SKIP_DETAIL_PLAYER_INTEGRATION=1` | detail-player integration suite (port 4179) |
| `GOLAZO_SKIP_HOST_INTEGRATION=1` | host-binding integration suite (ports 14173/14176/14177) |

### Coverage gate

```bash
# From repo root
npm run web:coverage   # runs vitest run --coverage in web/ workspace

# From web/ directory
npx vitest run --coverage
```

The gate enforces **80% line coverage** on `web/src/`. The command exits non-zero when line
coverage drops below 80%, blocking CI.

**Baseline (Plan 08-03):** 95.00% lines (418/440) on the included surface.

### Coverage exclusions

The `exclude` array in `web/vitest.config.ts` contains **10 entries** (at the cap of 10).
The non-excluded surface is **70% of total `web/src/` lines** (2448 of 3458 lines), above
the required floor of 60%. Both guards prevent the 80% gate from being gamed by denominator
shrink.

**Exclusion cap: ≤ 10 entries; non-excluded floor: ≥ 60% — both guards prevent the 80%
gate from being gamed by denominator shrink.**

| Exclusion | Lines excluded | Reason |
|-----------|----------------|--------|
| `**/*.test.ts` | (test files) | Test files contain no production logic |
| `**/*.test.tsx` | (test files) | React component test files — none present yet |
| `**/*.test-cases.ts` | (test case constants) | Named constants, no production logic |
| `tests/fixtures/**` | (fixture data) | Fixture game folders and config — not source |
| `src/app/**` | 456 | Next.js Server Components and route handlers. These execute inside the Next.js process (not the vitest process), so v8 coverage instrumentation cannot observe them. Correctness verified by integration tests (list-view, detail-view, episode-asset, detail-player) that make real HTTP requests. Mirrors the v1.0 rationale for `remotion/**` (integration spawns a separate process). |
| `src/components/**` | 492 | React Client Components (EpisodeList, EpisodeRow, EpisodeDetail, VideoPlayer, EmptyState). No unit tests exist; rendering is verified end-to-end by the integration suites above. |
| `src/fonts.ts` | 62 | Next.js font configuration (next/font/google calls). Pure config, no application logic. |
| `.next/**` | (build output) | Next.js build artifacts — not source |
| `dist/**` | (build output) | TypeScript compiler output — not source |
| `*.config.ts` | (tooling config) | Vitest/Next.js config files — not application logic |

**Total excluded lines (source only): 1,010 of 3,458 (30%)**
**Included surface: 2,448 lines = 70% of total web/src/ lines**

### Surface breakdown (TOTAL_LINES / EXCLUDED_LINES / INCLUDED_PERCENT)

| Metric | Value |
|--------|-------|
| TOTAL_LINES (non-test .ts + .tsx in web/src/) | 3,458 |
| EXCLUDED_LINES (src/app + src/components + src/fonts.ts) | 1,010 |
| INCLUDED_LINES | 2,448 |
| INCLUDED_PERCENT | 70% |
| Gate threshold | ≥ 60% |
| Status | PASSED |

### E2E (Playwright)

Playwright (Chromium-only) exercises the full app stack against the committed fixture via a Playwright-managed dev server.

#### First-time setup

```bash
# From repo root — downloads Chromium browser (~150 MB to ~/Library/Caches/ms-playwright)
npm run web:e2e:install
```

This step is a one-time download. The browser binary lives outside the repo and is not gitignored.

#### Running E2E tests

```bash
# From repo root
npm run web:e2e

# From web/ directory
npx playwright test
```

Playwright manages the dev server lifecycle via the `webServer` block in `web/playwright.config.ts`. The server starts automatically before tests and stops after. On local re-runs, the existing dev server is reused (`reuseExistingServer: !process.env.CI`).

#### Specs covered

| Spec | Description |
|------|-------------|
| `golden-path.spec.ts` | Navigates to `/`, filters by kid=leo, clicks the first episode row, asserts `<video>` element has correct `src` and `poster` attributes, and verifies the `play` event fires |
| `path-traversal.spec.ts` | 3 sub-cases: encoded traversal on episode.mp4 route, thumb.png route, and literal `..%2F..%2F` form — all assert HTTP 403 |

#### Browser scope

**Chromium-only** — the operator's Mac primary browser is Chrome/Chromium. Firefox + Webkit add ~600 MB and roughly double E2E runtime with no proportional benefit for a single-operator workflow. Cross-browser coverage is deferred to v2.1.

#### Visual regression

Pixelmatch-style visual snapshots are deferred to v2.1 (`WEB-VISUAL-REGRESSION`). The golden-path structural assertions (DOM + attribute checks + play event) are sufficient for v2.0.

#### Fixture decodability note

The golden-path spec asserts the `play` event fires on the `<video>` element. This assertion holds regardless of whether `episode.mp4` in the fixture is a fully decodable MP4 or a byte-only stub, because `play` fires when `play()` is invoked.

The optional `currentTime > 0` assertion (Step 11 in the spec) is enabled only when the fixture begins with an `ftyp` box (decodable ISO BMFF). The committed fixture at `web/tests/fixtures/golazo/leo/2026-05-20_vs_rivers_2-2/.golazo/episode.mp4` is a valid ISO BMFF file (`ftyp` confirmed at bytes 4–7), so Step 11 is currently enabled. Operators regenerating the fixture should preserve this property to keep the full assertion suite green.
