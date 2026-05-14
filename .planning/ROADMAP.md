# Roadmap: golazo

## Overview

golazo is a local-Mac CLI that transforms folders of soccer highlight clips into branded, per-game YouTube episodes for two kids' channels. The pipeline is built as four horizontal layers: first the prepare stage (CLI scaffolding, config, filename parsing, clip discovery, manifest writing); then the render stage (deterministic music picking, Remotion compositions, programmatic render driver); then the publish stage (OAuth, idempotent YouTube upload, retry/quota handling); and finally a convenience and QA polish layer that wires the `all` chain together, adds the full vitest suite, and pins Remotion compositions with renderStill snapshots. Each phase delivers a complete, verifiable layer the operator can exercise from the command line before the next layer is built on top.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Prepare Pipeline** - Project scaffold, channels config, filename parser, clip discovery, and manifest writer
- [ ] **Phase 2: Render Pipeline** - Deterministic music picker, Remotion Episode + Thumbnail compositions, programmatic render driver
- [ ] **Phase 3: Publish Pipeline** - OAuth flow, idempotent YouTube upload with templates, retry / quota / resumable handling
- [ ] **Phase 4: Convenience & QA Polish** - `golazo all` chain, vitest unit + integration suite, Remotion visual snapshots

## Phase Details

### Phase 1: Foundation & Prepare Pipeline
**Goal**: Operator can run `golazo prepare <folder>` against a clip folder and get a valid, idempotent `manifest.json` written into `.golazo/`
**Depends on**: Nothing (first phase)
**Requirements**: CLI-01, CFG-01, CFG-02, PREP-01, PREP-02, PREP-03, PREP-04, PREP-07
**Success Criteria** (what must be TRUE):
  1. Running `golazo prepare ~/golazo/leo/2026-05-13_vs_united_3-1/` on a fixture folder writes `.golazo/manifest.json` matching the documented schema (kid, game, clips with durations, manifestHash)
  2. Operator can edit a single `channels.yaml` defining `leo` and `mateo` branding + YouTube binding, and invalid hex / out-of-range jersey / missing token path fail at load time with a clear remediation message
  3. Malformed folder names, missing parent kid directory, zero matching clips, and ffprobe failures each abort `prepare` with a specific path + reason + remediation hint (no silent swallows)
  4. Re-running `prepare` on an unchanged folder is a no-op — `manifestHash` (sha256 over sorted `(clipFile, clipSha256)` pairs + folder name) matches the recorded hash, so the manifest is not rewritten
  5. The `golazo` binary exposes `prepare`, `render`, `publish`, `auth`, and `all` subcommands via commander.js, with `render`/`publish`/`auth`/`all` returning a "not yet implemented" stub
**Plans**: 5 plans
Plans:
- [x] 01-01-PLAN.md — Project bootstrap, tooling, commander.js scaffold with all 5 subcommands (CLI-01 scaffold) — completed 2026-05-14, commits fa49898 + 66d2c67
- [x] 01-02-PLAN.md — channels.yaml zod schema + loader with table-driven validation tests (CFG-01, CFG-02) — completed 2026-05-14, commits 6e6c000 + 3f7696c
- [x] 01-03-PLAN.md — Pure filename parser + kid-from-path resolver with table-driven tests (PREP-01, PREP-02)
- [x] 01-04-PLAN.md — Clip discovery + ffprobe wrapper + sha256 + manifest-hash function + committed test fixture infrastructure (PREP-03, PREP-04, PREP-07 input half) — completed 2026-05-14, commits 9e35cdc + 5d7a110
- [ ] 01-05-PLAN.md — Manifest zod schema + builder/reader/writer + runPrepare orchestrator with idempotency + CLI handler + integration tests (CLI-01 prepare half, PREP-07 output half)

