---
phase: 02-render-pipeline
plan: "01"
subsystem: ui
tags: [remotion, fonts, typography, theme, tsconfig, vitest]

requires:
  - phase: 01-foundation-prepare-pipeline
    provides: package.json bin contract (bin.golazo -> ./dist/cli/index.js), tsconfig.json (rootDir:./src), vitest.config.ts

provides:
  - remotion/theme barrel (COLORS, TYPOGRAPHY, LAYOUT, MOTION, loadFonts, getCinematicGradeStyle, getVignetteOverlayStyle)
  - Self-hosted TTF fonts: CormorantGaramond-Italic, Inter-Regular, Inter-Bold (all SIL OFL 1.1)
  - tsconfig.check.json type-check-only config covering src/**/* + remotion/**/*
  - vitest.config.ts extended to include remotion/**/*.test.ts

affects: [02-02-music-picker, 02-03-compositions, 02-04-render-driver, 03-publish-pipeline]

tech-stack:
  added:
    - "@remotion/fonts@4.0.461"
    - "remotion@4.0.461"
    - "react@19.2.6"
    - "react-dom@19.2.6"
    - "@types/react@19.x"
    - "@types/react-dom@19.x"
  patterns:
    - "Module-level promise cache for idempotent async font loading"
    - "Module-level object memo for React CSS properties (getCinematicGradeStyle, getVignetteOverlayStyle)"
    - "tsconfig.check.json extends base tsconfig for --noEmit type-checking without disrupting emit pipeline"
    - "import.meta.url font URL resolution for Remotion webpack bundler"

key-files:
  created:
    - remotion/theme/tokens.ts
    - remotion/theme/fonts.ts
    - remotion/theme/grade.ts
    - remotion/theme/index.ts
    - remotion/theme/tokens.test.ts
    - remotion/theme/grade.test.ts
    - remotion/assets/fonts/CormorantGaramond-Italic.ttf
    - remotion/assets/fonts/Inter-Regular.ttf
    - remotion/assets/fonts/Inter-Bold.ttf
    - remotion/assets/fonts/README.md
    - tsconfig.check.json
  modified:
    - package.json
    - package-lock.json
    - vitest.config.ts
    - .gitignore

key-decisions:
  - "Font URL resolution uses new URL('../assets/fonts/...', import.meta.url).href — staticFile() only resolves public/ in Remotion; import.meta.url is resolved by Remotion's webpack bundler at bundle time"
  - "loadFonts() wraps @remotion/fonts loadFont() (single-face API, not a plural loadFonts); idempotent via module-level Promise cache (loadOnce)"
  - "getCinematicGradeStyle() and getVignetteOverlayStyle() are module-level memoized (null -> object on first call) so React reconciliation never creates new style objects"
  - "tsconfig.check.json extends base tsconfig.json WITHOUT modifying it — rootDir:./src and outDir:./dist preserved for Phase 1 bin contract; rootDir:. in check config widens scope to remotion/ for --noEmit only"
  - "Cormorant Garamond Italic sourced from CatharsisFonts/Cormorant GitHub (fonts/ttf/CormorantGaramond-Italic.ttf); Inter Regular+Bold sourced from rsms/inter v4.0 release zip (extras/ttf/); both SIL OFL 1.1"
  - "vitest.config.ts include extended to remotion/**/*.test.ts (Rule 3 auto-fix — runner was not covering remotion/ test files)"
  - "@remotion/fonts v4.0.461 uses loadFont() (single call per face) not a plural loadFonts() function"

patterns-established:
  - "remotion/theme/index.ts barrel: single import point for all theme tokens, font loading, and CSS helpers"
  - "test files in remotion/ parallel to source files; vitest.config.ts includes remotion/**/*.test.ts"

requirements-completed:
  - REN-03

duration: 6min 6s
completed: "2026-05-14"
---

# Phase 2 Plan 01: Theme Primitives Summary

**Self-hosted Cormorant Garamond Italic + Inter fonts, pure token constants (COLORS/TYPOGRAPHY/LAYOUT/MOTION), and memoized cinematic-grade/vignette CSS helpers — full remotion/theme barrel with 17 passing unit tests**

## Performance

- **Duration:** 6 min 6 s
- **Started:** 2026-05-14T11:32:21Z
- **Completed:** 2026-05-14T11:38:27Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Three self-hosted TrueType fonts committed under `remotion/assets/fonts/` (702KB Cormorant Garamond Italic, 415KB Inter Bold, 407KB Inter Regular) with SIL OFL 1.1 license documentation
- `remotion/theme` barrel exporting COLORS, TYPOGRAPHY, LAYOUT, MOTION as pure `as const` constants plus `loadFonts()` and `getCinematicGradeStyle()`/`getVignetteOverlayStyle()` helpers; 17 unit tests pass
- `tsconfig.check.json` created; `npm run typecheck` now covers both `src/` and `remotion/` via `--noEmit`; base `tsconfig.json` unchanged (Phase 1 bin contract preserved)

## Task Commits

Each task was committed atomically:

1. **Task 1: Font assets + tsconfig.check.json + gitignore whitelist** — `ecee31f` (feat)
2. **Task 2: remotion/theme tokens + fonts + grade + unit tests** — `a03b0c6` (feat)

## Files Created/Modified

