# golazo

## What This Is

A local-Mac CLI that turns folders of downloaded soccer highlight clips into branded, per-game YouTube episodes for two kids (12yo + 7yo). The 12-year-old's footage comes from Veo (full match — operator exports highlights manually); the 7-year-old's comes from Trace (per-player auto-clips). Each kid has their own YouTube channel; episodes are uploaded as unlisted for operator review before being flipped public.

## Core Value

Drop a folder of clips on disk, get a cinematic per-game highlight episode uploaded to the right YouTube channel — minimal hands-on time per game even at 5+ games/week.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **CLI-01**: Three subcommands — `golazo prepare <folder>`, `golazo render <folder>`, `golazo publish <folder>` — each idempotent and safe to re-run
- [ ] **CLI-02**: Convenience subcommand `golazo all <folder>` runs prepare → render → publish in sequence
- [ ] **CLI-03**: One-time per-kid `golazo auth <kid>` subcommand performs YouTube OAuth and stores refreshable token
- [ ] **CFG-01**: Single `channels.yaml` holds per-kid branding (name, club, jersey, accent color, footage source) and YouTube channel binding
- [ ] **CFG-02**: Channel config validated at load time (zod schema): hex accent, jersey 1–99, oauth token path exists
- [ ] **PREP-01**: Folder-name parser extracts `{date, opponent, scoreFor, scoreAgainst}` from `YYYY-MM-DD_vs_<slug>_<for>-<against>` convention, throws on malformed input
- [ ] **PREP-02**: Kid identity (`leo` / `mateo`) derived from parent directory under `~/golazo/<kid>/...`
- [ ] **PREP-03**: Clip discovery sorts ordered clips by numeric filename prefix; rejects folders with zero matching clips
- [ ] **PREP-04**: ffprobe wrapper records per-clip duration into manifest
- [ ] **PREP-05**: Music picker selects deterministically from a curated YouTube Audio Library pool, seeded by `manifestHash` so re-renders are stable
- [ ] **PREP-06**: Music duration handling — trim+fade if track ≥ episode; re-roll for longer track if shorter; crossfade fallback if pool has none long enough
- [ ] **PREP-07**: Manifest written to `<folder>/.golazo/manifest.json`; `manifestHash` is sha256 over sorted `(clipFile, clipSha256)` pairs + folder name (music + render metadata excluded)
- [ ] **REN-01**: Remotion `Episode` composition sequences `TitleCard → (ChapterCard → Clip)× → Outro`; first clip plays at 0.5× rate with original audio muted
- [ ] **REN-02**: ChapterCard rhythm — every clip if total ≤ 5, otherwise grouped every 3 clips
- [ ] **REN-03**: Cinematic grade applied via Remotion CSS filter; serif italic display font (Cormorant Garamond Italic) + sans label font (Inter), self-hosted
- [ ] **REN-04**: Music ducked under any clip audio; muted entirely during slo-mo first clip
- [ ] **REN-05**: Remotion `Thumbnail` composition produces a pure typographic 1280×720 PNG seeded from the same manifest
- [ ] **REN-06**: Render driver spawns Remotion CLI programmatically, writes `episode.mp4` + `thumb.png` into `<folder>/.golazo/`, skips when `manifestHash` matches unless `--force`
- [ ] **PUB-01**: `publish` uploads `episode.mp4` via YouTube Data API v3 `videos.insert` with `privacyStatus: "unlisted"` and renders title/description templates from manifest + channel
- [ ] **PUB-02**: Description and title templates substitute `{Kid}`, `{Opponent}`, `{scoreFor}`, `{scoreAgainst}`, `{result}`, `{date}`, `{jersey}`, `{club}`, `{source}`
- [ ] **PUB-03**: Opponent slug pretty-printed via title-case + hyphen-to-space, with acronym allow-list (sc, fc, ac) preserved upper-case
- [ ] **PUB-04**: OAuth tokens stored per-kid at the path declared in `channels.yaml`; silent refresh on use; clear remediation when refresh fails
- [ ] **PUB-05**: Network/5xx retry with 3 attempts and exponential backoff (1s, 4s, 16s); resumable upload protocol used for large files
- [ ] **PUB-06**: Quota-exhausted (HTTP 403 `quotaExceeded`) fails loudly with next-day rerun hint
- [ ] **PUB-07**: `publish.json` records `videoId`, `watchUrl`, `uploadedAt`, `channelId`, `privacyStatus`; presence of `videoId` short-circuits subsequent runs unless `--force`
- [ ] **QA-01**: Unit tests cover filename parser, channels loader, music picker determinism, template renderers; vitest, table-driven
- [ ] **QA-02**: Integration tests cover `prepare` on a shipped fixture, low-res `render` end-to-end, `publish` with nock-stubbed YouTube API; 80% line coverage on `src/`
- [ ] **QA-03**: Remotion compositions verified via committed `renderStill` snapshots (TitleCard frame + Thumbnail) with 1% pixel-diff threshold

### Out of Scope

- AI player identification or clip extraction — operator supplies already-filtered clips; no need to find players in Veo footage
- Cross-game compilations (weekly recaps, season montages) — episode = one game
- Mobile or web UI — CLI only
- Multi-operator support — single operator on one Mac
- Voiceover, on-screen statistics, commentary — typographic title + score line only
- Folder-watcher daemons or cloud execution — manual local trigger only
- Cross-OS rendering (Windows / Linux) — macOS only, font and ffmpeg paths assume Homebrew layout
- Public-by-default publishing — every upload is unlisted; operator promotes manually in YouTube Studio
- Music outside YouTube Audio Library — no Epidemic Sound, Artlist, or custom tracks (copyright risk)
- Cross-game scoring or season tables — date/opponent/score in filename is the only metadata

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
| Two YouTube channels, one per kid | Separate audiences and discoverability; different opponents and clubs | — Pending |
| Filename convention encodes metadata (no sidecar) | Single-operator workflow; less to forget than a separate yaml | — Pending |
| Remotion (vs. FFmpeg-only) | Cinematic typographic style is the chosen direction; Remotion makes typography programmable | — Pending |
| Unlisted upload + manual public flip | Reviewable approval gate without re-encoding step | — Pending |
| Deterministic music pick from manifest hash | Re-renders should be byte-identical when no inputs changed; supports cache skip | — Pending |
| ChapterCard every clip if ≤5, else every 3 | Avoids over-titled feel on long episodes; preserves rhythm on short ones | — Pending |
| Slo-mo first clip, audio muted | Music carries the opener; pitch-shifted audio sounded worse in spec discussion | — Pending |
| YouTube Audio Library only | Zero copyright risk; small pool acceptable because episodes are short | — Pending |

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

---
*Last updated: 2026-05-13 after initialization (synthesized from `docs/superpowers/specs/2026-05-13-golazo-design.md`)*
