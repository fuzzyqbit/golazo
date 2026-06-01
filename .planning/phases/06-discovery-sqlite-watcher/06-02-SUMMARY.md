---
phase: 06-discovery-sqlite-watcher
plan: "02"
subsystem: web/cache
tags:
  - phase-06
  - sqlite
  - better-sqlite3
  - cache
  - invalidation
  - benchmark
  - manifesthash
  - mtime
  - disc-03
dependency_graph:
  requires:
    - "06-01: EpisodeIndex type + scanGolazoRoot + ScanResult (Plan 01)"
    - "06-01: scanner.ts GOLAZO_DOT_DIR + file constants (cacheInvalidation imports)"
    - "05-01: npm workspace setup (@golazo/cli symlink)"
  provides:
    - "Cache interface + openCache/closeCache/upsertEpisode/deleteEpisode/queryAllEpisodes/queryEpisodeByHash/rebuildFromScan"
    - "cacheSchema.ts: EPISODES_TABLE_SQL + EPISODES_INDEX_SQL + ROW_TO_EPISODE_INDEX + EPISODE_INDEX_TO_ROW"
    - "cacheInvalidation.ts: peekManifestHashFromFile + trackedFileMtimes + isRowStale + TRACKED_FILES"
    - "DISC-03 fully implemented: sqlite at web/data/index.db, WAL, < 50ms list query, mtime+hash invalidation"
  affects:
    - "06-03: Plan 03 watcher calls upsertEpisode/deleteEpisode/queryEpisodeByHash/isRowStale on chokidar events"
    - "06-04: Plan 04 startup wiring calls openCache + rebuildFromScan(scanGolazoRoot(...)) on app boot"
tech_stack:
  added:
    - "better-sqlite3 ^12.0.0 (D-16 LOCKED: sync API, single-process Next.js server)"
    - "@types/better-sqlite3 ^7.6.0"
    - "web/src/lib/cacheSchema.ts — DDL + row converters"
    - "web/src/lib/cache.ts — CRUD wrapper (openCache/closeCache/upsertEpisode/deleteEpisode/queryAllEpisodes/queryEpisodeByHash/rebuildFromScan)"
    - "web/src/lib/cacheInvalidation.ts — invalidation predicates (peekManifestHashFromFile/trackedFileMtimes/isRowStale)"
    - "web/vitest.config.ts — include tests/**/*.bench.ts pattern for p95 gate"
  patterns:
    - "WeakMap<Cache, Map<sql, Statement>> for statement memoization — compiled once per Cache instance"
    - "INSERT OR REPLACE for idempotent upsert by manifest_hash PK"
    - "db.transaction() for atomic rebuildFromScan (DELETE + INSERT*)"
    - "Regex over manifest.json bytes for peekManifestHashFromFile (D-19 perf path)"
    - "bench() guard probe pattern for colocating vitest bench + it() in one file"
