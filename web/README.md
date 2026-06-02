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
