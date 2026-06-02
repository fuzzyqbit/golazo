# golazo

## What This Is

A local-Mac CLI that turns folders of downloaded soccer highlight clips into branded, per-game YouTube episodes for two kids (12yo + 7yo). The 12-year-old's footage comes from Veo (full match — operator exports highlights manually); the 7-year-old's comes from Trace (per-player auto-clips). Each kid has their own YouTube channel; episodes are uploaded as unlisted for operator review before being flipped public.

## Core Value

Drop a folder of clips on disk, get a cinematic per-game highlight episode uploaded to the right YouTube channel — minimal hands-on time per game even at 5+ games/week.

## Current State

✅ **v2.0 shipped 2026-06-02** (built on v1.0 shipped 2026-05-19)

The CLI pipeline and web browse UI are both feature-complete and tested:

**v1.0 CLI surface:**
- `golazo prepare <folder>` writes idempotent `manifest.json` with `manifestHash`
- `golazo render <folder>` produces `episode.mp4` (cinematic Remotion composition: TitleCard → ChapterCard×Clip → Outro, slo-mo first clip, music ducking, Cormorant Garamond Italic + Inter typography, vignette grade) + `thumb.png` at 1280×720
- `golazo auth <kid>` performs YouTube OAuth and stores refreshable per-kid token
- `golazo publish <folder>` uploads as `privacyStatus: "unlisted"` with title/description templates, retries on 5xx/network with 1s/4s/16s backoff, idempotent via `publish.json` videoId
- `golazo all <folder>` chains prepare → render → publish with stage-labeled failures

**v2.0 web surface (read-only over CLI outputs):**
- `npm run web:dev` from repo root serves a localhost-only Next.js 16 + Turbopack app at `127.0.0.1:4173` with two-layer HOST defense (inline env + CLI flag + `instrumentation.ts` guard)
- `/` lists all indexed episodes with sort + per-kid chip filter + thumb posters; URL search params keep deep-link state
- `/episodes/<manifestHash>` shows rendered title + description templates, full manifest, publish.json with YouTube Studio link; `notFound()` on unknown hash
- HTML5 `<video controls preload="metadata">` streams `episode.mp4` via path-safe `/api/asset/<kid>/<game>/episode.mp4` route with HTTP Range support
- sqlite cache via `better-sqlite3 ^12` + chokidar 3.6 watcher reflects filesystem changes within 2s
- Typography echoes Remotion compositions — Cormorant Garamond Italic + Inter, same TTF bytes via `next/font/local` cross-workspace path

**Test counts:** 403 root vitest + 204 web unit + 2 Playwright E2E specs · web coverage 95% lines (gate 80%)
**Requirements:** 28/28 v1 + 22/22 v2 = 50/50 closed · 2 documented overrides (PUB-05 multipart, WEB-QA-03 live run)

See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md), [milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md), [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md), and [milestones/v2.0-REQUIREMENTS.md](milestones/v2.0-REQUIREMENTS.md).

## Next Milestone Goals

*(Not yet defined. Start with `/gsd-new-milestone` to define v2.1 or v3.0 scope.)*

Carry-forward candidates from v2.0:

- **WEB-E2E-LIVE-RUN** — Operator-side `npx playwright install chromium && npm run web:e2e` smoke before any unlisted→public flip on YouTube. The specs are written and pass static gates; live browser execution is the final pre-public gate that hasn't been pinned by an automated run yet
- **WEB-VISUAL-REGRESSION** — Pixelmatch snapshots of `/` and `/episodes/<hash>` to catch typographic drift across Cormorant Garamond + Inter rendering on macOS upgrades
- **WEB-E2E-CROSS-BROWSER** — Firefox + Webkit Playwright projects (currently Chromium-only)
- **WEB-TRIGGER** — Trigger render/publish from browser with real-time progress
- **WEB-EDIT** — Override title/description/score before publish
- **WEB-LAN** — LAN-accessible mode with shared-token auth for phone/iPad

Carry-forwards from v1.0 (still open after v2.0):

