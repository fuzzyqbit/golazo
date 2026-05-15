# Requirements: golazo

**Defined:** 2026-05-13
**Core Value:** Drop a folder of clips on disk, get a cinematic per-game highlight episode uploaded to the right YouTube channel — minimal hands-on time per game even at 5+ games/week.

## v1 Requirements

### CLI

- [x] **CLI-01**: Operator can run `golazo prepare <folder>`, `golazo render <folder>`, `golazo publish <folder>` as separate idempotent subcommands; each is safe to re-run and only acts when needed
- [x] **CLI-02**: Operator can run `golazo all <folder>` to chain prepare → render → publish in one invocation
- [x] **CLI-03**: Operator can run `golazo auth <kid>` once per kid to perform YouTube OAuth and persist a refreshable token at the path declared in `channels.yaml`

### Config

- [x] **CFG-01**: Operator can edit a single `channels.yaml` file holding per-kid branding (name, club, jersey, accent hex, footage source) and YouTube channel binding (channel id, oauth token path)
- [x] **CFG-02**: `channels.yaml` is validated at load time; invalid hex, jersey out of range, or missing token path fail with a clear remediation message

### Prepare

- [x] **PREP-01**: Pipeline parses folder name `YYYY-MM-DD_vs_<slug>_<for>-<against>` into `{date, opponent, scoreFor, scoreAgainst, result}`; malformed names fail loudly with the expected format echoed
- [x] **PREP-02**: Pipeline derives kid identity (`leo` / `mateo`) from the parent directory under `~/golazo/<kid>/...` and rejects unknown kids with the list of valid keys
- [x] **PREP-03**: Pipeline discovers ordered clips by numeric filename prefix (`01-`, `02-`, ...); rejects folders with zero matching clips and lists skipped files
- [x] **PREP-04**: Pipeline probes each clip with `ffprobe` and records duration in the manifest; corrupt clips fail loudly by file name
- [x] **PREP-05**: Pipeline picks a music track deterministically from a curated YouTube Audio Library pool, seeded by `manifestHash` so re-renders are byte-stable
- [x] **PREP-06**: Pipeline handles music vs episode length — trim+fade when track ≥ episode; deterministic re-roll for a longer track when shorter; crossfade two passes as final fallback with a stdout warning
- [x] **PREP-07**: Pipeline writes `<folder>/.golazo/manifest.json` whose `manifestHash` is sha256 over the sorted `(clipFile, clipSha256)` pairs plus the folder name (music and render metadata excluded), enabling stable cache invalidation

### Render

- [x] **REN-01**: Remotion `Episode` composition sequences `TitleCard → (ChapterCard → Clip)× → Outro`; the first clip plays at 0.5× rate with original audio muted
- [x] **REN-02**: ChapterCard rhythm is rendered every clip when total clips ≤ 5, otherwise grouped every 3 clips
- [x] **REN-03**: Cinematic visual grade is applied (vignette + filter) and typography uses Cormorant Garamond Italic (display) + Inter (label), self-hosted under `remotion/assets/fonts/`
- [x] **REN-04**: Music is ducked under any clip with audible audio and muted entirely during the slo-mo first clip
- [x] **REN-05**: Remotion `Thumbnail` composition produces a pure-typographic 1280×720 PNG seeded from the same manifest
- [x] **REN-06**: Render driver spawns Remotion CLI programmatically, writes `episode.mp4` and `thumb.png` into `<folder>/.golazo/`, and skips when `manifestHash` matches the recorded render unless `--force`

### Publish

- [x] **PUB-01**: `publish` uploads `episode.mp4` via YouTube Data API v3 `videos.insert` with `privacyStatus: "unlisted"`, attaches the rendered thumbnail, and applies title/description templates from manifest + channel config
- [x] **PUB-02**: Title and description templates substitute `{Kid}`, `{Opponent}`, `{scoreFor}`, `{scoreAgainst}`, `{result}`, `{date}`, `{jersey}`, `{club}`, and `{source}` from manifest + channel data
- [x] **PUB-03**: Opponent slug is pretty-printed via title-case + hyphen-to-space, with an acronym allow-list (`sc`, `fc`, `ac`) preserved upper-case
- [x] **PUB-04**: OAuth tokens are stored per-kid at the path declared in `channels.yaml`; tokens refresh silently on use; refresh failures print a clear prompt to rerun `golazo auth <kid>`
- [x] **PUB-05**: Network and 5xx failures retry up to 3 times with exponential backoff (1s, 4s, 16s); large uploads use the YouTube resumable upload protocol so a mid-upload network drop resumes from the last chunk
- [x] **PUB-06**: Quota-exhausted responses (HTTP 403 `quotaExceeded`) fail loudly with a "rerun tomorrow" remediation hint and do not write `publish.json`
- [x] **PUB-07**: `publish.json` records `videoId`, `watchUrl`, `uploadedAt`, `channelId`, `privacyStatus`; presence of `videoId` short-circuits subsequent runs unless `--force`

