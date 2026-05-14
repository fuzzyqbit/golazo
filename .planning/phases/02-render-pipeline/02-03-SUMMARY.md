---
phase: 02-render-pipeline
plan: "03"
subsystem: remotion
tags: [remotion, compositions, timeline, chapter-rhythm, music-ducking, tdd, rен-01, ren-02, ren-04, ren-05]

requires:
  - phase: 02-render-pipeline
    plan: "01"
    provides: "remotion/theme barrel (COLORS, TYPOGRAPHY, LAYOUT, MOTION, loadFonts, getCinematicGradeStyle, getVignetteOverlayStyle)"
  - phase: 02-render-pipeline
    plan: "02"
    provides: "MusicPick, MusicPickStrategy, musicSchema (inputProps.music.strategy enum)"
  - phase: 01-foundation-prepare-pipeline
    plan: "05"
    provides: "manifest.ts Manifest type shape (kid + game + clips)"

provides:
  - remotion/composition/chapterRhythm.ts — computeChapterRhythm, shouldRenderChapterCardBefore, ChapterRhythm
  - remotion/composition/timing.ts — computeEpisodeTimeline, getClipPlayback, EpisodeTimeline, EpisodeSegment, ClipPlayback
  - remotion/composition/musicVolume.ts — musicVolumeAtFrame, MUSIC_VOLUME_MUTED/DUCKED/BASELINE (REN-04 pure step-function)
  - remotion/composition/inputProps.ts — episodeInputPropsSchema, thumbnailInputPropsSchema, EpisodeInputProps, ThumbnailInputProps
  - remotion/components/TitleCard.tsx — opening title card (REN-01, REN-03)
  - remotion/components/ChapterCard.tsx — chapter divider card (REN-02)
  - remotion/components/Clip.tsx — video clip with cinematic grade (REN-01)
  - remotion/components/Outro.tsx — closing outro card (REN-01)
  - remotion/Episode.tsx — top-level episode composition (REN-01, REN-04)
  - remotion/Thumbnail.tsx — single-frame thumbnail composition (REN-05)
  - remotion/Root.tsx — registerRoot + Composition registration
  - remotion.config.ts — CLI entrypoint + webpack extensionAlias override

affects: [02-04-render-driver, 03-publish-pipeline, 04-qa-polish]

tech-stack:
  added:
    - "@remotion/cli@4.0.461"
    - "@remotion/bundler@4.0.461"
    - "@remotion/renderer@4.0.461"
  patterns:
    - "Pure timeline computation module (computeEpisodeTimeline) — no React, no Remotion, fully unit-testable under vitest"
    - "REN-04 ducking as pure step-function in musicVolume.ts — Episode.tsx imports it, never redefines inline"
    - "Math.ceil frame conversion for clip durations — first clip doubled for slo-mo (0.5x playbackRate)"
    - "webpack extensionAlias override in remotion.config.ts — maps .js -> [.ts, .tsx, .js] for NodeNext compatibility"
    - "delayRender/continueRender for font loading in Root.tsx"
    - "calculateMetadata on Episode composition derives durationInFrames from computeEpisodeTimeline"

key-files:
  created:
    - remotion/composition/chapterRhythm.ts
    - remotion/composition/chapterRhythm.test.ts
    - remotion/composition/timing.ts
    - remotion/composition/timing.test.ts
    - remotion/composition/musicVolume.ts
    - remotion/composition/__tests__/musicVolume.test.ts
    - remotion/composition/inputProps.ts
    - remotion/components/TitleCard.tsx
    - remotion/components/ChapterCard.tsx
    - remotion/components/Clip.tsx
    - remotion/components/Outro.tsx
    - remotion/Episode.tsx
    - remotion/Thumbnail.tsx
    - remotion/Root.tsx
    - remotion.config.ts
  modified:
    - tsconfig.check.json
    - package.json
    - package-lock.json

key-decisions:
  - "EpisodeTimeline frame conversion: Math.ceil(durationSec * fps) — ceil prevents clip cutoff; first clip doubled for slo-mo (playbackRate=0.5)"
  - "musicVolumeAtFrame step-function uses half-open intervals [startFrame, startFrame+duration) — boundary frame belongs to STARTING segment (pinned by test cases 7+8)"
  - "webpack extensionAlias: { '.js': ['.ts', '.tsx', '.js'] } in remotion.config.ts — required because NodeNext module resolution uses .js extensions in imports but webpack does not remap .js -> .ts by default"
  - "tsconfig.check.json extended with jsx:react-jsx + lib:DOM — required for .tsx files to typecheck; base tsconfig.json unchanged (Phase 1 bin contract preserved)"
  - "Remotion 4.0.461 installed (all four @remotion/* packages pinned to same point release — zod 4.3.6 vs 4.4.3 version mismatch produces a non-fatal warning only)"
  - "Clip src URL convention: absPath passed as plain absolute path; JSX wraps as file:// in Clip.tsx — Plan 02-04 must pass plain absolute paths (not file:// URLs)"
  - "Music volume boundary ramp DEFERRED — step-function ships as-is; fps parameter reserved in signature for future ramp; Phase 4 polish can add without changing call sites"
  - "Opponent string in episodeInputPropsSchema is pretty-printed (title-case) — Plan 02-04 implements pretty-print helper inline; Phase 3 (PUB-03) will consolidate"

