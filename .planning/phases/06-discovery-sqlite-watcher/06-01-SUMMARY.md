---
phase: 06-discovery-sqlite-watcher
plan: "01"
subsystem: web/scanner
tags:
  - phase-06
  - scanner
  - filesystem
  - status-derivation
  - warningbag
  - episodeindex
  - golazo-root-walk
dependency_graph:
  requires:
    - "01-04: manifestSchema + manifestHash contract (computeManifestHash)"
    - "01-03: parseFilename + FilenameError"
    - "03-05: publishRecordSchema + publishRecord shape"
    - "05-01: npm workspaces symlink (@golazo/cli -> repo root)"
    - "05-02: D-08 import idiom (file:.. + @golazo/cli/dist/... subpaths)"
  provides:
    - "EpisodeIndex type (Plan 02 sqlite schema mirrors column-for-column)"
    - "ScanResult type (Plan 03 watcher + Plan 04 Next.js wiring consume)"
    - "scanGolazoRoot(absRootPath): ScanResult"
    - "WarningBag accumulator (Plan 04 stores as module-level variable)"
    - "web/tests/fixtures/golazo/ — 3-game fixture covering all statuses"
  affects:
    - "06-02: Plan 02 sqlite cache imports EpisodeIndex + scanGolazoRoot"
    - "06-03: Plan 03 watcher calls scanGolazoRoot on FS events"
    - "06-04: Plan 04 Next.js wiring calls scanGolazoRoot on startup"
tech_stack:
  added:
    - "web/src/lib/scanner.ts — pure sync scanner (node:fs, node:path)"
    - "web/src/lib/episodeIndex.ts — EpisodeIndex/EpisodeStatus/ScanResult types"
    - "web/src/lib/warningBag.ts — WarningBag accumulator"
  patterns:
    - "Two-level walk: absRootPath/<kid>/<game>/"
    - "safeParse-based schema validation (never throws on bad data)"
    - "WarningBag accumulator pattern (mutable arrays, no class)"
    - "Workspace import idiom: @golazo/cli/dist/..."
