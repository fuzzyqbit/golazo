---
phase: 02-render-pipeline
plan: "04"
subsystem: rendering
tags: [remotion, typescript, vitest, commander, zod, ffmpeg, ffprobe]

requires:
  - phase: 01-foundation-prepare-pipeline
    provides: runPrepare, manifest schema, clip probing, channel config loader, music pool + picker
  - phase: 02-render-pipeline (01-03)
    provides: remotion compositions (Episode + Thumbnail), theme tokens, timing/rhythm/musicVolume modules

provides:
  - runRender orchestrator (src/render/driver.ts) — manifest-based idempotency, Remotion bundle+render, music pick, render block write
  - prettyOpponent helper (src/render/opponentPretty.ts) — title-case + acronym allow-list
  - renderSchema manifest extension — render block as top-level sibling of manifestHash + music
  - RenderError class (src/prepare/errors.ts) — 8th error class
  - Real CLI render handler replacing Plan 01-01 stub (src/cli/commands/render.ts)
  - CLI integration tests for render (src/cli/render.integration.test.ts)

affects: [03-publish-pipeline, 04-convenience-qa-polish]

tech-stack:
  added: []
  patterns:
    - Local HTTP file server (http.createServer) for Remotion headless renderer — file:// URLs break headless Chrome
    - Bundle memo cache with RENDER_BUNDLE_NOCACHE env var override
    - Chromium availability guard in integration tests (ensureBrowser + skip-if-unavailable)
    - CLI shell-out integration test pattern (execFile + HOME=$PWD) extended to render command

key-files:
  created:
    - src/render/driver.ts
    - src/render/driver.test.ts
    - src/render/opponentPretty.ts
    - src/render/opponentPretty.test.ts
    - src/render/index.ts
    - src/cli/render.integration.test.ts
  modified:
    - src/prepare/manifest.ts (renderSchema + render block in manifestSchema + buildManifest)
    - src/prepare/manifest.test.ts (cases 16-22)
    - src/prepare/errors.ts (RenderError class)
    - src/cli/commands/render.ts (stub replaced with real handler)
    - src/cli/index.test.ts (render removed from stub assertions; registration-only test added)
    - remotion/Episode.tsx (http/https URL passthrough fix)
    - remotion/components/Clip.tsx (http/https URL passthrough fix)

key-decisions:
  - "Remotion headless renderer requires HTTP URLs: renderMedia/renderStill cannot fetch file:// assets via Node's http.get(); local HTTP server on port 0 (OS-assigned) serves clips and music during render, then is closed in a finally block"
  - "hash-changed detection when episode.mp4 exists but manifest.render is absent: runPrepare re-run clears the render block, but the file is still on disk; check existsSync(episodePath) to distinguish first-render from hash-changed"
  - "prettyOpponent under src/render/ not src/shared/ — Phase 3 PUB-03 imports from there or moves it; marker left in SUMMARY"
  - "renderSchema fields: episodePath + thumbnailPath validated by regex to canonical .golazo/ paths; renderedAt via z.string().datetime(); manifestHash via sha256:[0-9a-f]{64} regex"
  - "PREP-07 preserved end-to-end: render block is a TOP-LEVEL sibling of manifestHash; computeManifestHash inputs unchanged; task 1 case 21 + task 2 case 7 assert this invariant"
  - "CLI output strings frozen for Phase 3 chain parsing: episode rendered / render up to date / episode re-rendered (content changed) / episode re-rendered (force)"

patterns-established:
  - "Local file server pattern: createServer on port 0, urlFor(absPath) returns http://127.0.0.1:<port>/<absPath>, closed in finally — reusable for future Remotion workloads"
  - "RenderResult reason enum (first-render | hash-match | hash-changed | force | missing-render-block) — all callers switch on reason for output"

requirements-completed:
  - REN-06

duration: 18min
completed: "2026-05-13"
---

# Phase 02 Plan 04: Render Driver + CLI Handler Summary

**runRender orchestrator wiring Plans 02-01..02-03 into `golazo render <folder>` end-to-end: local HTTP file server for Remotion headless renderer, manifest-based idempotency by manifestHash, --force re-render, and CLI handler replacing the Plan 01-01 stub**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-13T22:26:45Z
- **Completed:** 2026-05-13T22:45:00Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- `runRender` 16-step orchestrator: read manifest → load channel → load music pool → pick track → idempotency check → bundle Remotion → build inputProps → selectComposition → renderMedia → renderStill → ffprobe → buildManifest → invariant check → writeManifest
- Manifest schema extended with `render: renderSchema.optional()` sibling block; PREP-07 hash invariant preserved (case 21 hash-preservation gate + case 7 driver invariant test)
- `golazo render <folder>` CLI handler replaces Plan 01-01 stub; 4 CLI shell-out integration tests pass (Chromium-gated cases 1-3, unconditional case 4)
- 215 tests across 19 test files all pass

## Task Commits

Each task was committed atomically:

1. **Task 1: prettyOpponent helper + manifest render schema + RenderError** - `c83228b` (feat)
2. **Task 2: runRender orchestrator + integration tests (7 cases)** - `e03e059` (feat)
3. **Task 3: replace render stub with real CLI handler + CLI integration tests** - `c7c1dc5` (feat)