metrics:
  duration: "9min 30s"
  completed: "2026-05-14"
  tasks: 2
  files: 17

requirements-completed:
  - REN-01
  - REN-02
  - REN-04
  - REN-05
---

# Phase 2 Plan 03: Remotion Compositions Summary

**Episode + Thumbnail compositions + 4 component files + pure-logic timeline/rhythm/ducking modules — 25 new tests, 188 total passing; both compositions registered and verified via `npx remotion compositions`**

## Performance

- **Duration:** 9 min 30 s
- **Started:** 2026-05-14T11:52:33Z
- **Completed:** 2026-05-14T12:02:03Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments

- Pure-logic module suite: `chapterRhythm.ts` (REN-02), `timing.ts` (REN-01), `musicVolume.ts` (REN-04), `inputProps.ts` — fully unit-tested under vitest without any Remotion runtime
- 25 new tests across 3 test files: 8 chapter-rhythm cases (including success-criterion-4 card-count assertion), 9 timing cases (empty-clips guard, single/3/6-clip layouts, monotonicity, first-clip doubling, custom fps), 8 musicVolume cases (muted/ducked/baseline coverage + boundary semantics)
- 4 Remotion component files: TitleCard (fade-in), ChapterCard (accent divider), Clip (OffthreadVideo + grade + vignette), Outro (fade-out)
- Episode.tsx: sequences TitleCard -> (ChapterCard -> Clip)* -> Outro via `<Sequence>`; `<Audio>` volume driven by `musicVolumeAtFrame` imported from `musicVolume.ts` (Finding-3 fix — NOT inline)
- Thumbnail.tsx: 1-frame 1280x720 composition with score as visual anchor
- Root.tsx: `registerRoot(RemotionRoot)` + Episode (1920x1080@30fps, calculateMetadata) + Thumbnail (1280x720, 1 frame)
- `npx remotion compositions remotion/Root.tsx` lists both `Episode` and `Thumbnail`

## Contracts for Plan 02-04

### EpisodeTimeline shape

```typescript
interface EpisodeTimeline {
  fps: number;
  totalDurationInFrames: number;
  segments: EpisodeSegment[];
}

interface EpisodeSegment {
  kind: 'title' | 'chapter' | 'clip' | 'outro';
  startFrame: number;
  durationInFrames: number;
  clipIndex?: number;    // clip segments only
  nextClipIndex?: number; // chapter segments only
}
```

### Frame conversion rule (pinned by timing.test.ts)

`durationInFrames = Math.ceil(durationSec * fps)`

First clip is doubled: `Math.ceil(clips[0].durationSec * fps) * 2`

### Music volume rule (pinned by musicVolume.test.ts)

Step-function in `remotion/composition/musicVolume.ts`:
- `MUSIC_VOLUME_MUTED = 0` — first slo-mo clip
- `MUSIC_VOLUME_DUCKED = 0.2` — subsequent clips
- `MUSIC_VOLUME_BASELINE = 0.7` — title / chapter / outro

Boundary semantics: half-open intervals `[startFrame, startFrame+duration)`. Boundary frame belongs to the STARTING segment.

### musicVolumeAtFrame boundary semantics (pinned by cases 7+8)

```
frame === 135 -> MUSIC_VOLUME_MUTED (first frame of clip0, chapter card ended at 135)
frame === 90  -> MUSIC_VOLUME_BASELINE (first frame of chapter card, title ended at 90)
```

### Chapter rhythm rule (pinned by chapterRhythm.test.ts)

```
totalClips <= 5 -> 'every-clip'  (5 cards for 5 clips)
totalClips >  5 -> 'every-3'    (cards before clips 0, 3, 6, 9, ...)
```

### Clip src URL convention

`absPath` is a plain absolute filesystem path. The JSX wraps it as `file://${absPath}` inside `Clip.tsx`. Plan 02-04's driver must pass plain absolute paths (NOT `file://` URLs) so the convention lives in one place.

### Opponent pretty-printing convention

The `episodeInputPropsSchema.game.opponent` field is a PRETTY-PRINTED name (e.g. `'United'`, `'City SC'`), not the raw filename slug. Plan 02-04 will implement a local pretty-print helper: title-case + hyphen-to-space + acronym allow-list `['sc', 'fc', 'ac']`. Phase 3 (PUB-03) will consolidate.

### Remotion version installed

`remotion@4.0.461`, `@remotion/cli@4.0.461`, `@remotion/bundler@4.0.461`, `@remotion/renderer@4.0.461`

Note: Remotion 4.0.461 expects `zod@4.3.6` but project has `zod@4.4.3`. This produces a non-fatal warning in `npx remotion compositions` output. The composition listing succeeds and rendering will work.