### QA

- [x] **QA-01**: Unit tests (vitest, table-driven) cover the filename parser, channels loader, music-picker determinism, and title/description renderers
- [x] **QA-02**: Integration tests cover `prepare` against a shipped clip fixture, low-resolution `render` end-to-end, and `publish` with `nock`-stubbed YouTube API; coverage ≥ 80% lines on `src/`
- [ ] **QA-03**: Remotion compositions are pinned by committed `renderStill` snapshots (one TitleCard frame + Thumbnail) with a 1% pixel-diff threshold

## v2 Requirements

(none — operator deferred all stretch features to keep v1 lean)

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI player identification or clip extraction | Operator supplies already-filtered clips from Veo Editor / Trace; no need to find players in raw match footage |
| Cross-game compilations (weekly recaps, season montages) | Episode = one game; recap surfaces are a future product, not v1 |
| Mobile or web UI | CLI is sufficient for one-operator local workflow |
| Multi-operator support | Single operator (one parent) on one Mac |
| Voiceover, on-screen statistics, in-game commentary | Cinematic typographic style only — score line is the only on-screen data |
| Folder-watcher daemons or cloud execution | Manual local trigger only; explicitly chosen to keep the system reviewable |
| Cross-OS rendering (Windows / Linux) | macOS-only; ffmpeg path and font installation assume Homebrew layout |
| Public-by-default publishing | Every upload is unlisted; operator promotes manually in YouTube Studio |
| Licensed music (Epidemic Sound, Artlist, custom tracks) | YouTube Audio Library only — zero copyright risk for a small audience channel |
| Cross-game scoring or season tables | Filename-encoded date / opponent / score is the only metadata |
| Sidecar metadata files (yaml/json) | Filename convention chosen instead — less to forget for a solo operator |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLI-01 | Phase 1 | Complete |
| CLI-02 | Phase 4 | Complete |
| CLI-03 | Phase 3 | Complete |
| CFG-01 | Phase 1 | Complete |
| CFG-02 | Phase 1 | Complete |
| PREP-01 | Phase 1 | Complete |
| PREP-02 | Phase 1 | Complete |
| PREP-03 | Phase 1 | Complete |
| PREP-04 | Phase 1 | Complete |
| PREP-05 | Phase 2 | Complete |
| PREP-06 | Phase 2 | Complete |
| PREP-07 | Phase 1 | Complete |
| REN-01 | Phase 2 | Complete |
| REN-02 | Phase 2 | Complete |
| REN-03 | Phase 2 | Complete |
| REN-04 | Phase 2 | Complete |
| REN-05 | Phase 2 | Complete |
| REN-06 | Phase 2 | Complete |
| PUB-01 | Phase 3 | Complete |
| PUB-02 | Phase 3 | Complete |
| PUB-03 | Phase 3 | Complete |
| PUB-04 | Phase 3 | Complete |
| PUB-05 | Phase 3 | Complete |
| PUB-06 | Phase 3 | Complete |
| PUB-07 | Phase 3 | Complete |
| QA-01 | Phase 4 | Complete |
| QA-02 | Phase 4 | Complete |
| QA-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28 ✓
- Unmapped: 0

**Phase distribution:**
- Phase 1 (Foundation & Prepare Pipeline): 8 requirements — CLI-01, CFG-01, CFG-02, PREP-01, PREP-02, PREP-03, PREP-04, PREP-07
- Phase 2 (Render Pipeline): 8 requirements — PREP-05, PREP-06, REN-01, REN-02, REN-03, REN-04, REN-05, REN-06
- Phase 3 (Publish Pipeline): 8 requirements — CLI-03, PUB-01, PUB-02, PUB-03, PUB-04, PUB-05, PUB-06, PUB-07
- Phase 4 (Convenience & QA Polish): 4 requirements — CLI-02, QA-01, QA-02, QA-03

---
*Requirements defined: 2026-05-13*
*Last updated: 2026-05-13 after roadmap creation (28/28 v1 requirements mapped to 4 phases by gsd-roadmapper)*
