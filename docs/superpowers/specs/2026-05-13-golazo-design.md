# golazo — Design Spec

**Date:** 2026-05-13
**Status:** Approved for planning

## Problem

Two sons (12 and 7) play 5+ soccer games per week between them. Game footage is recorded by third-party services — Veo for the 12-year-old, Trace for the 7-year-old. Both services produce downloadable highlight clips already filtered to the relevant player. We want to publish per-game highlight episodes to two separate YouTube channels (one per kid, audience: family, teammates, recruiters someday), with minimal hands-on time per game.

The bottleneck is the editing and publishing layer: turning a folder of raw clips into a branded episode and getting it onto the right channel.

## Goals

1. One CLI command per stage: prepare, render, publish.
2. Per-game episode produced from a folder of clips dropped onto disk.
3. Cinematic visual style: serif italic typography, chapter cards between clips, vignette/grade, slo-mo first clip.
4. Pure typographic thumbnail generated per game.
5. YouTube Audio Library tracks only (no copyright risk).
6. Upload as **unlisted**; human reviews in YouTube Studio and flips to public.
7. Local-only execution on macOS. Manual trigger. No daemons, no cloud.

## Non-Goals

- AI player identification or clip extraction. Inputs are already filtered to the player.
- Cross-game compilation (season recaps, weekly roundups). Episode = one game.
- Mobile or web UI. CLI only.
- Multi-user support. Single operator (parent) on one Mac.
- Commentary, voiceover, on-screen statistics beyond score line.

## Inputs

A folder per game. Folder name encodes metadata via a strict convention:

```
<YYYY-MM-DD>_vs_<opponent-slug>_<scoreFor>-<scoreAgainst>
```

Examples:

```
~/golazo/leo/2026-05-13_vs_united_3-1/
~/golazo/mateo/2026-05-12_vs_city-sc_2-2/
```

Inside the folder: ordered clips named with a numeric prefix.

```
01-clip.mp4
02-clip.mp4
03-clip.mp4
```

Parent directory under `~/golazo/` (`leo`, `mateo`) selects the kid and therefore the channel.

## Architecture

Single Node/TypeScript project. One CLI binary `golazo` with subcommands:

```
golazo prepare <folder>   Parse metadata, scan clips, write manifest
golazo render  <folder>   Render episode.mp4 + thumb.png via Remotion
golazo publish <folder>   Upload to correct YouTube channel as unlisted
golazo auth    <kid>      One-time OAuth flow for a channel
golazo all     <folder>   Convenience: prepare → render → publish
```

State for each game is colocated in its folder under `.golazo/`:

```
~/golazo/leo/2026-05-13_vs_united_3-1/
  01-clip.mp4
  02-clip.mp4
  03-clip.mp4
  .golazo/
    manifest.json
    episode.mp4
    thumb.png
    publish.json
```

Top-level project layout:

```
golazo/
  src/
    cli/                  commander.js entry, 3 subcommands + auth + all
    prepare/              filename parser, manifest builder
    render/               Remotion driver, ffprobe wrapper, music picker
    publish/              YouTube Data API client, OAuth
    config/               channels.yaml loader
  remotion/
    Episode.tsx           main composition
    Thumbnail.tsx         still composition
    components/           TitleCard, ChapterCard, Clip, Outro
    assets/music/         YouTube Audio Library .mp3 pool + metadata json
    assets/fonts/         serif italic display + sans label
  channels.yaml           per-kid branding + youtube auth pointers
  tests/
    fixtures/             tiny H.264 clips for prepare/render tests
  package.json
```

### channels.yaml

Single source of branding and channel routing.

```yaml
leo:
  name: "Leo"
  club: "FC Eagles"
  jersey: 10
  accent: "#ffce5a"
  source: "Veo"          # used in description template
  youtube:
    channel_id: "UC..."
    oauth_token: "~/.golazo/leo.token.json"
mateo:
  name: "Mateo"
  club: "City SC"
  jersey: 7
  accent: "#5acfff"
  source: "Trace"
  youtube:
    channel_id: "UC..."
    oauth_token: "~/.golazo/mateo.token.json"
```

Validated at load time via Zod. Throws on missing key, invalid hex, jersey out of range, missing token file.

## Components

Each module has one purpose, a clear interface, and is testable in isolation.