## Files Created/Modified

- `src/render/driver.ts` — runRender orchestrator with 16-step algorithm, local HTTP file server, bundle memo cache
- `src/render/driver.test.ts` — 7 integration tests (cases 1-7; Chromium-gated 1-3,5-7; unconditional 4)
- `src/render/opponentPretty.ts` — prettyOpponent(slug) + ACRONYM_ALLOW_LIST (sc, fc, ac)
- `src/render/opponentPretty.test.ts` — 8 table-driven cases
- `src/render/index.ts` — barrel exporting loadMusicPool, pickTrack, runRender, prettyOpponent
- `src/cli/render.integration.test.ts` — 4 CLI shell-out integration tests
- `src/prepare/manifest.ts` — renderSchema + render block in manifestSchema + BuildManifestInput + buildManifest
- `src/prepare/manifest.test.ts` — cases 16-22 (schema accept/reject + hash preservation gate)
- `src/prepare/errors.ts` — RenderError (8th error class)
- `src/cli/commands/render.ts` — real handler replacing Plan 01-01 stub
- `src/cli/index.test.ts` — render removed from stub assertions; registration-only test added
- `remotion/Episode.tsx` — http/https URL passthrough fix for music src
- `remotion/components/Clip.tsx` — http/https URL passthrough fix for video src

## Decisions Made

**Frozen manifest schema (Phase 3 adds `publish?` as next sibling):**
```
{ version, kid, game, clips, totalDurationSec, manifestHash, music?, render? }
```

**render block contract:**
```typescript
render: {
  episodePath: '.golazo/episode.mp4',   // canonical — regex-validated
  thumbnailPath: '.golazo/thumb.png',   // canonical — regex-validated
  renderedAt: string,                   // ISO 8601 UTC
  manifestHash: string,                 // copy of top-level hash at render time
  width: number,                        // 1920 (prod) or 320 (lowRes)
  height: number,                       // 1080 (prod) or 180 (lowRes)
  durationSec: number,                  // ffprobe-confirmed post-render
}
```

**ARCHITECTURAL CONFIRMATION:** `manifestHash` lives at TOP LEVEL; `render` is a SIBLING (NOT a parent). Plan 01-05 hard contract preserved. `computeManifestHash` inputs unchanged.

**Idempotency invariants:**
- Skip path: `manifest.render.manifestHash === manifest.manifestHash` AND `existsSync(episodePath) && existsSync(thumbnailPath)`
- Missing-file recovery: warn to stderr and re-render (not a hard error)
- Invariant assertion in step 14: throws RenderError if `extendedManifest.manifestHash !== manifest.manifestHash`

**Music-selection contract:** `pickTrack({ manifestHash, totalDurationSec, pool })` is the single source of truth. Seed = `manifestHash` guarantees cross-machine byte stability.

**Remotion 4.x point release:** `@remotion/*@^4.0.461` installed.

**Type-check config:** `tsconfig.check.json` (introduced by Plan 02-01) covers `src/` + `remotion/`. Base `tsconfig.json` unchanged. `npm run typecheck` → `tsc --noEmit -p tsconfig.check.json`.

**CLI handler output strings (frozen for Phase 3/4 chain parsing):**
- first-render: `episode rendered → <episodePath> + <thumbnailPath> (<durationSec>s)`
- hash-match:   `render up to date (hash matches)`
- hash-changed: `episode re-rendered (content changed) → <episodePath>`
- force:        `episode re-rendered (force) → <episodePath>`

**prettyOpponent location:** `src/render/opponentPretty.ts`. Phase 3 PUB-03 imports the same helper. If Phase 3 moves it to `src/shared/`, update the import in `src/render/driver.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Remotion headless renderer cannot fetch file:// URLs**
- **Found during:** Task 2 (runRender orchestrator)
- **Issue:** `renderMedia` called by Remotion's headless Chrome renderer, which downloads assets via `http.get()`. `file://` URLs are not supported. Error: `Can only download URLs starting with http:// or https://`
- **Fix:** Added local HTTP file server (`createServer` on port 0) in `startFileServer()`. All clip and music `absPath` values passed as `http://127.0.0.1:<port>/<absPath>` in inputProps. Server closed in `finally` block after render.
- **Files modified:** `src/render/driver.ts`, `remotion/Episode.tsx`, `remotion/components/Clip.tsx`
- **Verification:** All 7 driver integration tests pass; case 1 produces valid episode.mp4 + thumb.png
- **Committed in:** `e03e059` (Task 2 commit)

**2. [Rule 1 - Bug] Episode.tsx and Clip.tsx corrupted HTTP URLs**
- **Found during:** Task 2 (after fix 1)
- **Issue:** Both components had `absPath.startsWith('file://')` guard only — an http:// URL would get `file://` prepended, producing `file://http://127.0.0.1:PORT/...`
- **Fix:** Added `startsWith('http://')` and `startsWith('https://')` checks before the `file://` fallback in both components
- **Files modified:** `remotion/Episode.tsx`, `remotion/components/Clip.tsx`
- **Verification:** Integration tests pass; music and video assets load correctly
- **Committed in:** `e03e059` (Task 2 commit)

