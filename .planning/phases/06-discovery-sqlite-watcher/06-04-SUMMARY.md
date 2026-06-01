---
phase: 06-discovery-sqlite-watcher
plan: "04"
subsystem: web/discovery-runtime
tags:
  - phase-06
  - startup
  - instrumentation
  - module-singleton
  - next-route-handler
  - debug-api
  - integration
  - disc-04
dependency_graph:
  requires:
    - "06-01: scanGolazoRoot + EpisodeIndex + ScanResult + WarningBag"
    - "06-02: openCache + closeCache + rebuildFromScan + queryAllEpisodes + DEFAULT_CACHE_DB_PATH"
    - "06-03: startWatcher + WatcherHandle (close/ready)"
    - "05-03: validateHostBinding + existing instrumentation.ts register() body"
  provides:
    - "getDiscoveryRuntime(opts?): Promise<DiscoveryRuntime> — lazy module-level singleton"
    - "shutdownDiscoveryRuntime(): Promise<void> — idempotent close; resets singleton for re-init"
    - "resolveGolazoRoot(env?): string — GOLAZO_ROOT override or ~/golazo default"
    - "getDiscoveryRuntimeStatus(): Promise<DiscoveryRuntimeStatus> — JSON-serializable status for debug route"
    - "DiscoveryRuntime interface: { cache, watcher, rootPath, dbPath, warnings, rootMissing }"
    - "DiscoveryRuntimeStatus interface: { rootPath, dbPath, episodeCount, warnings: counts, watcherReady, rootMissing }"
    - "GET /api/debug/discovery — returns DiscoveryRuntimeStatus JSON"
    - "DISC-01..05 all closed end-to-end via integration test"
  affects:
    - "Phase 07: dev banner will consume warnings.brokenFolders / warnings.invalidManifests counts"
    - "Phase 08: episode list page calls queryAllEpisodes via the cache singleton"
tech_stack:
  added:
    - "web/src/lib/discoveryRuntime.ts — module-level singleton (getDiscoveryRuntime + shutdownDiscoveryRuntime + resolveGolazoRoot + getDiscoveryRuntimeStatus)"
    - "web/src/app/api/debug/discovery/route.ts — GET handler returning DiscoveryRuntimeStatus"
    - "web/tests/discovery.integration.test.ts — end-to-end smoke spawning next dev"
  patterns:
    - "Dual-variable singleton: `runtime` (resolved state) + `initPromise` (in-flight state) — concurrent callers during init await the same promise, not duplicate sqlite opens"
    - "Fire-and-forget in register(): register() returns promptly; discovery init completes async; routes await getDiscoveryRuntime() directly"
    - "rootMissing path: openCache still succeeds (empty db), watcher=null, graceful degradation"
    - "SIGINT/SIGTERM handlers via process.once + signalHandlersInstalled flag: no duplicate handlers on re-init"
    - "serverExternalPackages in next.config.ts: marks better-sqlite3 + chokidar as external so Turbopack does not bundle native addons"
key_files:
  created:
    - web/src/lib/discoveryRuntime.ts
    - web/src/lib/discoveryRuntime.test.ts
    - web/src/app/api/debug/discovery/route.ts
    - web/tests/discovery.integration.test.ts
  modified:
    - web/instrumentation.ts (EXTENDED — Plan 05-03 validateHostBinding preserved + discovery init appended)
    - web/next.config.ts (serverExternalPackages added)
    - tsconfig.check.json (discoveryRuntime files excluded — same NodeNext TS2835 pattern)
    - web/.gitignore (web/ pattern added to block test artifact db)
decisions:
  - "D-04b: Dual-variable singleton pattern — both `runtime` (resolved) and `initPromise` (in-flight) are needed. A single-variable singleton would race when two requests arrive during initialization: caller A sets initPromise=null after resolving, caller B starts a duplicate init before A's runtime assignment. The dual-variable approach ensures concurrent callers share one in-flight init promise."
  - "D-04c: Fire-and-forget init in register() — register() must return promptly so Next.js can finish booting. Init failures are logged to console.error but do NOT throw out of register(). Routes that need the runtime await getDiscoveryRuntime() which returns the in-flight or resolved singleton."
  - "D-04d: serverExternalPackages=['better-sqlite3','chokidar'] in next.config.ts — Turbopack cannot bundle native addons (fsevents.js non-ESM chunk). Marking them external causes Next.js to require() them at runtime from node_modules. This is the standard Next.js pattern for native addons."
  - "D-04e: Integration test uses `npx next dev -p 4174 -H 127.0.0.1` with cwd=web/ — sidesteps web/package.json's hardcoded -p 4173 to avoid collision with any running dev server. Running from web/ ensures Next.js finds the app/ directory."
  - "D-04f: GOLAZO_ROOT tilde NOT expanded — env vars are absolute or relative paths; tilde expansion is a shell-ism. resolveGolazoRoot uses path.resolve so relative paths become absolute from cwd. Documented in resolveGolazoRoot JSDoc."
  - "D-20 CONFIRMED: WarningBag from per-event watcher rescans is discarded. This plan stores only the startup-scan WarningBag on the singleton. Phase 7 dev banner will surface brokenFolders + invalidManifests counts via /api/debug/discovery."