- **v1.0-typecheck-debt** — Fix 7 pre-existing tsc errors in src/cli/all.test.ts + src/publish/oauth.test.ts + retry.test.ts + runner.test.ts. Vitest tolerates them, tsc does not. Affects IDE DX, not runtime
- **PUB-05-resumable** — Replace googleapis SDK upload with raw HTTP resumable upload session protocol (initiation POST → session URI → `Content-Range` PUT on retry)
- **OAuth-DI** — Replace `GOLAZO_OAUTH_MOCK=1` env-var branch in `exchangeCode` with injectable factory pattern
- **QA-03-extended** — Commit 6+-clip fixture + integration render for visual chapter-rhythm regression coverage

Other directions to consider when scoping the next milestone:

- Real-world smoke on production YouTube accounts (no actual upload has happened yet)
- Auto-detect Veo vs Trace footage source from folder content (currently declared in `channels.yaml`)
- Multi-game recap mode (explicit v1+v2 out-of-scope; revisit when v2 is operationally validated)
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
| Web UI under `web/` subdir as separate milestone (not v1 sprint) | Keeps CLI core stable; web is a read-only surface over filesystem outputs; localhost-only access control | ✅ Shipped v2.0 |
| npm workspace `@golazo/cli` + `@golazo/web` (in-place, not `packages/` restructure) | Preserves all 387 v1.0 test fixture paths + `dist/cli/index.js` bin contract | ✅ Plan 05-01 |
| Localhost-only enforced by two-layer defense | CLI flag `-H 127.0.0.1` + inline `HOST=127.0.0.1` env override + `instrumentation.ts` runtime guard with `WEB-03` stderr token. Neither layer alone is sufficient (`-H` doesn't override env HOST) | ✅ Plan 05-03 |
| `better-sqlite3` cache, filesystem-authoritative | Sync API + native binding; sqlite is invalidatable by manifestHash regex peek + mtime; chokidar 500ms per-folder debounce reflects changes in <2s | ✅ Plan 06-02 + 06-03 |
| Server Component reads via `getDiscoveryRuntime()`; only `EpisodeList` is `'use client'` | Prevents sqlite/node:fs reach across client boundary; URL state mutations re-render server-side via `router.replace` | ✅ Plan 07-03 |
| `assertSafeAssetPath` extracted as helper (Phase 7 → Phase 8 reuse) | Path-safety logic written once for thumb.png route, reused verbatim for episode.mp4 + Range route | ✅ Plan 07-03 → 08-01 |
| Range parser inline (~107 LOC, single-range RFC 7233) | Multipart ranges not needed for video players; malformed → 200 full per RFC §2.1; unsatisfiable → 416 | ✅ Plan 08-01 |
| Playwright Chromium-only | Single-operator Mac, primary browser is Chromium; Firefox + Webkit add ~600MB + ~2× runtime; deferred to v2.1 `WEB-E2E-CROSS-BROWSER` | ✅ Plan 08-04 |
| Coverage gate enforced (≤10 exclusions, ≥60% surface floor) | Prevents denominator-shrink gaming of the 80% line threshold | ✅ Plan 08-03 |

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

<details>
<summary>v2.0 Requirements snapshot (archived 2026-06-02 — see milestones/v2.0-REQUIREMENTS.md for full final state)</summary>

The v2.0 milestone defined 22 active requirements across 4 phases (Web Foundation, Discovery+Indexing, Browse Surface, Detail+Playback, Quality+Testing). All 22 shipped complete; 1 documented override on WEB-QA-03 (live browser run via `npm run web:e2e` deferred to operator-side smoke before any unlisted→public YouTube flip). Out-of-scope items: render/publish from browser, multi-user auth, LAN access, cross-OS, public-by-default discovery, mobile-first responsive.

See `milestones/v2.0-REQUIREMENTS.md` for the complete shipped requirements table with per-requirement status.

</details>

---
*Last updated: 2026-06-02 at v2.0 milestone close (initialized 2026-05-13)*