- `remotion/assets/fonts/CormorantGaramond-Italic.ttf` — Self-hosted display font (702KB, TrueType, SIL OFL)
- `remotion/assets/fonts/Inter-Regular.ttf` — Self-hosted label font regular weight (407KB, TrueType, SIL OFL)
- `remotion/assets/fonts/Inter-Bold.ttf` — Self-hosted label font bold weight (415KB, TrueType, SIL OFL)
- `remotion/assets/fonts/README.md` — License declaration + source URLs for audit trail
- `remotion/theme/tokens.ts` — COLORS, TYPOGRAPHY, LAYOUT, MOTION as const; pure data, no imports
- `remotion/theme/fonts.ts` — FONT_FAMILIES + loadFonts(); uses @remotion/fonts loadFont(); import.meta.url URL resolution
- `remotion/theme/grade.ts` — getCinematicGradeStyle() + getVignetteOverlayStyle(); memoized; React-free (import type only)
- `remotion/theme/index.ts` — Barrel re-exporting all three modules
- `remotion/theme/tokens.test.ts` — 12 test cases (colors, typography, layout, motion, CSS-color table, as const gate)
- `remotion/theme/grade.test.ts` — 5 test cases (filter functions, memoization, vignette keys, radial-gradient)
- `tsconfig.check.json` — Extends base tsconfig; noEmit + rootDir:"." + include src/**/* + remotion/**/*
- `package.json` — scripts.typecheck updated; @remotion/fonts + remotion + react + react-dom added to dependencies
- `vitest.config.ts` — Added remotion/**/*.test.ts to include (Rule 3 auto-fix)
- `.gitignore` — Added !remotion/assets/fonts/*.ttf + !remotion/assets/music/*.mp3 + !remotion/assets/music/index.json whitelists

## Decisions Made

**Remotion font-registration API:** `@remotion/fonts` v4.0.461 exports `loadFont()` (single face per call), not a plural `loadFonts()`. The `fonts.ts` implementation calls it three times in parallel via `Promise.all()`.

**Font URL strategy:** `staticFile()` only resolves from the Remotion `public/` directory. Since fonts live under `remotion/assets/fonts/`, font URLs are resolved via `new URL('../assets/fonts/<file>', import.meta.url).href`. Remotion's webpack bundler handles `import.meta.url` at bundle time correctly.

**Cinematic grade filter values (pinned — DO NOT change silently):**
`filter: 'saturate(1.12) contrast(1.05) brightness(0.96)'`
Plans 03 and 04 must not change these values without updating this SUMMARY and the snapshot tests.

**ARCHITECTURAL CONFIRMATION (load-bearing for Plans 02–04):**
The base `tsconfig.json` was NOT modified — `rootDir: "./src"`, `outDir: "./dist"`, `include: ["src/**/*"]` are unchanged. `npm run build` (`tsc -p .`) still emits `./dist/cli/index.js` at the exact path `package.json#bin.golazo` references. The new `tsconfig.check.json` extends it for `npm run typecheck` (`tsc --noEmit -p tsconfig.check.json`) to cover `remotion/`. Remotion's own bundler (`@remotion/bundler`'s `bundle({ entryPoint: 'remotion/Root.tsx' })`) compiles TSX directly via its own webpack pipeline — `tsc` emit is not in the Remotion bundle pipeline, so we never need `tsc` to emit anything under `remotion/`.

**MOTION constants — no deviations:** All frame counts and fps match the plan's pinned values exactly (fps:30, titleCardFrames:90, chapterCardFrames:45, outroFrames:90, crossfadeFrames:12, firstClipPlaybackRate:0.5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended vitest.config.ts include to cover remotion/**/*.test.ts**
- **Found during:** Task 2 (TDD RED phase)
- **Issue:** `vitest.config.ts` `include` list only covered `src/**/*.test.ts` and `tests/**/*.test.ts` — running `npx vitest run remotion/theme/tokens.test.ts` exited with "No test files found"
- **Fix:** Added `'remotion/**/*.test.ts'` to the `include` array in `vitest.config.ts`
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run remotion/theme/tokens.test.ts remotion/theme/grade.test.ts` found and ran 17 tests; `npm test` passes all 136 tests (including the 17 new)
- **Committed in:** `a03b0c6` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for test runner to discover remotion/ test files. No scope creep.

## Issues Encountered

**Font CDN sources partially unavailable:** The GitHub raw URL patterns in the plan for Inter (`github.com/rsms/inter/raw/master/docs/font-files/`) returned 404. Resolved by downloading the rsms/inter v4.0 release archive (`Inter-4.0.zip`) and extracting `extras/ttf/Inter-Regular.ttf` and `extras/ttf/Inter-Bold.ttf`. Source URL recorded in `remotion/assets/fonts/README.md`. Cormorant Garamond Italic was downloaded successfully via the `CatharsisFonts/Cormorant/raw/master/fonts/ttf/` path.

**fontsource packages only ship woff/woff2:** The fallback of `npm install @fontsource/inter @fontsource/cormorant-garamond` was attempted but those packages do not include `.ttf` files — only `.woff` and `.woff2`. Uninstalled after the release-archive approach succeeded.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `remotion/theme` barrel is stable and importable. Plans 02-03 (compositions, Wave 2) and 02-04 (render driver, Wave 3) can import theme tokens and helpers directly.
- Plan 02-02 (music picker, parallel Wave 1) has no theme dependency — Wave 1 parallelism preserved.
- `remotion/assets/music/` directory whitelist (`!remotion/assets/music/*.mp3`, `!remotion/assets/music/index.json`) added to `.gitignore` so Plan 02-02 does not need to touch `.gitignore`.
- Final glyph verification will arrive in Plan 02-04's `renderStill` integration test when actual font rendering is exercised.

---
*Phase: 02-render-pipeline*
*Completed: 2026-05-14*
