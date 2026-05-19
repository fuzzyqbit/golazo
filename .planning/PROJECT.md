# golazo

## What This Is

A local-Mac CLI that turns folders of downloaded soccer highlight clips into branded, per-game YouTube episodes for two kids (12yo + 7yo). The 12-year-old's footage comes from Veo (full match — operator exports highlights manually); the 7-year-old's comes from Trace (per-player auto-clips). Each kid has their own YouTube channel; episodes are uploaded as unlisted for operator review before being flipped public.

## Core Value

Drop a folder of clips on disk, get a cinematic per-game highlight episode uploaded to the right YouTube channel — minimal hands-on time per game even at 5+ games/week.

## Current State

✅ **v1.0 shipped 2026-05-19**

The MVP is feature-complete and tested:

- `golazo prepare <folder>` writes idempotent `manifest.json` with `manifestHash`
- `golazo render <folder>` produces `episode.mp4` (cinematic Remotion composition: TitleCard → ChapterCard×Clip → Outro, slo-mo first clip, music ducking, Cormorant Garamond Italic + Inter typography, vignette grade) + `thumb.png` at 1280×720
- `golazo auth <kid>` performs YouTube OAuth and stores refreshable per-kid token
- `golazo publish <folder>` uploads as `privacyStatus: "unlisted"` with title/description templates, retries on 5xx/network with 1s/4s/16s backoff, idempotent via `publish.json` videoId
- `golazo all <folder>` chains prepare → render → publish with stage-labeled failures
- 387 tests passing across 32 files · 86.72% line coverage · pixelmatch 1% snapshot gate on Episode title-card + Thumbnail PNGs
- All 28 v1 requirements complete · 1 documented override (PUB-05 multipart-vs-resumable)

See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) and [milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md) for the full v1.0 history.

## Next Milestone Goals

*(Not yet defined. Start with `/gsd-new-milestone` to define v1.1 or v2.0 scope.)*

Carry-forward candidates from v1.0:

- **PUB-05-resumable** — Replace googleapis SDK upload with raw HTTP resumable upload session protocol (initiation POST → session URI → `Content-Range` PUT on retry). Closes the v1.0 override; useful if real-world fail rates on mid-upload drops become an issue.
- **OAuth-DI** — Replace `GOLAZO_OAUTH_MOCK=1` env-var branch in `exchangeCode` with injectable factory pattern. Removes a test-only seam from production code.
- **QA-03-extended** — Commit 6+-clip fixture + integration render to close visual chapter-rhythm regression coverage on the every-3-clips path.

Other directions to consider when scoping the next milestone:

- Real-world smoke test on production YouTube accounts before publishing public
- Auto-detect Veo vs Trace footage source from folder content (currently declared in `channels.yaml`)
- Multi-game recap mode (cross-game compilations were explicit v1 out-of-scope; revisit when v1 is validated)
- Cross-OS support if a Linux/Windows operator emerges

## Context

- **Operator workload:** parent of two kids, 5+ games/week combined across two clubs; can't sustain manual editing per game
- **Footage sources:** Veo and Trace both produce downloadable clips; operator already exports highlights filtered to the relevant player, so the pipeline starts after that filtering
- **Audience:** small public — grandparents, teammates, college recruiters someday. Not a content-creator/growth play
- **Branding:** two distinct channels, one per kid. Same cinematic visual template, differentiated by name and accent color from `channels.yaml`
- **Approval gate:** auto-upload as unlisted → operator reviews in YouTube Studio and flips to public manually. No fully-public auto-publish

## Constraints

- **Tech stack**: Node.js + TypeScript + Remotion 4.x + commander.js + zod — operator runs locally on macOS; Remotion chosen for typographic strength and programmatic composition
- **Runtime**: macOS only — system `ffmpeg` and `ffprobe` from Homebrew assumed. No CI rendering across OSes
- **Music licensing**: YouTube Audio Library only — small pool committed under `remotion/assets/music/`
- **Publishing**: every upload is `privacyStatus: "unlisted"` — system has no path to publish public. Operator flip is the only public gate
- **Determinism**: same input clips must produce same music selection and same `manifestHash` on every machine — re-renders must not flap
- **Quotas**: YouTube Data API daily quota (10k units; `videos.insert` ≈ 1600) caps roughly 6 uploads/day on default quota — design must surface quota errors cleanly
- **Privacy**: OAuth tokens are personal credentials — token paths are gitignored; never committed

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Two YouTube channels, one per kid | Separate audiences and discoverability; different opponents and clubs | ✅ Shipped v1.0 |
| Filename convention encodes metadata (no sidecar) | Single-operator workflow; less to forget than a separate yaml | ✅ Shipped v1.0 (PREP-01 + PREP-02) |
| Remotion (vs. FFmpeg-only) | Cinematic typographic style is the chosen direction; Remotion makes typography programmable | ✅ Shipped v1.0 |
| Unlisted upload + manual public flip | Reviewable approval gate without re-encoding step | ✅ Shipped v1.0 (PUB-01) |
| Deterministic music pick from manifest hash | Re-renders should be byte-identical when no inputs changed; supports cache skip | ✅ Shipped v1.0 (PREP-05/06) |
| ChapterCard every clip if ≤5, else every 3 | Avoids over-titled feel on long episodes; preserves rhythm on short ones | ✅ Shipped v1.0 (REN-02) |
| Slo-mo first clip, audio muted | Music carries the opener; pitch-shifted audio sounded worse in spec discussion | ✅ Shipped v1.0 (REN-01, REN-04) |
| YouTube Audio Library only | Zero copyright risk; small pool acceptable because episodes are short | ✅ Shipped v1.0 |
| npm chosen over pnpm | pnpm not installed on dev Mac; `packageManager: "npm@10.9.0"` pinned | ✅ Plan 01-01 |
| `tsconfig.check.json` split for typecheck | Base `tsconfig.json` rootDir stays `./src` so `dist/cli/index.js` bin path is preserved; check config covers `remotion/**/*` for typecheck-only | ✅ Plan 02-01 |
| `PRIVACY_STATUS = 'unlisted' as const` typed constant | Defense-in-depth: source literal + TypeScript type + `z.literal('unlisted')` + `satisfies` bridge — accidental public upload structurally impossible | ✅ Plan 03-03 + 03-05 |
| googleapis SDK multipart (not resumable) upload | SDK auto-selects multipart for stream+requestBody; retry-from-zero handles transient drops; resumable rewrite deferred to v2 | ✅ Plan 03-03 (with override at v1 close) |
| Self-hosted fonts in `remotion/assets/fonts/` | Eliminates system-font drift for cross-machine determinism and snapshot stability | ✅ Plan 02-01 + 04-04 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

<details>
<summary>v1.0 Requirements snapshot (archived 2026-05-19 — see milestones/v1.0-REQUIREMENTS.md for full final state)</summary>

The v1.0 milestone defined 28 active requirements across 4 phases (CLI, Config, Prepare, Render, Publish, QA). All 28 shipped complete; 1 documented override on PUB-05 (multipart upload instead of resumable session protocol). Out-of-scope items: AI clip extraction, cross-game compilations, mobile/web UI, multi-operator, voiceover, daemons, cross-OS, public-by-default, licensed music, season tables.

See `milestones/v1.0-REQUIREMENTS.md` for the complete shipped requirements table with per-requirement status.

</details>

---
*Last updated: 2026-05-19 at v1.0 milestone close (initialized 2026-05-13)*
