---
phase: 06-discovery-sqlite-watcher
plan: "03"
subsystem: web/watcher
tags:
  - phase-06
  - chokidar
  - watcher
  - debounce
  - invalidation
  - sqlite-mutation
  - integration
  - disc-04
dependency_graph:
  requires:
    - "06-01: EpisodeIndex + scanGameFolder + GOLAZO_DOT_DIR + file constants"
    - "06-02: Cache interface + upsertEpisode + deleteEpisode + queryAllEpisodes + rebuildFromScan"
    - "06-02: cacheInvalidation.ts (peekManifestHashFromFile — available for future use)"
  provides:
    - "startWatcher({ cache, rootPath, rescan?, onChange? }): WatcherHandle"
    - "WatcherHandle.ready: Promise<void> — Plan 04 waits on this before signaling watcher armed"
    - "WatcherHandle.close(): Promise<void> — flushes pending + closes chokidar; idempotent"
    - "rescanGameFolder({ cache, absFolderPath, onChange? }): void — exported for Plan 04 startup wiring"
    - "WATCHER_DEBOUNCE_MS = 500 (D-18 LOCKED)"
    - "createPerFolderDebouncer(fn, windowMs): PerFolderDebouncer — pure per-key debounce logic"
    - "DISC-04 fully implemented: chokidar invalidates sqlite rows within 2 s of FS changes"
  affects:
    - "06-04: Plan 04 imports startWatcher + holds WatcherHandle singleton; calls handle.close() on shutdown"
tech_stack:
  added:
    - "chokidar ^3.6.0 (hoisted to root node_modules via npm workspace)"
    - "web/src/lib/watcherDebounce.ts — pure per-key debounce (createPerFolderDebouncer)"
    - "web/src/lib/watcherDebounce.test.ts — 7 unit tests (vi.useFakeTimers)"
    - "web/src/lib/watcher.ts — startWatcher + WatcherHandle + rescanGameFolder"
    - "web/src/lib/watcher.test.ts — 8 integration tests against tmp sandbox trees"
  patterns:
    - "Per-key debounce: Map<string, NodeJS.Timeout> — independent timers, no global coalescing"
    - "flush() fires all pending immediately before chokidar.close() — ensures drain on shutdown"
    - "gameFolderFromEventPath: derive canonical <root>/<kid>/<game> from any depth event path"
    - "queryAllEpisodes + JS filter by absFolderPath for delete-by-folder (< 1ms for 100 rows)"
    - "D-20 last-known-good hold: no cache mutation when folder still exists but scanGameFolder returns null"
    - "WatcherHandle.ready promise: chokidar.once('ready') wrapped in Promise<void>"
key_files:
  created:
    - web/src/lib/watcherDebounce.ts
    - web/src/lib/watcherDebounce.test.ts
    - web/src/lib/watcher.ts
    - web/src/lib/watcher.test.ts
  modified:
    - web/package.json (added chokidar ^3.6.0)
    - package-lock.json
decisions:
  - "D-18 LOCKED: 500ms per-folder debounce window. Rationale: chokidar fires multiple events per atomic write (manifest.json + episode.mp4 + thumb.png written together); 500ms collapse window catches all related events without delaying single-event responsiveness past the 2s target"
  - "D-20: WarningBag from per-event rescans is discarded. Plan 04 surfaces startup-scan warnings only; per-event warning surface has no UI in v2.0"
  - "close() calls debouncer.flush() BEFORE watcher.close() — pending rescans drain while cache + chokidar still attached. After flush, chokidar releases file descriptors"
  - "WatcherHandle.ready exposed for Plan 04 startup ordering — await before signaling watcher armed in debug API route"
  - "Delete semantics: chokidar fires unlinkDir AFTER dir is gone; queryAllEpisodes + filter by absFolderPath finds prior row. With Plan 02 < 50ms list query, JS filter on 100 rows is < 1ms"
  - "chokidar depth: 4 (covers <root>/<kid>/<game>/.golazo/<file>); awaitWriteFinish stabilityThreshold: 200ms keeps test wall-clock under 2.5s per case"
  - "Custom ignored predicate allows .golazo/ — chokidar's default regex strips ALL dotfiles which would silently break the entire watch model"
metrics:
  duration: "~12 min"
  completed: "2026-06-01"
  tasks_completed: 2
  files_created: 4
---

# Phase 6 Plan 03: Chokidar Watcher Summary

