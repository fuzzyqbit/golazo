---
phase: 02-render-pipeline
plan: "02"
subsystem: render
tags: [music, picker, determinism, manifest, zod, sha256, ffmpeg-fixtures]

requires:
  - phase: 02-render-pipeline
    plan: "01"
    provides: "remotion/theme barrel (no dependency on this plan's code)"
  - phase: 01-foundation-prepare-pipeline
    plan: "05"
    provides: "manifest.ts, hash.ts, errors.ts, PREP-07 idempotency contract"

provides:
  - loadMusicPool() — zod-validated index reader returning sorted MusicPoolEntry[]
  - pickTrack() — deterministic seeded music selection with trim-fade/reroll/crossfade strategies
  - MusicPoolEntry, musicPoolEntrySchema (src/render/musicPool.ts)
  - MusicPick, MusicPickStrategy, MUSIC_REROLL_LIMIT (src/render/musicPicker.ts)
  - MusicPoolError, MusicPickError (src/prepare/errors.ts)
  - musicSchema, extended manifestSchema with optional music block (src/prepare/manifest.ts)
  - 6 deterministic sine-tone mp3 fixtures + index.json (remotion/assets/music/)

affects: [02-04-render-driver, 03-publish-pipeline]

tech-stack:
  added: []
  patterns:
    - "sha256-seeded index derivation via BigInt modulo for overflow-safe pool indexing"
    - "Crossfade fallback: sort by durationSec desc + file asc tiebreak — deterministic longest-track selection"
    - "Additive manifest schema extension: musicSchema.optional() sibling of manifestHash, excluded from hash computation"
    - "MusicPoolError / MusicPickError following the single-line-message idiom established by ManifestError"

key-files:
  created:
    - remotion/assets/music/README.md
    - remotion/assets/music/index.json
    - remotion/assets/music/atmos-1.mp3
    - remotion/assets/music/atmos-2.mp3
    - remotion/assets/music/atmos-3.mp3
    - remotion/assets/music/atmos-4.mp3
    - remotion/assets/music/atmos-5.mp3
    - remotion/assets/music/atmos-6.mp3
    - src/render/musicPool.ts
    - src/render/musicPool.test.ts
    - src/render/musicPicker.ts
    - src/render/musicPicker.test.ts
  modified:
    - src/prepare/manifest.ts
    - src/prepare/manifest.test.ts
    - src/prepare/errors.ts

key-decisions:
  - "MusicPick shape: { track: string, durationSec: number, strategy: MusicPickStrategy, reroll: number } — Plan 02-04 imports this directly"
  - "Seed derivation contract: sha256(manifestHash + ':roll:' + r).slice(0,16) converted via BigInt modulo pool.length — Plan 02-04 MUST NOT reimplement or shortcut this logic"
  - "Crossfade fallback tiebreak: sort by durationSec desc, then by file asc — picks 'a.mp3' when all tracks share the same duration; pinned by test case 5"
  - "Picker does NOT re-sort the pool; sorting is loadMusicPool's responsibility — Plan 02-04 should pass loader output directly without re-sorting"
  - "music: musicSchema.optional() added at TOP LEVEL of manifestSchema alongside manifestHash; the render block is reserved for Plan 02-04 and lives as another sibling, NOT inside music"
  - "manifestHash is byte-identical with and without the music block — PREP-07 contract preserved; proven by manifest test case 14"
  - "MusicPickError re-exported from musicPicker.ts so callers don't need to reach into prepare/errors"

metrics:
  duration: "7min 13s"
  completed: "2026-05-14"
  tasks: 3
  files: 14

requirements-completed:
  - PREP-05
  - PREP-06
---

# Phase 2 Plan 02: Music Picker Summary

**Deterministic sha256-seeded music picker (trim-fade/reroll/crossfade), 6 sine-tone fixture tracks, zod-validated pool loader, and additive manifest music block — 27 new tests, 163 total passing**

## Performance

- **Duration:** 7 min 13 s
- **Started:** 2026-05-14T11:41:59Z
- **Completed:** 2026-05-14T11:49:12Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Six deterministic sine-tone mp3 fixtures (22.05kHz mono 32kbps) committed under `remotion/assets/music/` with an `index.json` metadata index and `README.md` documenting license, substitution recipe, and determinism
- `src/render/musicPool.ts`: `loadMusicPool()` reads and zod-validates `index.json`, asserts each declared `.mp3` exists on disk, sorts by file ascending — 10 unit tests pass
- `src/render/musicPicker.ts`: `pickTrack()` uses a sha256-seeded index with trim-fade / reroll / crossfade fallback; pure deterministic function with no side effects — 12 unit tests pass (including 10x determinism, cross-instance, and seed sensitivity checks)
- `src/prepare/manifest.ts` extended with `musicSchema` and optional `music` sibling block; `buildManifest` accepts optional music without disturbing `manifestHash` — 5 new manifest tests pass (total 15)
- `src/prepare/errors.ts` extended with `MusicPoolError` and `MusicPickError` following the single-line-message idiom

