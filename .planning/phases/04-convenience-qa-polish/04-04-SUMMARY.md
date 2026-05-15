---
phase: 04-convenience-qa-polish
plan: "04"
subsystem: qa
tags:
  - remotion
  - snapshots
  - pixelmatch
  - visual-regression
  - QA-03
  - PUB-05

dependency_graph:
  requires:
    - 04-02  # vitest config with remotion/ exclusion from line coverage
    - 04-03  # coverage audit confirmed 86.72% passes threshold
  provides:
    - QA-03  # Remotion compositions pinned by renderStill PNG snapshots at 1% threshold
    - PUB-05-override  # resumable-upload gap formally accepted as v1 override
  affects:
    - tests/snapshots/  # new visual regression test surface
    - .planning/phases/03-publish-pipeline/03-VERIFICATION.md  # status changed to passed

tech_stack:
  added:
    - pixelmatch@7.2.0 (devDep) — pixel-level PNG comparison
    - pngjs@7.0.0 (devDep) — PNG read/write for diff output
  patterns:
    - renderStill fixed-props snapshot pinning (Remotion headless renderer)
    - process-level bundle cache (bundleRemotion helper)
    - gitignored .diff/ dir for failure inspection artifacts

key_files:
  created:
    - tests/snapshots/_helpers.ts
    - tests/snapshots/snapshots.test.ts
    - tests/snapshots/README.md
    - tests/snapshots/Episode-titlecard.png
    - tests/snapshots/Thumbnail.png
    - scripts/regen-snapshots.ts
  modified:
    - package.json (pixelmatch + pngjs devDeps)
    - .gitignore (tests/snapshots/.diff/ added)
    - .planning/phases/03-publish-pipeline/03-VERIFICATION.md (PUB-05 override accepted)

decisions:
  - "EPISODE_TITLECARD_FRAME = 30: MOTION.titleCardFrames = 90 >= 60, so frame 30 chosen (plan spec). Midpoint would be 45; 30 sits in the first-third of the window — well before any clip sequence begins. Named constant committed in _helpers.ts."
  - "pixelmatch@7.2.0 + pngjs@7.0.0 installed as devDependencies. No production dependency added."
  - "PUB-05 option-a accepted: episodes ~50-200 MB on home/club network; multipart + 3-retry-from-zero is functionally adequate for v1. Resumable session refactor deferred to v2 if real-world fail rates warrant it."
  - "Baselines generated from fixed inputProps (Leo / FC Eagles / #10 / #ffce5a / 2026-05-13 vs united 3-1 W) — decoupled from fixture manifests so fixture rebuilds do not invalidate visual baselines."
  - "For renderStill at frame 30 (title-card window), clip video and music files are referenced in the component tree but not decoded by headless Chrome — absPath pointing to the committed fixture mp4 and music mp3 satisfies schema validation without serving bytes."

metrics:
  duration: "351s (~5 min 51s)"
  completed: "2026-05-15T02:59:18Z"
  tasks_completed: 3
  files_changed: 9
  tests_before: 385
  tests_after: 387
---

# Phase 4 Plan 4: Visual Snapshot Baselines + PUB-05 Override — Summary

One-liner: Committed renderStill PNG baselines (1920x1080 + 1280x720) with a 1% pixelmatch gate closing QA-03, plus PUB-05 resumable-upload accepted as a v1 override in 03-VERIFICATION.md.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install pixelmatch + pngjs; snapshot infrastructure (helper + regen script + baselines) | 65d8d51 | package.json, .gitignore, tests/snapshots/_helpers.ts, Episode-titlecard.png, Thumbnail.png, scripts/regen-snapshots.ts |
| Checkpoint | PUB-05 override decision (option-a accepted) | ea556dd | .planning/phases/03-publish-pipeline/03-VERIFICATION.md |
| 2 | Write snapshot pixel-diff test + README docs | 0e195db | tests/snapshots/snapshots.test.ts, tests/snapshots/README.md |

## Baseline PNGs at Commit Time

| File | Composition | Dimensions | File Size |
|------|-------------|------------|-----------|
| Episode-titlecard.png | Episode | 1920x1080 | 54.0 KB |
| Thumbnail.png | Thumbnail | 1280x720 | 74.6 KB |

**EPISODE_TITLECARD_FRAME = 30** — `MOTION.titleCardFrames = 90 >= 60`, so frame 30 chosen (plan spec constant). Sits in the first-third of the 90-frame title-card window; no clip or chapter sequence has started by this frame.

**pixelmatch version installed:** 7.2.0  
**pngjs version installed:** 7.0.0

## PUB-05 Decision

**Option selected:** option-a — Override accept

**Rationale recorded in 03-VERIFICATION.md:**
> Episodes are ~50-200 MB on home/club network. Multipart upload + 3-retry-from-zero policy is functionally adequate for the v1 operator workflow. The googleapis SDK upload path is well-tested and stable. Resumable session refactor (raw HTTP, drop SDK) is mechanical and can be revisited in v2 if real-world fail rates warrant it.

**File modified:** `.planning/phases/03-publish-pipeline/03-VERIFICATION.md`  
**Section updated:** frontmatter `status: gaps_found` → `status: passed`; `overrides_applied: 0` → `overrides_applied: 1`; override block added with `accepted_by` + `accepted_at`; gap entry changed to `status: override_accepted`.

## Phase 4 Hand-Off

All four ROADMAP Phase 4 success criteria are now closeable:

| SC | Description | Closed By |
|----|-------------|-----------|
| SC #1 | CLI convenience commands (`golazo prepare` + `golazo render` chained; `golazo publish` idempotent) | Plan 04-01 |
| SC #2 | QA audit: error messages + output strings present in all boundary modules | Plan 04-03 |
| SC #3 | Line coverage >= 80% gate wired in CI | Plan 04-02 (86.72%) |
| SC #4 | Remotion compositions pinned by committed renderStill PNG snapshots at 1% threshold | **This plan (QA-03)** |

**v1 milestone is ready to close.** Phase 3 verification is now `status: passed` with 1 documented override. All 4 Phase 4 success criteria satisfied. 387 tests passing. TypeScript clean.

## Test Suite After Plan

- Tests before: 385
- Tests after: 387 (+2 snapshot tests)
- All 32 test files passing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESM __dirname not available in module context**
- **Found during:** Task 1
- **Issue:** The project uses `"type": "module"` (ESM). `__dirname` is a CommonJS global not available in ESM at runtime.
- **Fix:** Added `fileURLToPath(import.meta.url)` + `dirname()` pattern to both `_helpers.ts` and `scripts/regen-snapshots.ts`. Applied `const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename);` at the top of each file.
- **Files modified:** tests/snapshots/_helpers.ts, scripts/regen-snapshots.ts
- **Commit:** 65d8d51

None other — plan executed as written.

## Known Stubs

None. All code paths are wired and exercised by the snapshot tests.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Snapshot rendering reads committed fixture clips and music assets from local disk via file:// paths — no external network access.

## Self-Check: PASSED

All files present and all commits found:
- tests/snapshots/_helpers.ts: FOUND
- tests/snapshots/snapshots.test.ts: FOUND
- tests/snapshots/README.md: FOUND
- tests/snapshots/Episode-titlecard.png: FOUND
- tests/snapshots/Thumbnail.png: FOUND
- scripts/regen-snapshots.ts: FOUND
- 04-04-SUMMARY.md: FOUND
- 65d8d51 (Task 1 feat): FOUND
- 0e195db (Task 2 test): FOUND
- ea556dd (checkpoint docs): FOUND
