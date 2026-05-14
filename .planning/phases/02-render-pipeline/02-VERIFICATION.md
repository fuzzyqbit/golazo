---
phase: 02-render-pipeline
verified: 2026-05-14T12:35:02Z
status: human_needed
score: 5/5
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Visual confirmation that cinematic grade, vignette, and Cormorant Garamond Italic / Inter typography are visible in a rendered frame"
    expected: "episode.mp4 frames show: saturated/contrasted/dimmed grade, radial vignette overlay, large italic serif display font for score/opponent, sans-serif Inter for subtitle labels"
    why_human: "Remotion renders to mp4/png; automated probing confirms the composition exists and uses the right CSS properties, but visual quality requires human eyes on a rendered frame or still"
  - test: "Visual confirmation that ChapterCard rhythm visibly DIFFERS between a <=5-clip and >5-clip episode"
    expected: "5-clip episode: chapter card before every clip (5 cards total); 6-clip episode: chapter cards only at clips 0 and 3 (2 cards). Both observable in episode.mp4 playback"
    why_human: "The logic is pinned by unit tests (chapterRhythm.test.ts case SUCCESS CRITERION 4) and integration test produces a 3-clip episode. Visual confirmation of the rendered output on a 6+-clip fixture requires a human or a Phase 4 renderStill snapshot test. No 6+-clip fixture is committed (deferred to Phase 4 QA-03)."
  - test: "Music ducking audibly functions in episode.mp4 — music muted under first slo-mo clip, ducked under remaining clips, at baseline during title/chapter/outro"
    expected: "Audible step changes in music volume at segment transitions. Volume 0 during first clip, ~0.2 during subsequent clips, ~0.7 elsewhere"
    why_human: "musicVolumeAtFrame step-function is unit-tested and wired into Episode.tsx <Audio> component. Actual audio loudness in the rendered mp4 requires playback or audio waveform analysis"
---

# Phase 2: Render Pipeline Verification Report

**Phase Goal:** Operator can run `golazo render <folder>` against a prepared folder and get `episode.mp4` + `thumb.png` written into `.golazo/` with deterministic music selection and the documented cinematic style
**Verified:** 2026-05-14T12:35:02Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `golazo render <folder>` produces `.golazo/episode.mp4` and `.golazo/thumb.png`, and `npx remotion compositions` lists `Episode` (1920x1080) and `Thumbnail` (1280x720) | VERIFIED | driver.test.ts case 1 passes: `episode.mp4 > 1KB`, PNG magic confirmed, `manifest.render` populated. `remotion compositions` output: `Episode 30fps 1920x1080 525fr` + `Thumbnail 1280x720 Still`. cli/render.integration.test.ts case 1 passes end-to-end. |
| 2 | Music selection is deterministic — same `manifestHash` always picks the same track; re-roll and crossfade strategies exercised | VERIFIED | driver.test.ts case 6: two fixture clones with identical content produce identical `manifest.music` blocks (`track`, `durationSec`, `strategy`, `reroll` all deep-equal). musicPicker.test.ts: 12 cases including 10x determinism, cross-instance, and seed-sensitivity checks. pickTrack uses `sha256(manifestHash + ':roll:' + r)` BigInt modulo seeding. |
| 3 | Episode sequences `TitleCard → (ChapterCard → Clip)× → Outro`; first clip at 0.5× rate with audio muted; music ducked via `musicVolumeAtFrame` (imported, not redefined) | VERIFIED (code) / UNCERTAIN (visual) | `remotion/Episode.tsx` uses `<Sequence>` blocks keyed to timeline segments. `getClipPlayback(0)` returns `{ playbackRate: 0.5, muted: true }` (timing.ts line 144). `musicVolumeAtFrame` imported from `./composition/musicVolume.js` at line 25 — NOT redefined inline. Visual output needs human verification. |
| 4 | ChapterCard rhythm differs: `<=5` clips → every-clip; `>5` clips → every-3 | VERIFIED (logic) / UNCERTAIN (visual) | `chapterRhythm.ts`: `computeChapterRhythm(totalClips: number)` returns `'every-clip'` when `<=5` else `'every-3'` (line 24). `chapterRhythm.test.ts` case "SUCCESS CRITERION 4" asserts 5-clip yields 5 cards, 6-clip yields 2 cards. No committed 6+-clip fixture for visual confirmation (deferred to Phase 4 QA-03). |
| 5 | Re-running render on unchanged manifest exits in under 2s (hash-match skip); `--force` re-renders and overwrites | VERIFIED | driver.test.ts case 2: `result.skipped === true`, `reason === 'hash-match'`, wall-clock < 2000ms. Case 3: `--force` produces `result.reason === 'force'`, `episode.mp4` mtime advances. cli/render.integration.test.ts cases 2+3 confirm same behavior via CLI shell-out. |