metrics:
  duration: "~9 min"
  completed: "2026-06-01"
  tasks_completed: 3
  files_created: 4
---

# Phase 6 Plan 04: Discovery Runtime Wiring Summary

Module-level singleton compositing Plans 01-03 (scanner + sqlite cache + chokidar watcher) into the Next.js process lifecycle via `instrumentation.ts`. `GET /api/debug/discovery` returns a live status snapshot. Integration test verifies end-to-end: initial scan (3 episodes + 1 broken folder), watcher-driven add (3→4 within 3 s), watcher-driven delete (4→3 within 3 s).

## What Was Built

### discoveryRuntime.ts — module-level singleton (Task 1)

```typescript
export interface DiscoveryRuntime {
  cache: Cache;
  watcher: WatcherHandle | null;  // null when rootPath does not exist on disk
  rootPath: string;
  dbPath: string;
  warnings: WarningBag;           // from startup scan; D-20: in-memory only
  rootMissing: boolean;
}

export interface DiscoveryRuntimeStatus {
  rootPath: string;
  dbPath: string;
  episodeCount: number;
  warnings: { brokenFolders: number; invalidManifests: number; invalidPublishRecords: number };
  watcherReady: boolean;
  rootMissing: boolean;
}

export function resolveGolazoRoot(env?: Record<string, string | undefined>): string;
export function getDiscoveryRuntime(opts?: { rootPath?: string; dbPath?: string }): Promise<DiscoveryRuntime>;
export function shutdownDiscoveryRuntime(): Promise<void>;
export async function getDiscoveryRuntimeStatus(): Promise<DiscoveryRuntimeStatus>;
```

**Dual-variable singleton pattern (D-04b):**

```typescript
let runtime: DiscoveryRuntime | null = null;
let initPromise: Promise<DiscoveryRuntime> | null = null;
```

`initPromise` prevents duplicate sqlite opens when two callers arrive during initialization. After the promise settles, `initPromise` is cleared so a post-shutdown re-init can build a fresh promise.

**rootMissing graceful path:** When `rootPath` does not exist, the runtime still opens the cache (empty db), sets `watcher=null`, and returns a valid DiscoveryRuntime. No crash.

**SIGINT/SIGTERM handlers:** Registered once via `process.once` + `signalHandlersInstalled` flag. Calls `shutdownDiscoveryRuntime()` which closes watcher then cache.

**resolveGolazoRoot resolution order:**
1. `env.GOLAZO_ROOT` (if set and non-empty) — passed through `path.resolve()`
2. `path.join(os.homedir(), 'golazo')` (default)

Tilde NOT expanded (shell-ism, not a path API responsibility).

### instrumentation.ts extension (Task 2)

Plan 05-03's `register()` is EXTENDED, not replaced. The existing `validateHostBinding` call (D-09, D-10) is preserved:

```typescript
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;  // D-09

  // Layer 2 of WEB-03 (D-10): abort on non-loopback HOST
  const { validateHostBinding } = await import('./src/lib/hostGuard');
  validateHostBinding(process.env.HOST);

  // Phase 6 Plan 04: fire-and-forget discovery init (D-04c)
  const { getDiscoveryRuntime } = await import('./src/lib/discoveryRuntime');
  void getDiscoveryRuntime().catch((err: unknown) => {
    console.error('[discoveryRuntime] init failed:', ...);
  });
}
```

### /api/debug/discovery route (Task 2)

```typescript
export const dynamic = 'force-dynamic';  // no caching — each call reflects live state
export const runtime = 'nodejs';         // better-sqlite3 + chokidar require Node.js

export async function GET(): Promise<Response> {
  const status = await getDiscoveryRuntimeStatus();
  return Response.json(status);
}
```

### Integration test (Task 3)

Three sequential cases in `describe.skipIf(GOLAZO_SKIP_DISCOVERY_INTEGRATION === '1')`:

| Test | Assertion | DISC-* |
|---|---|---|
| Initial scan | episodeCount=3, brokenFolders=1, watcherReady=true | 01, 02, 03, 05 |
| Add folder | episodeCount increments 3→4 within 3 s | 04 |
| Delete folder | episodeCount decrements 4→3 within 3 s | 04 |

Server spawned via `npx next dev -p 4174 -H 127.0.0.1` with `cwd=web/` and `GOLAZO_ROOT=<tmpdir sandbox>`.

## Commits

