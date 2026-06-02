---
phase: "08"
plan: "02"
subsystem: web-player
tags:
  - phase-08
  - player-wiring
  - video-element
  - episode-detail
  - server-component
  - client-island
  - tdd
dependency_graph:
  requires:
    - "08-01"  # episode.mp4 route + Range support
    - "07-04"  # EpisodeDetail component with playerMount seam
  provides:
    - VideoPlayer client island (src, poster string props)
    - episodeUrlFor pure URL helper (mirrors thumbUrlFor)
    - EpisodeDetail video player conditional rendering
  affects:
    - web/src/components/EpisodeDetail.tsx
    - web/src/app/episodes/[manifestHash]/page.tsx (no changes needed)
tech_stack:
  added:
    - VideoPlayer 'use client' island (new React component)
    - episodeUrlFor pure helper
  patterns:
    - Server component imports client island (Next.js handles boundary automatically)
    - Pure URL helper pattern (mirrors thumbUrlFor single-source-of-truth)
    - Status-branch conditional rendering (row.status === 'prepared' ? hint : player)
key_files:
  created:
    - web/src/lib/ui/episodeUrl.ts
    - web/src/lib/ui/episodeUrl.test.ts
    - web/src/components/VideoPlayer.tsx
    - web/src/components/VideoPlayer.module.css
    - web/tests/detail-player.integration.test.ts
  modified:
    - web/src/components/EpisodeDetail.tsx
    - web/src/components/EpisodeDetail.module.css
decisions:
  - "page.tsx required zero changes — row already carries kid+gameFolder+status, sufficient for both URL helpers"
  - "VideoPlayer is minimal 'use client' island: string-only props, no event handlers, browser Range handled natively by 08-01 route"
  - "aria-label updated from 'Video player (Phase 8)' to 'Video player' — Phase 8 is now landed; lockstep check found 0 surviving test references"
  - "CSS token hand-mirroring maintained (CSS Modules cannot import TS tokens — Phase 7 decision D-locked)"
metrics:
  duration: "607s (~10 min 7s)"
  completed: "2026-06-02"
  tasks_completed: 2
  files_changed: 7
---

# Phase 8 Plan 02: VideoPlayer Wiring Summary

HTML5 video player client island wired into EpisodeDetail's playerMount seam via episodeUrlFor + VideoPlayer; prepared rows show a render hint; 4 integration tests on port 4179 all pass.

## What Was Built

### episodeUrlFor pure helper (`web/src/lib/ui/episodeUrl.ts`)

Signature:
```typescript
export function episodeUrlFor(row: Pick<EpisodeIndex, 'kid' | 'gameFolder'>): string
// Returns: '/api/asset/<encodeURIComponent(kid)>/<encodeURIComponent(gameFolder)>/episode.mp4'
```

Single source of truth — the ONLY place the episode.mp4 URL template lives. Both segments are encoded via `encodeURIComponent` matching the encoding rule in `thumbUrlFor` exactly. JSDoc calls out the Phase 8 route this maps to (`web/src/app/api/asset/[kid]/[game]/episode.mp4/route.ts` from Plan 08-01).

9 unit tests cover: standard row, different kid, spaces, path-conflicting slash, percent encoding, empty strings, always ends with /episode.mp4, always starts with /api/asset/, round-trip encoding parity vs thumbUrlFor.

### VideoPlayer client island (`web/src/components/VideoPlayer.tsx`)

Props:
```typescript
interface VideoPlayerProps { src: string; poster: string; }
export function VideoPlayer({ src, poster }: VideoPlayerProps): React.JSX.Element
```

Renders:
```tsx
<div className={styles.container}>
  <video controls preload="metadata" poster={poster} src={src} className={styles.video} />
</div>
```

- `'use client'` directive on line 1 (verified: grep count = 1)
- Zero node:* / @golazo/cli imports (verified: grep count = 0)
- No custom controls, no event handlers — browser handles Range natively via Plan 08-01 Accept-Ranges header

### EpisodeDetail status-branch logic (`web/src/components/EpisodeDetail.tsx`, lines 70-78)

```tsx
<section className={styles.playerMount} aria-label="Video player">
  {row.status === 'prepared' ? (
    <p className={styles.playerHint}>Render this episode to enable playback.</p>
  ) : (
    <VideoPlayer src={episodeUrlFor(row)} poster={thumbUrlFor(row)} />
  )}
</section>
```

Added imports (lines 17-19):
- `import { VideoPlayer } from './VideoPlayer';`
- `import { thumbUrlFor } from '@/lib/ui/thumbUrl';`
- `import { episodeUrlFor } from '@/lib/ui/episodeUrl';`