key_files:
  created:
    - web/src/lib/cacheSchema.ts
    - web/src/lib/cache.ts
    - web/src/lib/cache.test.ts
    - web/src/lib/cacheInvalidation.ts
    - web/src/lib/cacheInvalidation.test.ts
    - web/tests/cache.bench.ts
    - web/data/.gitkeep
    - web/vitest.config.ts
  modified:
    - web/package.json (better-sqlite3 + @types deps)
    - web/.gitignore (narrowed data/ to data/*.db* patterns to allow .gitkeep)
    - .gitignore (web/data/*.db, *.db-shm, *.db-wal)
    - tsconfig.check.json (exclude new cache files — NodeNext TS2835 pattern)
    - package-lock.json
decisions:
  - "D-16 LOCKED: better-sqlite3 ^12.x (latest stable at execution was 12.10.0) over node:sqlite — sync API, 5+ years production usage, richer test surface, node:sqlite still flagged unstable in Node 22.x docs"
  - "D-17 LOCKED: single denormalized episodes table, 16 cols, PK manifest_hash, covering index (kid ASC, date DESC, game_folder ASC)"
  - "D-19 LOCKED: regex peek for peekManifestHashFromFile — ~30x faster than JSON.parse+zod on 4kB manifest on chokidar hot path"
  - "web/.gitignore narrowed from data/ (directory ignore) to data/*.db* patterns — git cannot un-ignore files inside an ignored directory, so .gitkeep requires the directory itself to not be ignored"
  - "web/vitest.config.ts created — root vitest.config.ts only includes *.test.ts; bench file needed tests/**/*.bench.ts include"
  - "bench() guard probe pattern: try { bench('_probe',...) } catch to detect bench mode — bench() in run mode throws, describe block is conditionally registered"
  - "tsconfig.check.json excluded cache files: same NodeNext TS2835 pattern as scanner.ts/warningBag.ts — bundler moduleResolution files with relative imports without .js extension cannot type-check under NodeNext root config"
metrics:
  duration: "15 min 17 s"
  completed: "2026-06-01"
  tasks_completed: 3
  files_created: 8
---

# Phase 6 Plan 02: SQLite Cache Layer Summary

SQLite episode index cache with `better-sqlite3` sync API, WAL journal, idempotent
`INSERT OR REPLACE` upsert, atomic `rebuildFromScan`, and regex-based manifest hash
invalidation predicate under 0.1ms p95 for 100 rows locally.

## What Was Built

### Cache schema (D-17 LOCKED)

Single denormalized `episodes` table with 16 columns mirroring `EpisodeIndex`
field-for-field. SQL CHECK constraints enforce vocabulary at the database layer:

```sql
result TEXT NOT NULL CHECK (result IN ('W','L','D')),
status TEXT NOT NULL CHECK (status IN ('prepared','rendered','published')),
```

Covering index `(kid ASC, date DESC, game_folder ASC)` matches the scanner's
ordering contract — list queries hit the index fully without a sort step.

### Cache CRUD surface

All operations are synchronous per D-16. Prepared statements memoized via
`WeakMap<Cache, Map<sql, Statement>>` — compiled once per Cache instance.

| Export | Behavior |
|---|---|
| `openCache(opts?)` | Creates db, sets WAL, runs CREATE TABLE/INDEX (idempotent) |
| `closeCache(cache)` | Idempotent close — checks `db.open` before closing |
| `upsertEpisode(cache, row)` | `INSERT OR REPLACE` by `manifest_hash` PK |
| `deleteEpisode(cache, hash)` | `DELETE FROM episodes WHERE manifest_hash = ?` |
| `queryAllEpisodes(cache)` | `SELECT ... ORDER BY kid ASC, date DESC, game_folder ASC` |
| `queryEpisodeByHash(cache, hash)` | Returns `EpisodeIndex | null` |
| `rebuildFromScan(cache, scanResult)` | Atomic: `DELETE FROM + INSERT*` in `db.transaction` |

### Invalidation predicates (D-19 LOCKED)

`peekManifestHashFromFile` uses a regex over manifest.json bytes — NOT JSON.parse.
The canonical `"manifestHash": "sha256:<64hex>"` format Plan 01 emits is byte-stable.
Regex: `/"manifestHash"\s*:\s*"(sha256:[0-9a-f]{64})"`.

Pessimistic default: null peek → treat as stale → full re-scan. Safe: false positives
cause a redundant scan, not incorrect data.

`TRACKED_FILES` sourced from `scanner.ts` exported constants — no duplication of filenames.

### Benchmark result (DISC-03 target met)

Local p95 for `queryAllEpisodes` on 100 rows: **0.073ms** (target: < 50ms; CI tolerance: < 100ms).

p95 gate `it()` in `web/tests/cache.bench.ts` passes at < 100ms. WAL journal mode
enables concurrent reads without blocking watcher writes.

### Test coverage

| File | Tests | Description |
|---|---|---|
| `web/src/lib/cache.test.ts` | 12 | open/schema, upsert/overwrite/delete, ordering, byHash round-trip, rebuildFromScan atomic+rollback, closeCache idempotent, scanner round-trip |
| `web/src/lib/cacheInvalidation.test.ts` | 11 | 2 peek happy paths, absent file, no match, invalid format, trackedMtimes empty/present, isRowStale 4 branches |
| `web/tests/cache.bench.ts` | 1 | p95 < 100ms gate (10 iterations, wall-clock via performance.now()) |
| Total (Plan 02) | 24 | All passing |
| Total (Phase 6 Plan 01+02) | 40 | All passing |

## Commits

| Task | Commit | Description |
|---|---|---|
| 1 | 15bed5a | feat(06-02): add better-sqlite3 dep, cacheSchema DDL + row converters, gitignore |
| 2 | fa27ea2 | feat(06-02): implement cache.ts CRUD wrapper + 12 TDD tests (DISC-03 sqlite half) |
| 3 | ef22798 | feat(06-02): cacheInvalidation + p95 benchmark + web vitest.config.ts (DISC-03) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] better-sqlite3 version: 11.x → 12.x**
- **Found during:** Task 1
- **Issue:** Plan specified `^11.x` but npm registry latest stable is `12.10.0`; Context7 library docs showed v12.x. The plan's own note said "or the latest 11.x from Context7 at execution time."
- **Fix:** Used `^12.0.0` (latest stable per npm registry) — same sync API, backward compatible
- **Files modified:** web/package.json
- **Commit:** 15bed5a