chokidar watcher wired to the Plan 02 sqlite cache: filesystem changes under
`<rootPath>/<kid>/<game>/.golazo/` mutate cache rows within 2 s via 500 ms
per-folder debounce (D-18 LOCKED) and `rescanGameFolder` single-folder rescan.

## What Was Built

### createPerFolderDebouncer (watcherDebounce.ts)

Pure per-key debounce with independent `Map<string, NodeJS.Timeout>` timers. No
global coalescing — different keys always trigger independently. API:

```typescript
interface PerFolderDebouncer {
  trigger(key: string): void;   // start/restart timer for key
  flush(): void;                 // synchronously fire all pending
  cancel(): void;                // drop all pending without firing
  pendingCount(): number;        // size of timer map (for tests)
}

function createPerFolderDebouncer(fn, windowMs): PerFolderDebouncer
```

### startWatcher (watcher.ts)

```typescript
export const WATCHER_DEBOUNCE_MS = 500;  // D-18 LOCKED

export interface WatcherHandle {
  close(): Promise<void>;   // flush() + watcher.close() — idempotent
  ready: Promise<void>;     // resolves on chokidar 'ready' event
}

export function startWatcher(opts: StartWatcherOpts): WatcherHandle;
export function rescanGameFolder(input: { cache, absFolderPath, onChange? }): void;
```

**chokidar options:**
- `ignoreInitial: true` — Plan 04 runs explicit `scanGolazoRoot + rebuildFromScan` on startup
- `depth: 4` — covers `<root>/<kid>/<game>/.golazo/<file>` (4 levels)
- Custom `ignored` predicate — allows `.golazo/` while blocking all other dotfiles/dotdirs
- `awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }` — atomic-write friendly

**rescanGameFolder flow:**
1. `scanGameFolder` with kid derived from path
2. If row returned: `upsertEpisode` + `onChange('upsert')`
3. If null + folder gone: `queryAllEpisodes` filter by `absFolderPath` + `deleteEpisode` each + `onChange('delete')`
4. If null + folder still exists: no-op (D-20 last-known-good hold)

### Test Coverage

| File | Tests | Description |
|---|---|---|
| `web/src/lib/watcherDebounce.test.ts` | 7 | Single trigger, rapid coalesce, independent keys, flush no-double-fire, cancel suppress, pendingCount track, async fn |
| `web/src/lib/watcher.test.ts` | 8 | Add folder, delete folder, mtime touch re-upsert, rapid coalesce, independent folders, close flush, broken manifest, unknown-kid path |
| Total (Plan 03) | 15 | All passing |
| Total (Phase 6 Plan 01+02+03) | 85 | All passing (web) |

## Commits

| Task | Commit | Description |
|---|---|---|
| 1 | 52c9458 | feat(06-03): add chokidar dep + createPerFolderDebouncer + 7 unit tests (D-18) |
| 2 | 0fbc428 | feat(06-03): implement startWatcher + 8 integration tests (DISC-04) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript 6.0 noUncheckedIndexedAccess: array element access returns `T | undefined`**
- **Found during:** Task 2 (tsc --noEmit after implementing watcher.ts)
- **Issue:** `segments[0]` and `segments[1]` typed as `string | undefined` in TS 6.0 with `noUncheckedIndexedAccess` enabled; `path.join()` requires `string`, causing TS2345 error
- **Fix:** Extracted to `const seg0 = segments[0]; const seg1 = segments[1]` with explicit `undefined` checks before use
- **Files modified:** web/src/lib/watcher.ts
- **Commit:** 0fbc428

### Pre-existing Out-of-Scope Issue (deferred)

`src/cli/all.integration.test.ts` — one integration test (`--force RE-RUNS ALL THREE`) flaps with a 120s timeout when run as part of the full root vitest suite. This is a pre-existing issue (network-dependent test tries to download music assets via a local server that may not be running). Not caused by Plan 03. Logged to deferred-items.

## Self-Check: PASSED

- web/src/lib/watcherDebounce.ts ✓
- web/src/lib/watcherDebounce.test.ts ✓
- web/src/lib/watcher.ts ✓
- web/src/lib/watcher.test.ts ✓
- web/package.json has chokidar ^3.6.0 ✓
- Commits 52c9458, 0fbc428 ✓
- 85 web tests passing ✓
- cd web && npx tsc --noEmit passes ✓