**3. [Rule 1 - Bug] hash-changed detection when episode.mp4 exists but manifest.render is absent**
- **Found during:** Task 2 (case 5 test)
- **Issue:** After `runPrepare` re-runs on modified clips it writes a fresh manifest WITHOUT the render block. The driver logic saw `!manifest.render` and returned `first-render`. But `episode.mp4` already existed on disk, making it semantically `hash-changed`.
- **Fix:** Added `existsSync(episodeAbsPath)` check in the no-render-block branch: `reason = existsSync(episodeAbsPath) ? 'hash-changed' : 'first-render'`
- **Files modified:** `src/render/driver.ts`
- **Verification:** Case 5 test asserts `result.reason === 'hash-changed'` and passes
- **Committed in:** `e03e059` (Task 2 commit)

**4. [Rule 1 - Bug] Case 4 test assertion wrong substring**
- **Found during:** Task 2 (test debug)
- **Issue:** `expect(e.message).toContain("run 'golazo prepare'")` failed — the actual message ends with `run 'golazo prepare <folder>' first`, so `'golazo prepare'` without the closing quote is a valid substring but the original assertion had the closing quote before `<folder>`.
- **Fix:** Changed assertion to `toContain('golazo prepare')` (no closing quote before the substring ends)
- **Files modified:** `src/render/driver.test.ts`
- **Verification:** Case 4 passes unconditionally
- **Committed in:** `e03e059` (Task 2 commit)

**5. [Rule 1 - Bug] Plan 01-01 CLI smoke test included render in stub assertions**
- **Found during:** Task 3
- **Issue:** `src/cli/index.test.ts` had `['render', './nope']` in the `it.each` that checks for `"render: not yet implemented"`. After replacing the stub, that test failed.
- **Fix:** Removed render from the stub `it.each` table; added a registration-only test for render asserting `_actionHandler` is a function
- **Files modified:** `src/cli/index.test.ts`
- **Verification:** All 215 tests pass
- **Committed in:** `c7c1dc5` (Task 3 commit)

---

**Total deviations:** 5 auto-fixed (4 Rule 1 bugs, 1 Rule 1 test fix)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep. The file-server deviation is the most architecturally significant — it is the canonical solution to Remotion's headless-renderer HTTP requirement and is documented for Phase 4 QA.

## Issues Encountered

- Webpack bundle failing with `.js` imports from `remotion/Root.tsx`: resolved by passing `webpackOverride` with `extensionAlias: { '.js': ['.ts', '.tsx', '.js'] }` to `bundle()` (same pattern as `remotion.config.ts` from Plan 02-03)
- Sandbox path format for `resolveKidFromPath`: tests must use `<tmpHome>/golazo/leo/2026-05-13_vs_united_3-1/` structure matching production `~/golazo/<kid>/<game-folder>/` layout

## Known Stubs

None — all render paths are fully wired. No hardcoded empty values or placeholder text in plan output files.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes. The local HTTP file server binds to 127.0.0.1 only and serves read-only filesystem paths for the duration of a render job.

## Deferred Polish Items (Not Blocking)

- 6+-clip companion fixture for success-criterion-4 visual verification (Phase 4 QA-03)
- Music volume boundary ramp in `remotion/composition/musicVolume.ts` (step-function ships; fps param reserved)
- Chromium eager pre-download on `npm install` postinstall hook (currently lazy on first render)

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 2 complete. `golazo render <folder>` is fully wired end-to-end on macOS.

Phase 3 (Publish Pipeline) can begin. Readiness:
- `runRender` exports `RenderResult` with `episodePath`, `thumbnailPath`, and `manifest.render.durationSec` — all needed for `videos.insert` metadata
- `manifest.music` block (track, durationSec, strategy, reroll) is populated after render
- `channels.yaml` → `loadChannel(kid)` → `channel.youtube.oauth_token` path is wired and tested
- `prettyOpponent` helper at `src/render/opponentPretty.ts` is importable by Phase 3 PUB-03 without duplication
- CLI output strings frozen — Phase 3's `golazo all` chain can parse them

---
*Phase: 02-render-pipeline*
*Completed: 2026-05-13*

## Self-Check: PASSED

Files exist:
- FOUND: /Users/me/Documents/code/golazo/src/render/driver.ts
- FOUND: /Users/me/Documents/code/golazo/src/render/driver.test.ts
- FOUND: /Users/me/Documents/code/golazo/src/render/opponentPretty.ts
- FOUND: /Users/me/Documents/code/golazo/src/render/index.ts
- FOUND: /Users/me/Documents/code/golazo/src/cli/render.integration.test.ts
- FOUND: /Users/me/Documents/code/golazo/src/prepare/errors.ts (RenderError)

Commits verified:
- c83228b: feat(02-04): prettyOpponent helper + manifest render schema + RenderError
- e03e059: feat(02-04): runRender orchestrator + integration tests (7 cases)
- c7c1dc5: feat(02-04): replace render stub with real CLI handler + CLI integration tests
