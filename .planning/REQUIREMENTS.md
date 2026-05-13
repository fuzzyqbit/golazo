# Requirements: golazo

**Defined:** 2026-05-13
**Core Value:** Drop a folder of clips on disk, get a cinematic per-game highlight episode uploaded to the right YouTube channel — minimal hands-on time per game even at 5+ games/week.

## v1 Requirements

### CLI

- [ ] **CLI-01**: Operator can run `golazo prepare <folder>`, `golazo render <folder>`, `golazo publish <folder>` as separate idempotent subcommands; each is safe to re-run and only acts when needed
- [ ] **CLI-02**: Operator can run `golazo all <folder>` to chain prepare → render → publish in one invocation
- [ ] **CLI-03**: Operator can run `golazo auth <kid>` once per kid to perform YouTube OAuth and persist a refreshable token at the path declared in `channels.yaml`

### Config

- [ ] **CFG-01**: Operator can edit a single `channels.yaml` file holding per-kid branding (name, club, jersey, accent hex, footage source) and YouTube channel binding (channel id, oauth token path)
- [ ] **CFG-02**: `channels.yaml` is validated at load time; invalid hex, jersey out of range, or missing token path fail with a clear remediation message

### Prepare

- [ ] **PREP-01**: Pipeline parses folder name `YYYY-MM-DD_vs_<slug>_<for>-<against>` into `{date, opponent, scoreFor, scoreAgainst, result}`; malformed names fail loudly with the expected format echoed
- [ ] **PREP-02**: Pipeline derives kid identity (`leo` / `mateo`) from the parent directory under `~/golazo/<kid>/...` and rejects unknown kids with the list of valid keys
- [ ] **PREP-03**: Pipeline discovers ordered clips by numeric filename prefix (`01-`, `02-`, ...); rejects folders with zero matching clips and lists skipped files
- [ ] **PREP-04**: Pipeline probes each clip with `ffprobe` and records duration in the manifest; corrupt clips fail loudly by file name
- [ ] **PREP-05**: Pipeline picks a music track deterministically from a curated YouTube Audio Library pool, seeded by `manifestHash` so re-renders are byte-stable
- [ ] **PREP-06**: Pipeline handles music vs episode length — trim+fade when track ≥ episode; deterministic re-roll for a longer track when shorter; crossfade two passes as final fallback with a stdout warning
- [ ] **PREP-07**: Pipeline writes `<folder>/.golazo/manifest.json` whose `manifestHash` is sha256 over the sorted `(clipFile, clipSha256)` pairs plus the folder name (music and render metadata excluded), enabling stable cache invalidation

### Render

- [ ] **REN-01**: Remotion `Episode` composition sequences `TitleCard → (ChapterCard → Clip)× → Outro`; the first clip plays at 0.5× rate with original audio muted
- [ ] **REN-02**: ChapterCard rhythm is rendered every clip when total clips ≤ 5, otherwise grouped every 3 clips
- [ ] **REN-03**: Cinematic visual grade is applied (vignette + filter) and typography uses Cormorant Garamond Italic (display) + Inter (label), self-hosted under `remotion/assets/fonts/`
- [ ] **REN-04**: Music is ducked under any clip with audible audio and muted entirely during the slo-mo first clip
- [ ] **REN-05**: Remotion `Thumbnail` composition produces a pure-typographic 1280×720 PNG seeded from the same manifest
- [ ] **REN-06**: Render driver spawns Remotion CLI programmatically, writes `episode.mp4` and `thumb.png` into `<folder>/.golazo/`, and skips when `manifestHash` matches the recorded render unless `--force`

### Publish

- [ ] **PUB-01**: `publish` uploads `episode.mp4` via YouTube Data API v3 `videos.insert` with `privacyStatus: "unlisted"`, attaches the rendered thumbnail, and applies title/description templates from manifest + channel config
- [ ] **PUB-02**: Title and description templates substitute `{Kid}`, `{Opponent}`, `{scoreFor}`, `{scoreAgainst}`, `{result}`, `{date}`, `{jersey}`, `{club}`, and `{source}` from manifest + channel data
- [ ] **PUB-03**: Opponent slug is pretty-printed via title-case + hyphen-to-space, with an acronym allow-list (`sc`, `fc`, `ac`) preserved upper-case
- [ ] **PUB-04**: OAuth tokens are stored per-kid at the path declared in `channels.yaml`; tokens refresh silently on use; refresh failures print a clear prompt to rerun `golazo auth <kid>`
- [ ] **PUB-05**: Network and 5xx failures retry up to 3 times with exponential backoff (1s, 4s, 16s); large uploads use the YouTube resumable upload protocol so a mid-upload network drop resumes from the last chunk
- [ ] **PUB-06**: Quota-exhausted responses (HTTP 403 `quotaExceeded`) fail loudly with a "rerun tomorrow" remediation hint and do not write `publish.json`
- [ ] **PUB-07**: `publish.json` records `videoId`, `watchUrl`, `uploadedAt`, `channelId`, `privacyStatus`; presence of `videoId` short-circuits subsequent runs unless `--force`

### QA

- [ ] **QA-01**: Unit tests (vitest, table-driven) cover the filename parser, channels loader, music-picker determinism, and title/description renderers
- [ ] **QA-02**: Integration tests cover `prepare` against a shipped clip fixture, low-resolution `render` end-to-end, and `publish` with `nock`-stubbed YouTube API; coverage ≥ 80% lines on `src/`
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

(empty — populated by `gsd-roadmapper` in Step 8)

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLI-01 | TBD | Pending |
| CLI-02 | TBD | Pending |
| CLI-03 | TBD | Pending |
| CFG-01 | TBD | Pending |
| CFG-02 | TBD | Pending |
| PREP-01 | TBD | Pending |
| PREP-02 | TBD | Pending |
| PREP-03 | TBD | Pending |
| PREP-04 | TBD | Pending |
| PREP-05 | TBD | Pending |
| PREP-06 | TBD | Pending |
| PREP-07 | TBD | Pending |
| REN-01 | TBD | Pending |
| REN-02 | TBD | Pending |
| REN-03 | TBD | Pending |
| REN-04 | TBD | Pending |
| REN-05 | TBD | Pending |
| REN-06 | TBD | Pending |
| PUB-01 | TBD | Pending |
| PUB-02 | TBD | Pending |
| PUB-03 | TBD | Pending |
| PUB-04 | TBD | Pending |
| PUB-05 | TBD | Pending |
| PUB-06 | TBD | Pending |
| PUB-07 | TBD | Pending |
| QA-01 | TBD | Pending |
| QA-02 | TBD | Pending |
| QA-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 28 ⚠️ (resolved by roadmapper)

---
*Requirements defined: 2026-05-13*
*Last updated: 2026-05-13 after initial definition (synthesized from `docs/superpowers/specs/2026-05-13-golazo-design.md`)*