### Phase 2: Render Pipeline
**Goal**: Operator can run `golazo render <folder>` against a prepared folder and get `episode.mp4` + `thumb.png` written into `.golazo/` with deterministic music selection and the documented cinematic style
**Depends on**: Phase 1
**Requirements**: PREP-05, PREP-06, REN-01, REN-02, REN-03, REN-04, REN-05, REN-06
**Success Criteria** (what must be TRUE):
  1. Running `golazo render <folder>` on a fixture with a valid manifest produces `.golazo/episode.mp4` whose ffprobe duration matches the sum of clip durations plus title/chapter/outro frames, and `.golazo/thumb.png` at 1280×720
  2. Music selection is byte-stable across machines — the same `manifestHash` always picks the same track from `remotion/assets/music/`, and the re-roll / crossfade fallback paths are exercised deterministically when the first pick is too short
  3. The rendered `Episode` plays `TitleCard → (ChapterCard → Clip)× → Outro`, first clip at 0.5× rate with original audio muted, music ducked under match audio elsewhere, and the cinematic grade + Cormorant Garamond Italic / Inter typography visible in the output
  4. ChapterCard rhythm visibly differs between a ≤5-clip fixture (card before every clip) and a >5-clip fixture (card every 3 clips)
  5. Re-running `render` on an unchanged manifest skips work in under a second; `--force` re-renders and overwrites `.golazo/episode.mp4`
**Plans**: TBD
**UI hint**: yes

### Phase 3: Publish Pipeline
**Goal**: Operator can run `golazo auth <kid>` once per channel and then `golazo publish <folder>` to upload `episode.mp4` as unlisted to the correct YouTube channel, with idempotent re-runs
**Depends on**: Phase 2
**Requirements**: CLI-03, PUB-01, PUB-02, PUB-03, PUB-04, PUB-05, PUB-06, PUB-07
**Success Criteria** (what must be TRUE):
  1. Running `golazo auth leo` performs the YouTube OAuth flow and writes a refreshable token to the path declared in `channels.yaml`; subsequent `publish` runs refresh silently and prompt to rerun `auth` only when refresh fails
  2. Running `golazo publish <folder>` (against an `nock`-stubbed YouTube API in tests, real API in manual smoke) uploads `episode.mp4` with `privacyStatus: "unlisted"`, attaches `thumb.png`, applies the documented title + description templates with all nine substitutions, and writes `publish.json` with `videoId`, `watchUrl`, `uploadedAt`, `channelId`, `privacyStatus`
  3. Opponent slugs render pretty in title/description — `city-sc` → `City SC`, `united` → `United`, `ac-milan` → `AC Milan` — via title-case + hyphen-to-space + acronym allow-list (`sc`, `fc`, `ac`)
  4. Transient 5xx / network errors retry exactly 3 times with 1s/4s/16s backoff before failing; mid-upload drops resume via the YouTube resumable upload protocol; HTTP 403 `quotaExceeded` fails loudly with a "rerun tomorrow" hint and does not write `publish.json`
  5. Re-running `publish` on a folder whose `publish.json` already has a `videoId` exits early without re-uploading; `--force` overrides and uploads a new video
**Plans**: TBD

### Phase 4: Convenience & QA Polish
**Goal**: Operator can chain the whole pipeline with `golazo all <folder>` and the codebase ships with the full automated test suite and committed visual baselines
**Depends on**: Phase 3
**Requirements**: CLI-02, QA-01, QA-02, QA-03
**Success Criteria** (what must be TRUE):
  1. Running `golazo all <folder>` on a fresh fixture folder executes `prepare → render → publish` in sequence, exiting non-zero with a clear stage label if any sub-stage fails
  2. `pnpm test` (or `npm test`) runs the full vitest suite — table-driven unit tests for filename parser, channels loader, music-picker determinism, and title/description renderers — and all pass
  3. Integration tests run `prepare` against the committed `tests/fixtures/` folder, a low-res `render` end-to-end, and a `publish` with `nock`-stubbed YouTube API; line coverage on `src/` is ≥ 80%
  4. Remotion `Episode` title-card frame and `Thumbnail` are pinned by committed `renderStill` PNG snapshots under `tests/snapshots/`, with a 1% pixel-diff threshold that fails CI on visual regression
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Prepare Pipeline | 3/5 | In Progress|  |
| 2. Render Pipeline | 0/TBD | Not started | - |
| 3. Publish Pipeline | 0/TBD | Not started | - |
| 4. Convenience & QA Polish | 0/TBD | Not started | - |

---
*Roadmap created: 2026-05-13 by gsd-roadmapper*
*Phase 1 planned: 2026-05-13 by gsd-planner (4 plans, 3 waves)*
*Phase 1 revised: 2026-05-13 by gsd-planner (5 plans, 5 waves — Plan 03 moved to wave 3 with depends_on [01,02]; Plan 04 split into 04 (leaf modules + fixtures) and 05 (manifest + orchestrator + CLI + integration); see 01-04 and 01-05 PLANs)*
*Granularity: coarse (4 phases) · Mode: standard (horizontal layers) · Coverage: 28/28 v1 requirements mapped*