| Task | Commit | Description |
|---|---|---|
| 1 | 9f86192 | feat(06-04): discoveryRuntime singleton — cache+watcher+warnings composited |
| 2 | 8f45956 | feat(06-04): extend instrumentation.ts with discovery init + /api/debug/discovery route |
| 3 | b58fe3a | feat(06-04): discovery integration test — end-to-end DISC-01..05 via live Next.js server |

## Test Results

| Suite | Tests | Status |
|---|---|---|
| web/src/lib/discoveryRuntime.test.ts | 8 | All passing |
| web/tests/discovery.integration.test.ts | 3 | All passing |
| Total web (Plans 01-04) | 93 passed + 3 skipped | All passing |
| Root vitest (pre-existing) | 403 | All passing (no regressions) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Next.js Turbopack build failed: chokidar fsevents non-ESM chunk**
- **Found during:** Task 2 `npm run build` verification
- **Issue:** `cd web && npm run build` failed with "non-ecmascript placeable asset" for `fsevents.js`. Turbopack's ESM chunk bundler cannot statically inline chokidar's macOS native `fsevents` binary. Also: `process.stderr.write` in the dynamic import context of instrumentation.ts caused a Turbopack parse error.
- **Fix 1:** Added `serverExternalPackages: ['better-sqlite3', 'chokidar']` to `web/next.config.ts`. This is the standard Next.js pattern for native addons — marks them external so Next.js requires() them from node_modules at runtime rather than bundling.
- **Fix 2:** Changed `process.stderr.write(...)` to `console.error(...)` in the catch handler of `instrumentation.ts`.
- **Files modified:** web/next.config.ts, web/instrumentation.ts
- **Commit:** 8f45956

**2. [Rule 3 - Blocking] Integration test server spawn: wrong cwd caused "Couldn't find any pages or app directory"**
- **Found during:** Task 3 first test run
- **Issue:** The initial spawn used `npx --prefix web next dev` with `cwd: REPO_ROOT`. The `--prefix` flag tells npm where to find the binary, NOT where to run it. Next.js ran from the repo root and couldn't find the `src/app/` directory.
- **Fix:** Changed spawn to `npx next dev -p 4174 -H 127.0.0.1` with `cwd: WEB_DIR` (the `web/` directory). This is the correct pattern per the host-binding integration test precedent (Plan 05-03).
- **Files modified:** web/tests/discovery.integration.test.ts
- **Commit:** b58fe3a

**3. [Rule 2 - Missing] TypeScript type mismatch in resolveGolazoRoot signature**
- **Found during:** Task 1 `cd web && npx tsc --noEmit`
- **Issue:** Function signature used `NodeJS.ProcessEnv` which in TypeScript 6.0 requires `NODE_ENV` and other required properties. Test cases pass plain `{}` and `{ GOLAZO_ROOT: '/path' }` objects.
- **Fix:** Changed parameter type from `NodeJS.ProcessEnv` to `Record<string, string | undefined>`. The test calls use `as Record<string, string | undefined>` casts.
- **Files modified:** web/src/lib/discoveryRuntime.ts, web/src/lib/discoveryRuntime.test.ts
- **Commit:** 9f86192

**4. [Rule 3 - Blocking] Test artifact sqlite db created as web/web/data/index.db**
- **Found during:** Task 3 post-test cleanup check
- **Issue:** When next dev runs from `web/` directory, `DEFAULT_CACHE_DB_PATH = resolve(process.cwd(), 'web/data/index.db')` resolves to `web/web/data/index.db`. git status showed this as untracked.
- **Fix:** Added `web/` pattern to `web/.gitignore` to block the nested directory. This is the integration test artifact — the production operator runs `npm run web:dev` from repo root where `DEFAULT_CACHE_DB_PATH` correctly resolves to `web/data/index.db`.
- **Files modified:** web/.gitignore
- **Commit:** b58fe3a

## Known Stubs

None — all functionality is fully implemented, tested, and wired end-to-end.

## Threat Flags

No new network endpoints beyond `/api/debug/discovery` which was already planned. The route is read-only (GET only), returns no user data (only filesystem statistics), and is protected by the existing WEB-02 + WEB-03 localhost-bind gate. No new threat surface.

## Self-Check: PASSED

All key files confirmed created:
- web/src/lib/discoveryRuntime.ts ✓
- web/src/lib/discoveryRuntime.test.ts ✓
- web/src/app/api/debug/discovery/route.ts ✓
- web/tests/discovery.integration.test.ts ✓
- web/next.config.ts modified (serverExternalPackages) ✓
- web/instrumentation.ts extended (discovery init appended) ✓

Commits 9f86192, 8f45956, b58fe3a all present in git log ✓
93 web tests passing ✓
cd web && npx tsc --noEmit exits 0 ✓
cd web && npm run build exits 0 ✓