## Committed Fixture Durations

Actual ffprobe-reported durations committed in `remotion/assets/music/index.json`:

| File        | durationSec | Mood    | Strategy covered           |
|-------------|-------------|---------|----------------------------|
| atmos-1.mp3 | 200.072     | atmos   | trim-fade (≥180s episode)  |
| atmos-2.mp3 |  60.056     | atmos   | re-roll candidate          |
| atmos-3.mp3 | 240.065     | atmos   | trim-fade (longest)        |
| atmos-4.mp3 |  30.067     | driving | re-roll candidate (<60s)   |
| atmos-5.mp3 | 180.062     | uplift  | trim-fade (≥180s episode)  |
| atmos-6.mp3 |   8.072     | tense   | crossfade fallback (<10s)  |

## Task Commits

Each task was committed atomically:

1. **Task 1: mp3 fixture pool + index.json + README** — `bb7b213` (feat)
2. **Task 2: loadMusicPool + 10 unit tests + MusicPoolError/MusicPickError** — `cb12c96` (feat)
3. **Task 3: pickTrack + 12 unit tests + manifest extension + 5 manifest tests** — `ad22f8e` (feat)

## Contracts for Plan 02-04

### MusicPick shape (Plan 02-04 imports directly)

```typescript
interface MusicPick {
  track: string;          // pool entry file name, e.g. 'atmos-3.mp3'
  durationSec: number;    // pool entry duration (NOT episode duration)
  strategy: 'trim-fade' | 'reroll' | 'crossfade';
  reroll: number;         // 0 for first pick; N for the (N+1)-th attempt
}
```

### Seed derivation contract (MUST NOT be reimplemented)

```
seed_r = sha256(manifestHash + ':roll:' + r).digest('hex').slice(0, 16)
idx_r  = Number(BigInt('0x' + seed_r) % BigInt(pool.length))
```

BigInt is required — 16 hex chars = up to 2^64−1, which overflows Number.MAX_SAFE_INTEGER.

### Crossfade fallback tiebreak (pinned by test case 5)

Sort pool by `durationSec` descending, then by `file` ascending. For an all-equal-duration
pool `[a.mp3=8, b.mp3=8, c.mp3=8]` and totalDurationSec=100 → `track === 'a.mp3'`.

### Pool-order semantics

The picker does NOT re-sort the pool. `loadMusicPool()` sorts by file ascending before
returning. Plan 02-04 should pass the loader output directly to `pickTrack` without
re-sorting or filtering.

### Manifest music block placement

```
manifest.json
  ├── version: 1
  ├── kid: "leo"
  ├── game: { ... }
  ├── clips: [ ... ]
  ├── totalDurationSec: ...
  ├── manifestHash: "sha256:<hex>"   ← hash covers only clips + folderName
  └── music?: {                      ← optional; NOT included in manifestHash
        track, durationSec, strategy, reroll
      }
```

The `render` block reserved for Plan 02-04 will be a sibling of `music`, NOT nested inside it.

### PREP-07 hash preservation (verified by manifest test case 14)

`buildManifest({ ..., music: {...} }).manifestHash === buildManifest({ ... }).manifestHash`

The music block is deliberately excluded from `computeManifestHash`. Re-selecting a different
track does NOT invalidate the manifest — the operator can re-render with a different music
choice without triggering the "content changed" detection path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing re-export] MusicPickError re-exported from musicPicker.ts**
- **Found during:** Task 3 (GREEN phase — test case 7 imported MusicPickError from musicPicker.ts)
- **Issue:** The test file imports `MusicPickError` from `./musicPicker.js` per the plan's interfaces block, but the class lives in `../prepare/errors.ts`. Without a re-export, the import resolved to `undefined`.
- **Fix:** Added `export { MusicPickError } from '../prepare/errors.js'` to `musicPicker.ts`
- **Files modified:** `src/render/musicPicker.ts`
- **Commit:** `ad22f8e` (included in Task 3 commit)

---

Total deviations: 1 auto-fixed (Rule 2 — missing re-export required for correct module contract)

## Known Stubs

None. All modules are fully wired. The mp3 fixtures are test-tone placeholders for real
YouTube Audio Library tracks — this is intentional and documented in `remotion/assets/music/README.md`.
The operator will replace them before shipping to production (no future plan is required to
resolve this; it is an operator action).

## Self-Check: PASSED

All key files exist on disk. All 3 task commits verified in git history:
- `bb7b213` — Task 1: mp3 fixtures
- `cb12c96` — Task 2: loadMusicPool
- `ad22f8e` — Task 3: pickTrack + manifest extension