| Module | Purpose |
|---|---|
| `config/channels.ts` | Load + validate `channels.yaml`. Export `loadChannel(kidKey): ChannelConfig`. |
| `prepare/filename.ts` | Pure parser: `parseFilename(folderName) → GameMeta`. No I/O. Throws `FilenameError` on malformed input. |
| `prepare/manifest.ts` | Orchestrates folder scan, clip sorting, ffprobe pass, manifest write. Idempotent. |
| `render/probe.ts` | Wraps `ffprobe` to read per-clip duration. Cached in manifest. |
| `render/music.ts` | Deterministic music pick from `remotion/assets/music/`. Selection seeded by manifest hash so re-renders are stable. |
| `render/index.ts` | Spawns Remotion CLI programmatically. Passes manifest as `inputProps`. Renders `Episode` and `Thumbnail` compositions to `.golazo/`. |
| `remotion/Episode.tsx` | Composition root. Sequences TitleCard → (ChapterCard → Clip)× → Outro. First clip plays at 0.5× via `playbackRate`. Music ducked under match audio. Cinematic grade via CSS filter. |
| `remotion/Thumbnail.tsx` | Pure typographic 1280×720 still. Reads same manifest. |
| `publish/youtube.ts` | Uploads `episode.mp4` via YouTube Data API v3 `videos.insert` with `privacyStatus: "unlisted"`. Applies title/description templates. Writes `publish.json`. Idempotent — exits early if `videoId` already recorded. |
| `publish/oauth.ts` | One-time interactive OAuth flow per kid. Stores token at path from `channels.yaml`. Silently refreshes on use. |
| `cli/index.ts` | commander.js entry. Dispatches subcommands. |

**Dependency direction:** `cli → {prepare, render, publish, oauth} → config`. `render` spawns Remotion as a subprocess. `publish` calls YouTube SDK. No cycles.

## Data Flow

### Manifest schema

The contract between stages. Written by `prepare`, read by `render` and `publish`.

```jsonc
{
  "version": 1,
  "kid": "leo",
  "game": {
    "date": "2026-05-13",
    "opponent": "united",
    "scoreFor": 3,
    "scoreAgainst": 1,
    "result": "W"
  },
  "clips": [
    { "file": "01-clip.mp4", "durationSec": 4.2 },
    { "file": "02-clip.mp4", "durationSec": 6.8 }
  ],
  "totalDurationSec": 11.0,
  "music": { "track": "atmos-03.mp3", "durationSec": 142.0 },
  "render": {
    "episodePath": ".golazo/episode.mp4",
    "thumbnailPath": ".golazo/thumb.png",
    "renderedAt": "2026-05-13T18:00:00Z",
    "manifestHash": "sha256:..."
  }
}
```

`publish.json` is separate so re-render does not invalidate uploaded videos:

```jsonc
{
  "videoId": "abc123",
  "watchUrl": "https://youtu.be/abc123",
  "uploadedAt": "2026-05-13T18:05:00Z",
  "channelId": "UC...",
  "privacyStatus": "unlisted"
}
```

### End-to-end flow for one game

1. **User drops clips** into `~/golazo/<kid>/<game-folder>/`.
2. **`golazo prepare <folder>`** — parses folder name, sorts and probes clips, picks music, writes `.golazo/manifest.json`.
3. **`golazo render <folder>`** — loads manifest + channel config, renders `Episode` and `Thumbnail` compositions, writes `.golazo/episode.mp4` and `.golazo/thumb.png`.
4. **`golazo publish <folder>`** — loads manifest, loads OAuth token for the kid's channel, uploads with title/description templates and thumbnail. Privacy = unlisted. Writes `.golazo/publish.json`. Prints watch URL.
5. **User opens YouTube Studio**, reviews, flips to public.
6. **`golazo all <folder>`** runs steps 2→4 in one invocation.

### Templates

**Title:**
```
{Kid} · vs {Opponent} · {scoreFor}–{scoreAgainst} {result} · {date}
```

**Description:**
```
Match Day · {date}
{Kid} (#{jersey}, {club}) vs {Opponent}
Final: {scoreFor}–{scoreAgainst}

Filmed via {source}. Edited with golazo.
```

Opponent slug → pretty form via title-case + hyphen-to-space (`city-sc` → `City SC`). Acronym list (`sc`, `fc`, `ac`) preserved upper-case via a small allow-list.