**2. [Rule 3 - Blocking] web/.gitignore `data/` → `data/*.db*`**
- **Found during:** Task 1 commit staging
- **Issue:** `web/.gitignore` had `data/` (directory ignore). Git cannot un-ignore files inside an ignored directory, so `git add web/data/.gitkeep` failed with "path is ignored."
- **Fix:** Changed `web/.gitignore` from `data/` to `data/*.db`, `data/*.db-shm`, `data/*.db-wal` — keeping db files ignored while allowing `.gitkeep` to be tracked
- **Files modified:** web/.gitignore
- **Commit:** 15bed5a

**3. [Rule 1 - Bug] cache.test.ts FIXTURE_ROOT path resolution**
- **Found during:** Task 2 first run (`cd web && npx vitest run`)
- **Issue:** `resolve('web/tests/fixtures/golazo')` resolves relative to `process.cwd()`. When running from `web/` directory, `process.cwd()` is `/repo/web` and there's no `web/` subdirectory there — fixture path evaluates to `/repo/web/web/tests/fixtures/golazo` (wrong).
- **Fix:** Used `fileURLToPath(new URL('.', import.meta.url))` to get the directory of the test file itself, then navigated `../..` to reach `web/` — consistent with `scanner.test.ts` precedent (D-scan-01)
- **Files modified:** web/src/lib/cache.test.ts
- **Commit:** ef22798

**4. [Rule 3 - Blocking] bench() unavailable in vitest run mode**
- **Found during:** Task 3 first full test run
- **Issue:** vitest's `bench()` throws "bench() is only available in benchmark mode" when run via `vitest run`. The plan requires both `bench(...)` and `it(...)` in the same file. The `describe('cache benchmarks')` block with only a `bench()` call caused "No test found in suite" error.
- **Fix:** Wrapped the benchmark `describe` in a conditional block using a `try/catch` probe: `try { bench('_probe', () => {}, ...) } catch { isBenchMode = false }`. The probe throws in run mode, isBenchMode stays false, and the describe block is not registered. The p95 gate `it()` block is in a separate `describe('cache benchmark gate')` that always runs.
- **Files modified:** web/tests/cache.bench.ts
- **Commit:** ef22798

**5. [Rule 3 - Blocking] web/vitest.config.ts needed for bench file inclusion**
- **Found during:** Task 3 — bench file not found by test runner
- **Issue:** Web package had no vitest.config.ts; used root config which has `include: ['src/**/*.test.ts', 'tests/**/*.test.ts', ...]` — `*.bench.ts` not matched.
- **Fix:** Created `web/vitest.config.ts` with `include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tests/**/*.bench.ts']`
- **Files modified:** web/vitest.config.ts (new)
- **Commit:** ef22798

**6. tsconfig.check.json (pre-existing root typecheck failures — out of scope)**
- **Finding:** Root `npm run typecheck` was already failing before this plan (scanner.ts, warningBag.test.ts, scanner.test.ts all have TS2835 under NodeNext moduleResolution). These are pre-existing issues.
- **Action per plan:** Added new cache files to exclude list (same TS2835 NodeNext pattern as pre-existing files). Pre-existing failures NOT fixed — out of scope per deviation rule scope boundary.
- **Logged to deferred-items:** Root tsconfig.check.json needs all `web/src/lib/*.ts` files that use bundler-moduleResolution imports to be excluded or imports to add `.js` extensions.

## Self-Check: PASSED

All key files confirmed created:
- web/src/lib/cacheSchema.ts ✓
- web/src/lib/cache.ts ✓
- web/src/lib/cache.test.ts ✓
- web/src/lib/cacheInvalidation.ts ✓
- web/src/lib/cacheInvalidation.test.ts ✓
- web/tests/cache.bench.ts ✓
- web/data/.gitkeep ✓
- web/vitest.config.ts ✓

All commits present: 15bed5a, fa27ea2, ef22798 ✓

70 web tests passing (`npx vitest run --root web`) ✓
403 root tests passing (`npx vitest run`) ✓
`cd web && npx tsc --noEmit` passes ✓