## Task Commits

Each task was committed atomically (TDD with separate RED + GREEN commits for Task 1):

1. **Task 1 RED: failing tests for chapterRhythm, timing, musicVolume** — `5835745` (test)
2. **Task 1 GREEN: pure-logic composition modules + remotion.config.ts** — `7dae4f7` (feat)
3. **Task 2: Remotion compositions, components, Root registration** — `39bcf5e` (feat)

## Files Created/Modified

**New files:**
- `remotion/composition/chapterRhythm.ts` — computeChapterRhythm (<=5 every-clip, >5 every-3) + shouldRenderChapterCardBefore
- `remotion/composition/chapterRhythm.test.ts` — 8 test cases including card-count success criterion
- `remotion/composition/timing.ts` — computeEpisodeTimeline + getClipPlayback; ceil frame conversion; first-clip doubling
- `remotion/composition/timing.test.ts` — 9 test cases including monotonicity, doubling, custom fps
- `remotion/composition/musicVolume.ts` — musicVolumeAtFrame step-function (REN-04); three volume constants; React-free
- `remotion/composition/__tests__/musicVolume.test.ts` — 8 test cases covering muted/ducked/baseline/boundary
- `remotion/composition/inputProps.ts` — episodeInputPropsSchema + thumbnailInputPropsSchema (zod); EpisodeInputProps + ThumbnailInputProps types
- `remotion/components/TitleCard.tsx` — 65 lines; fade-in title card
- `remotion/components/ChapterCard.tsx` — 69 lines; chapter divider
- `remotion/components/Clip.tsx` — 65 lines; OffthreadVideo + cinematic grade
- `remotion/components/Outro.tsx` — 56 lines; fade-out outro
- `remotion/Episode.tsx` — 118 lines; episode composition
- `remotion/Thumbnail.tsx` — 113 lines; thumbnail composition
- `remotion/Root.tsx` — 70 lines; registerRoot + compositions
- `remotion.config.ts` — CLI config + webpack extensionAlias override

**Modified files:**
- `tsconfig.check.json` — added `jsx: react-jsx` + `lib: [ES2023, DOM]` for .tsx typecheck
- `package.json` / `package-lock.json` — added @remotion/cli, @remotion/bundler, @remotion/renderer at 4.0.461

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsconfig.check.json: added jsx:react-jsx + DOM lib for .tsx files**
- **Found during:** Task 2 (typecheck of component .tsx files)
- **Issue:** `tsconfig.check.json` lacked `jsx` compiler option; all .tsx files produced "Cannot use JSX unless '--jsx' flag is provided" errors (TS17004). The base `tsconfig.json` is Node.js-only and does not include DOM types.
- **Fix:** Added `"jsx": "react-jsx"` and `"lib": ["ES2023", "DOM"]` to `tsconfig.check.json`. Base `tsconfig.json` unchanged.
- **Files modified:** `tsconfig.check.json`
- **Commit:** `39bcf5e` (Task 2)

**2. [Rule 3 - Blocking] remotion.config.ts: webpack extensionAlias override for NodeNext .js imports**
- **Found during:** Task 2 (npx remotion compositions — webpack bundling error)
- **Issue:** Remotion's webpack bundler resolves `import './theme/tokens.js'` as a literal `.js` file path and does not remap to `.ts`. But the codebase uses NodeNext module resolution which requires explicit `.js` extensions. Error: "Module not found: Can't resolve './theme/tokens.js'".
- **Fix:** Added `Config.overrideWebpackConfig` with `resolve.extensionAlias: { '.js': ['.ts', '.tsx', '.js'] }`. This tells webpack to try `.ts`/`.tsx` first when encountering `.js` imports.
- **Files modified:** `remotion.config.ts`
- **Commit:** `39bcf5e` (Task 2)

---

**Total deviations:** 2 auto-fixed (2 blocking — both were required for the `npx remotion compositions` gate to pass)

## Known Stubs

None. All modules are fully wired. The default props in `Root.tsx` use placeholder paths (e.g. `/tmp/placeholder.mp4`) for Remotion Studio preview only — Plan 02-04's render driver will supply real resolved paths via `inputProps`.

## Deferred Items

**Music volume boundary ramp (REN-04 smoothing):** The step-function ships as-is. The `fps` parameter in `musicVolumeAtFrame` is already in the signature for a future boundary-ramp polish PR (Phase 4 QA may reveal audible discontinuities at segment transitions). The ramp can be added inside `musicVolume.ts` without changing Episode.tsx.

## Self-Check: PASSED

All key files exist on disk. All 3 task commits verified in git history:
- `5835745` — Task 1 RED: test files
- `7dae4f7` — Task 1 GREEN: implementation files
- `39bcf5e` — Task 2: components + compositions

`npx tsc --noEmit -p tsconfig.check.json` exits 0.
`npx vitest run` exits 0 (188 tests, 16 test files).
`npx remotion compositions remotion/Root.tsx` lists `Episode` and `Thumbnail`.