### Idempotency

Every subcommand is safe to re-run.

`manifestHash` is `sha256` over the sorted list of `(clipFile, clipSha256)` pairs plus the folder name. Music track and render metadata are excluded so picking a new track or re-running `render` does not flap the hash.

- `prepare` rewrites manifest only when folder contents hash differs from the recorded `manifestHash`.
- `render` skips if `manifestHash` matches; force re-render via `--force`.
- `publish` skips if `publish.json.videoId` is present; force re-upload via `--force`.

### Music duration handling

- If `track.durationSec >= totalDurationSec`: trim with a 1s fade-out at episode end.
- If `track.durationSec < totalDurationSec`: pick a longer track from the pool (deterministic re-roll seeded by `manifestHash + retryIndex`). If no track in the pool is long enough, concatenate two passes with a 0.5s crossfade and warn in stdout.

## Error Handling

All errors print path + reason + remediation hint. No silent swallows.

| Failure | Behavior |
|---|---|
| Filename regex mismatch | `FilenameError` with expected format echoed. `prepare` aborts. |
| Empty folder / wrong extensions | `prepare` aborts, lists skipped files. |
| ffprobe failure on a clip | `prepare` aborts, names the file. |
| Kid key not in `channels.yaml` | `prepare` aborts with list of valid keys. |
| Remotion render crash | Non-zero exit bubbles up with stderr. Manifest `render` block not written; rerun is safe. |
| YouTube network / 5xx | Retry 3× with exponential backoff (1s, 4s, 16s), then fail. |
| YouTube quota exhausted (403 `quotaExceeded`) | Fail with clear message. User reruns next day. |
| OAuth token expired | Silent refresh via stored refresh token; on refresh failure, prompt to rerun `golazo auth <kid>`. |
| Upload response missing `videoId` | Fail. `publish.json` not written. |
| Mid-upload network drop | YouTube resumable upload protocol retries chunks at SDK layer. |

## Testing

Stack: Vitest + nock for HTTP stubs + Remotion's `renderStill` for visual snapshots.

**Unit:**
- `prepare/filename.ts` — table-driven cases (valid, malformed date, missing `_vs_`, non-numeric score, hyphenated opponent).
- `config/channels.ts` — valid yaml, missing key, invalid hex accent, jersey out of range.
- `render/music.ts` — same manifest hash yields same track; different hash yields different track.
- Title and description template renderers — golden snapshots.

**Integration:**
- `prepare` against `tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/` (3 generated 2-second 320×180 H.264 clips, ~50KB total, committed). Asserts manifest matches schema.
- `render` end-to-end at low resolution (320×180, 1 fps) for CI speed. Asserts file exists and ffprobe duration matches expected.
- `publish` against YouTube Data API stubbed with `nock`. Asserts request body shape (`privacyStatus=unlisted`, title template applied) and `publish.json` is written correctly.

**Visual regression:**
- `remotion/Episode.tsx` and `remotion/Thumbnail.tsx` excluded from line coverage.
- Snapshot a baseline `Thumbnail` PNG and one `Episode` title-card frame via `renderStill`, committed under `tests/snapshots/`. Pixel-diff threshold 1%.

**Manual / E2E (documented, not in CI):**
- One real upload to a throwaway test channel during initial setup to verify the OAuth flow and real API contract.

**Coverage:** 80% lines for `src/`. Remotion components excluded (visual regression covers them).

**Not tested:**
- YouTube quota behavior (cannot simulate cheaply).
- Real OAuth flow (manual setup).
- Font rendering across operating systems (target is macOS only).

## Open Items for the Implementation Plan

- Selecting a small initial music pool (~6–10 tracks) from YouTube Audio Library and committing them under `remotion/assets/music/` with metadata json (title, BPM, duration, mood tag).
- Choosing display fonts: one serif italic (Cormorant Garamond Italic candidate) and one sans label (Inter candidate). Self-hosted under `remotion/assets/fonts/`.
- Slo-mo audio handling on the first clip — mute and let music carry, or pitch-shift original audio. (Lean: mute.)
- Exact ChapterCard rhythm — every clip vs. every 3 clips. (Lean: every clip for ≤5 total clips; group otherwise.)
- Whether to commit a sample episode + thumbnail under `docs/` as a visual baseline.