**Score:** 5/5 truths verified (3 require human confirmation of visual/audio output)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/render/driver.ts` | `runRender` orchestrator with 16-step algorithm | VERIFIED | Exists 538 lines. Exports `runRender`, `RenderResult`, `RenderReason`, `RunRenderOpts`. All 16 steps implemented including local HTTP file server, bundle memo, ffprobe, invariant check. |
| `src/render/opponentPretty.ts` | `prettyOpponent` + `ACRONYM_ALLOW_LIST` | VERIFIED | Exists. Exports confirmed at lines 24+32. 8 unit tests pass. |
| `src/render/index.ts` | Barrel exporting loadMusicPool, pickTrack, runRender, prettyOpponent | VERIFIED | All 4 exports present (lines 7-20). |
| `src/cli/commands/render.ts` | Real render handler replacing Plan 01-01 stub | VERIFIED | Stub string `'render: not yet implemented'` absent (grep returns exit 1). Imports `runRender` from `'../../render/index.js'` (line 3). All 4 output messages documented. |
| `src/prepare/manifest.ts` | Extended with `renderSchema` + optional `render` block as sibling of `manifestHash` | VERIFIED | `renderSchema` at line 52. `manifestSchema` at line 109: `manifestHash` (line 122), `render: renderSchema.optional()` (line 126), `music: musicSchema.optional()` (line 129) — all siblings at top level. |
| `src/prepare/errors.ts` | `RenderError` as 8th error class | VERIFIED | 8 classes confirmed: `FilenameError` (53), `KidPathError` (98), `ClipDiscoveryError` (150), `ProbeError` (202), `ManifestError` (257), `MusicPoolError` (312), `MusicPickError` (355), `RenderError` (410). |
| `remotion/theme/tokens.ts` | COLORS, TYPOGRAPHY, LAYOUT, MOTION constants | VERIFIED | Exists. TYPOGRAPHY has `display: { family: 'Cormorant Garamond', weight: 400, style: 'italic' }` and `label: { family: 'Inter', ... }`. |
| `remotion/assets/fonts/*.ttf` | Three self-hosted TTF fonts | VERIFIED | `CormorantGaramond-Italic.ttf` (702KB), `Inter-Regular.ttf` (407KB), `Inter-Bold.ttf` (415KB) — all present with expected sizes. |
| `remotion/assets/music/index.json` | 6-track pool with durations | VERIFIED | 6 entries: atmos-1 (200s), atmos-2 (60s), atmos-3 (240s), atmos-4 (30s), atmos-5 (180s), atmos-6 (8s). Covers trim-fade, re-roll, crossfade strategies. |
| `remotion/Root.tsx` | `registerRoot` + Episode + Thumbnail | VERIFIED | `registerRoot(RemotionRoot)` at line 70. Episode (1920x1080@30fps) and Thumbnail (1280x720, 1 frame) registered. `npx remotion compositions` confirms listing. |
| `remotion/Episode.tsx` | Episode composition with Sequences and Audio | VERIFIED | 4 segment types rendered via `<Sequence>`. `<Audio volume={(f) => musicVolumeAtFrame(f, timeline)}` wired. HTTP URL passthrough fix applied for both music and clip src. |
| `remotion/components/Clip.tsx` | OffthreadVideo with cinematic grade | VERIFIED | Imports `getCinematicGradeStyle`, `getVignetteOverlayStyle` (lines 25-26). Applied at lines 53 and 69. `getClipPlayback(clipIndex)` drives `playbackRate` and `muted`. |
| `remotion/composition/chapterRhythm.ts` | Chapter rhythm logic | VERIFIED | `computeChapterRhythm(n)`: `<=5 → 'every-clip'`, `>5 → 'every-3'` (line 24). |
| `remotion/composition/musicVolume.ts` | Step-function volume with 3 constants | VERIFIED | `MUSIC_VOLUME_MUTED=0`, `MUSIC_VOLUME_DUCKED=0.2`, `MUSIC_VOLUME_BASELINE=0.7`. `musicVolumeAtFrame` exported. |
| `remotion/composition/timing.ts` | Timeline computation with first-clip doubling | VERIFIED | `computeEpisodeTimeline` + `getClipPlayback`. First clip doubled (`Math.ceil(durationSec * fps) * 2`). |
| `tsconfig.check.json` | Type-check config covering src/ + remotion/ | VERIFIED | `npx tsc --noEmit -p tsconfig.check.json` exits 0. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/render/driver.ts` | `src/render/musicPool.ts` + `src/render/musicPicker.ts` | `loadMusicPool` + `pickTrack` | WIRED | Lines 45-46 import both; called at lines 257+260. |
| `src/render/driver.ts` | `@remotion/bundler` + `@remotion/renderer` | `bundle`, `selectComposition`, `renderMedia`, `renderStill` | WIRED | Lines 39-40 import all four; used in steps 6, 8-12. |
| `src/render/driver.ts` | `src/prepare/manifest.ts` | `readManifest` + `writeManifest` + `buildManifest` | WIRED | Line 42 import; called at steps 1 (readManifest), 14 (buildManifest), 15 (writeManifest). |
| `src/cli/commands/render.ts` | `src/render/driver.ts` | `runRender` import | WIRED | Line 3: `import { runRender } from '../../render/index.js'`. Called at line 42. |
| `src/render/driver.ts` | `src/config/channels.ts` | `loadChannel` | WIRED | Line 43 import; called at step 2 (line 254). |
| `remotion/Episode.tsx` | `remotion/composition/musicVolume.ts` | `musicVolumeAtFrame` import | WIRED | Line 25 import; used as `<Audio volume={(f) => musicVolumeAtFrame(f, timeline)}>` at line 68. NOT redefined inline. |
| `remotion/components/Clip.tsx` | `remotion/theme/index.ts` | `getCinematicGradeStyle`, `getVignetteOverlayStyle` | WIRED | Lines 25-26 import; applied at JSX lines 53 and 69. |
| `remotion/components/TitleCard.tsx` | `remotion/theme/tokens.ts` | `TYPOGRAPHY.display.family` (Cormorant Garamond) | WIRED | Line 10 import; `fontFamily: TYPOGRAPHY.display.family` at line 20. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/render/driver.ts` | `manifest` | `readManifest(absFolder)` → reads `.golazo/manifest.json` | Yes — zod-validated JSON from disk | FLOWING |
| `src/render/driver.ts` | `pick` | `pickTrack({ manifestHash, totalDurationSec, pool })` — sha256-seeded deterministic | Yes — real selection from committed pool | FLOWING |
| `remotion/Episode.tsx` | `timeline` | `computeEpisodeTimeline({ clips: props.clips })` | Yes — computed from real clip durations | FLOWING |
| `remotion/Episode.tsx` | `music.absPath` | HTTP URL from `fileServer.urlFor(chosenEntry.absPath)` | Yes — local HTTP server serving real mp3 | FLOWING |
| `remotion/Root.tsx` | default props | `/tmp/placeholder.mp4` paths in `defaultProps` | Placeholder for Remotion Studio only — real paths come from `inputProps` at render time | FLOWING (production path uses `inputProps` supplied by `runRender`) |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 215 tests pass | `npm test` | 215 passed (19 test files), 0 failures | PASS |
| TypeScript type check clean | `npx tsc --noEmit -p tsconfig.check.json` | exit 0, no errors | PASS |
| `Episode` and `Thumbnail` compositions registered | `npx remotion compositions remotion/Root.tsx` | `Episode 30fps 1920x1080 525fr` + `Thumbnail 1280x720 Still` | PASS |
| Stub string absent from render.ts | `grep 'render: not yet implemented' src/cli/commands/render.ts` | exit 1 (no match) | PASS |
| `musicVolumeAtFrame` imported, not redefined in Episode.tsx | `grep 'function musicVolumeAtFrame' remotion/Episode.tsx` | exit 1 (no match — function is imported, not defined there) | PASS |
| Bin target resolves | `node -e "require('fs').accessSync('./dist/cli/index.js')"` | exit 0 | PASS |
| render block is a sibling of manifestHash (not nested) | Schema inspection | `manifestSchema` has `manifestHash`, `render`, `music` as top-level siblings (lines 122, 126, 129) | PASS |
| All 7 driver integration tests ran (not skipped — Chromium available) | Test output | 7 cases all show `✓` with ms timings, including case 1 (5.5s), case 3 (9.6s) | PASS |

---

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` files found; phase is a render pipeline (not a migration/tooling phase). Behavioral spot-checks (Step 7b) serve as the equivalent.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PREP-05 | 02-02 | Deterministic music pick seeded by `manifestHash` | SATISFIED | `pickTrack` sha256-seeded BigInt modulo. musicPicker.test.ts 12 cases. driver.test.ts case 6. |
| PREP-06 | 02-02 | trim-fade / re-roll / crossfade strategies | SATISFIED | `musicPicker.ts` implements all 3 strategies. musicPicker.test.ts cases cover all branches. 6 fixture tracks cover all strategy scenarios. |
| REN-01 | 02-03 | Episode sequences TitleCard → (ChapterCard → Clip)× → Outro; first clip slo-mo + muted | SATISFIED | Episode.tsx confirmed. `getClipPlayback(0)` returns `{ playbackRate: 0.5, muted: true }`. timing.ts first-clip doubling. |
| REN-02 | 02-03 | ChapterCard rhythm <=5 every-clip, >5 every-3 | SATISFIED | `computeChapterRhythm(n)` line 24. chapterRhythm.test.ts SUCCESS CRITERION 4 case. |
| REN-03 | 02-01 | Cinematic grade (vignette + filter) + Cormorant Garamond Italic + Inter, self-hosted | SATISFIED | TTF files committed (702KB CG, 415KB IB, 407KB IR). `getCinematicGradeStyle` returns `filter: 'saturate(1.12) contrast(1.05) brightness(0.96)'`. TitleCard uses `TYPOGRAPHY.display.family` = `'Cormorant Garamond'`. Clip.tsx applies grade + vignette. Visual confirmation needs human. |
| REN-04 | 02-03 | Music ducked under audible clips, muted during slo-mo first clip | SATISFIED | `musicVolumeAtFrame` step-function: `MUTED=0` (first clip), `DUCKED=0.2` (other clips), `BASELINE=0.7` (title/chapter/outro). Episode.tsx `<Audio volume>` wired. musicVolume.test.ts 8 cases. |
| REN-05 | 02-03 | Thumbnail 1280×720 pure-typographic PNG | SATISFIED | Root.tsx Thumbnail composition: `width={1280} height={720}`. `renderStill` called with `imageFormat: 'png'`. driver.test.ts case 1 asserts PNG magic bytes. |
| REN-06 | 02-04 | Render driver writes episode.mp4 + thumb.png, skips on hash match, `--force` re-renders | SATISFIED | `runRender` 16-step algorithm. driver.test.ts cases 1-7 all pass. cli/render.integration.test.ts cases 1-4 pass. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `remotion/Root.tsx` | defaultProps | `absPath: '/tmp/placeholder.mp4'` placeholder paths | INFO | Remotion Studio preview only — `inputProps` from `runRender` override at render time. Not a stub in production path. |

No `TBD`, `FIXME`, or `XXX` markers found in any phase file.
No `render: not yet implemented` stub remaining.
No empty return stubs in render path.

---

### Human Verification Required

#### 1. Cinematic visual grade and typography in rendered output

**Test:** Run `HOME=$PWD npx tsx src/cli/index.ts render tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1 --channels-config tests/fixtures/golazo/channels.yaml --low-res`, then open `.golazo/episode.mp4` in a video player and `.golazo/thumb.png` in an image viewer.

**Expected:**
- Title card: large italic serif text (Cormorant Garamond) for player name + score; smaller Inter sans-serif for club/jersey subtitle
- Vignette darkening at edges of frame
- Slight color saturation increase and contrast boost visible vs. raw clip
- Score line visible in thumbnail at 1280×720 (or 640×360 in lowRes)

**Why human:** CSS properties are code-verified (`filter: 'saturate(1.12) contrast(1.05) brightness(0.96)'`, `radial-gradient` vignette). Font registration and rendering depends on Chromium's font engine at render time. Automated checks confirm the code path but not the rendered pixel output.

#### 2. Chapter card rhythm visible difference between <=5-clip and >5-clip episodes

**Test:** The committed fixture has 3 clips (every-clip rhythm — 3 chapter cards visible). To confirm the `>5` rhythm: create a 6-clip fixture folder (copy existing clips, rename to `01-..` through `06-..`), run `golazo prepare` then `golazo render --low-res`, then scrub the video to count chapter card insertions.

**Expected:**
- 3-clip episode: 3 chapter cards (one before each clip)
- 6-clip episode: 2 chapter cards (before clip 0 and clip 3)

**Why human:** Unit test (`chapterRhythm.test.ts` SUCCESS CRITERION 4) verifies the logic. No 6+-clip fixture is committed yet (Phase 4 QA-03 deferred item). Visual confirmation of the rendered rhythm in video playback requires human or committed renderStill snapshots.

#### 3. Music ducking audible in rendered episode.mp4

**Test:** Play the rendered `episode.mp4` from the previous test. Listen for:
- First clip (slo-mo): music should be completely silent
- Subsequent clips: music should be audible but quieter (~0.2 volume)
- Title card, chapter cards, outro: music at full volume (~0.7)

**Expected:** Clear volume steps at segment transitions. No music under first slo-mo clip. Music audible under subsequent clips.

**Why human:** `musicVolumeAtFrame` step-function is unit-tested (8 cases) and wired to `<Audio volume>` in Episode.tsx. Actual audio in the rendered mp4 requires playback or waveform analysis tools. Phase 4 may add automated audio-level assertions.

---

### Gaps Summary

No blocking gaps. All 5 success criteria are implemented and verified at the code level. Three human verification items remain for visual and auditory output quality — these are expected for a phase with `UI hint: yes` in ROADMAP.md and are not regressions or missing implementations.

The plan-noted deferred item (6+-clip fixture for SC4 visual) is explicitly scheduled for Phase 4 QA-03 and does not block Phase 2 completion.

---

_Verified: 2026-05-14T12:35:02Z_
_Verifier: Claude (gsd-verifier)_