aria-label changed from `"Video player (Phase 8)"` to `"Video player"` — Phase 8 is now landed.

EpisodeDetailProps interface: UNCHANGED (Phase 7 contract preserved — `row` already carries `kid + gameFolder + status`).

### page.tsx: zero changes required

Confirmed by reading `web/src/app/episodes/[manifestHash]/page.tsx` — `row` (which carries `kid`, `gameFolder`, `status`) is already passed to `<EpisodeDetail>`. Both URL helpers derive everything from `row.kid + row.gameFolder`. No prop additions needed.

### Integration test (`web/tests/detail-player.integration.test.ts`)

Port: **4179**
Skip gate: `GOLAZO_SKIP_DETAIL_PLAYER_INTEGRATION=1`

4 cases (all pass):
1. **Case 1 (rendered)**: leo/rivers detail page contains `<video` + src=`/api/asset/leo/2026-05-20_vs_rivers_2-2/episode.mp4` + poster=`/api/asset/leo/2026-05-20_vs_rivers_2-2/thumb.png` + `controls` + `preload="metadata"`
2. **Case 2 (published)**: mateo/dragons detail page contains `<video` + correct episode src + YouTube Studio link still present (Phase 7 regression guard)
3. **Case 3 (prepared)**: leo/united detail page does NOT contain `<video` + contains "Render this episode to enable playback"
4. **Case 4 (URL helper agreement)**: src attribute extracted from Case 1 HTML strictly equals `episodeUrlFor({ kid: 'leo', gameFolder: '2026-05-20_vs_rivers_2-2' })` computed in-test (single-source-of-truth gate)

## Aria-label Regression Guard

Grep count before: `grep -c "Video player (Phase 8)" web/tests/detail-view.integration.test.ts` = **0**

No Phase 7 test referenced the old literal — no lockstep update was needed. The aria-label was changed in the GREEN commit as a clean Phase 8 landing step.

Grep count after across all of `web/`: **0 surviving references** to "Video player (Phase 8)".

## Phase 7 Detail Integration Suite

`web/tests/detail-view.integration.test.ts` (port 4177) — **all 6 cases pass** (run in isolation after GREEN commit). Zero regression from EpisodeDetail changes. Confirmed via: `npx vitest run tests/detail-view.integration.test.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict null check in integration test**
- **Found during:** Task 2, `npx tsc --noEmit` after GREEN implementation
- **Issue:** `srcMatch![1]` was typed as `string | undefined` but used without null guard — `TS18048: 'srcFromHtml' is possibly 'undefined'`
- **Fix:** Added `?? ''` fallback and explicit `expect(srcMatch![1]).toBeDefined()` assertion
- **Files modified:** `web/tests/detail-player.integration.test.ts`
- **Commit:** `314beb1`

None of the plan's structural decisions required deviation.

## Known Stubs

None. VideoPlayer renders full `<video>` element. episodeUrlFor is fully implemented. EpisodeDetail conditional branch is wired.

## Threat Flags

No new security-relevant surface beyond what the plan's threat model covered. T-08-06 (encodeURIComponent on both segments) is implemented in episodeUrlFor. T-08-08 (no dangerouslySetInnerHTML) confirmed — JSX escaping used throughout.

## Phase 8 Hand-off Note

Plan 08-04 Playwright golden path can assert the play event on the same `<video>` element. The `aria-label="Video player"` section selector is stable. The src URL pattern (`/api/asset/<kid>/<gameFolder>/episode.mp4`) is pinned via `episodeUrlFor` single source of truth.

## Self-Check

Files created/modified:
- web/src/lib/ui/episodeUrl.ts — FOUND
- web/src/lib/ui/episodeUrl.test.ts — FOUND
- web/src/components/VideoPlayer.tsx — FOUND
- web/src/components/VideoPlayer.module.css — FOUND
- web/src/components/EpisodeDetail.tsx — FOUND (modified)
- web/src/components/EpisodeDetail.module.css — FOUND (modified)
- web/tests/detail-player.integration.test.ts — FOUND

Commits:
- e7fa6ff (RED Task 1: episodeUrl tests + VideoPlayer stub) — FOUND
- aa733c8 (GREEN Task 1: VideoPlayer implementation) — FOUND
- c073464 (RED Task 2: detail-player integration test) — FOUND
- 314beb1 (GREEN Task 2: EpisodeDetail wiring) — FOUND

## Self-Check: PASSED