key_files:
  created:
    - web/src/lib/scanner.ts
    - web/src/lib/scanner.test.ts
    - web/src/lib/episodeIndex.ts
    - web/src/lib/warningBag.ts
    - web/src/lib/warningBag.test.ts
    - web/tests/fixtures/golazo/README.md
    - web/tests/fixtures/golazo/channels.yaml
    - web/tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/.golazo/manifest.json
    - web/tests/fixtures/golazo/leo/2026-05-20_vs_rivers_2-2/.golazo/manifest.json
    - web/tests/fixtures/golazo/mateo/2026-05-27_vs_dragons_4-0/.golazo/manifest.json
    - web/tests/fixtures/golazo/mateo/broken-folder-name/.golazo/manifest.json
    - "web/tests/fixtures/golazo/ (5 mp4 clips + 2 episode.mp4 + 2 thumb.png + 1 publish.json)"
  modified:
    - .gitignore (whitelist block for web/tests/fixtures/golazo/**)
decisions:
  - "D-scan-01: FIXTURE_ROOT resolved as join(__dirname, '../..', 'tests/fixtures/golazo') — two levels up from web/src/lib reaches web/, not repo root"
  - "D-scan-02: scanGameFolder uses safeParse (not readManifest/readPublishRecord) — those throw on invalid input; the scanner accumulates warnings instead"
  - "D-scan-03: Sandbox tests use cpSync which copies hidden .golazo/ directories — verified empirically"
metrics:
  duration: "9 min 26 s"
  completed: "2026-06-01"
  tasks_completed: 2
  files_created: 22
---

# Phase 6 Plan 01: Golazo Root Scanner Summary

Pure-sync filesystem scanner returning typed `EpisodeIndex[]` + `WarningBag` from
a two-level `<root>/<kid>/<game>/` walk, reusing `@golazo/cli` schemas verbatim.

## What Was Built

### EpisodeIndex shape (Plan 02 sqlite mirrors column-for-column)

```typescript
interface EpisodeIndex {
  manifestHash: string;       // 'sha256:<64hex>' — primary key
  kid: string;                // from path segment (NOT manifest body)
  gameFolder: string;         // basename of game folder
  absFolderPath: string;      // absolute path on disk
  date: string;               // YYYY-MM-DD from parseFilename
  opponent: string;           // slug from parseFilename
  scoreFor: number;
  scoreAgainst: number;
  result: 'W' | 'L' | 'D';
  status: EpisodeStatus;      // derived from filesystem, never stored
  thumbAbsPath: string | null;
  episodeAbsPath: string | null;
  publishVideoId: string | null;
  publishWatchUrl: string | null;
  clipCount: number;
  scannedAtMs: number;        // Date.now() at scan time — for cache invalidation
}
```

### Status derivation precedence (pinned by test case 8)

```
'published' = manifest + episode.mp4 + thumb.png + valid publish.json (4 artifacts)
'rendered'  = manifest + episode.mp4 + thumb.png              (3 artifacts)
'prepared'  = manifest only                                    (1 artifact)
```

Invalid `publish.json` falls back to `'rendered'` — row still appears in `episodes`,
`publishVideoId`/`publishWatchUrl` are null, `WarningBag.invalidPublishRecords` gains one entry.

### Ordering contract (pinned by test case 9)

Episodes sorted: **kid ascending** → **date descending** (newest first) → **gameFolder ascending**.

Plan 02's sqlite list query MUST emit the same order so cache and scanner produce identical lists.

Pinned sequence for the committed fixture:
1. `leo / 2026-05-20_vs_rivers_2-2` (rendered)
2. `leo / 2026-05-13_vs_united_3-1` (prepared)
3. `mateo / 2026-05-27_vs_dragons_4-0` (published)

### Workspace-import idiom confirmed

All three reused schemas import cleanly through the npm workspace symlink:

```typescript
import { parseFilename } from '@golazo/cli/dist/prepare/filename.js';
import { manifestSchema } from '@golazo/cli/dist/prepare/manifest.js';
import { publishRecordSchema } from '@golazo/cli/dist/publish/publishRecord.js';
```

Resolves via `node_modules/@golazo/cli → repo-root` set up in Plan 05-01 (D-08 idiom).

### WarningBag contract (D-20)

`WarningBag` is **in-memory only** — never persisted to sqlite. Plan 04 stores the
latest bag as a module-level variable on the cache singleton. A future Phase 7 dev
banner will expose it. sqlite contains only `EpisodeIndex` rows.

Three accumulator arrays:
- `brokenFolders` — folder basenames that fail `parseFilename`
- `invalidManifests` — manifests that fail JSON parse or `manifestSchema`
- `invalidPublishRecords` — publish.json files that fail JSON parse or `publishRecordSchema`

### Fixture coverage matrix

| Folder | Kid | Status | Artifacts |
|---|---|---|---|
| `leo/2026-05-13_vs_united_3-1` | leo | `prepared` | manifest.json only |
| `leo/2026-05-20_vs_rivers_2-2` | leo | `rendered` | manifest + episode.mp4 + thumb.png |
| `mateo/2026-05-27_vs_dragons_4-0` | mateo | `published` | all 4 + publish.json (videoId: dQw4w9WgXcQ) |
| `mateo/broken-folder-name` | mateo | DISC-05 warning | WarningBag.brokenFolders — not in episodes |

## Commits

| Task | Commit | Description |
|---|---|---|
| 1 | 011eac8 | feat(06-01): fixture tree + EpisodeIndex/WarningBag types + gitignore whitelist |
| 2 | ad519ee | feat(06-01): scanGolazoRoot + 13 table-driven tests (DISC-01 DISC-02 DISC-05) |

## Test Results

- **16 new Phase 6 Plan 01 tests** (13 scanner + 3 warningBag) — all passing
- **46 total web tests** — all passing
- **403 root tests** — all passing (zero regressions)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] FIXTURE_ROOT path traversal off-by-one**
- **Found during:** Task 2 (first test run)
- **Issue:** Test used `join(__dirname, '../../..', 'tests/fixtures/golazo')` which resolves from `web/src/lib/` three levels up to repo root, then `tests/fixtures/golazo` → `/tests/fixtures/golazo` (wrong — the web fixture is at `web/tests/fixtures/golazo`)
- **Fix:** Changed to `join(__dirname, '../..', 'tests/fixtures/golazo')` — two levels up from `web/src/lib/` reaches `web/`, correct base for web fixture
- **Files modified:** web/src/lib/scanner.test.ts
- **Commit:** ad519ee

**2. [Rule 3 - Blocking] Bad import in test (mkdirp not in node:fs)**
- **Found during:** Task 2 test authoring
- **Issue:** `mkdirp` imported from `node:fs` but doesn't exist — `mkdirSync` is the correct API
- **Fix:** Removed `mkdirp` from the import; all sandbox creation uses `mkdirSync({ recursive: true })`
- **Files modified:** web/src/lib/scanner.test.ts
- **Commit:** ad519ee

## Self-Check: PASSED

All key files exist and commits are present in git log.
