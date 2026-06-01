# Requirements: golazo v2.0 — Web UI

**Defined:** 2026-05-31 (v2.0 milestone start)
**Milestone Goal:** Local web UI for browsing and playing rendered episodes; read-only surface over the v1.0 CLI's filesystem outputs.

## v2.0 Requirements

### Web Foundation

- [x] **WEB-01**: A Next.js 16 web app lives under `web/` subdir with its own `package.json`; root + web share types via npm workspaces (or path imports if workspaces are out). Type changes to `src/prepare/manifest.ts` or `src/config/channels.ts` are picked up by web without copying source
- [x] **WEB-02**: `npm run web:dev` from repo root starts the web app on `127.0.0.1:<port>` via Turbopack; `npm run web:start` runs the production build. Both bind exclusively to localhost — connection to `0.0.0.0:<port>` is refused and logged
- [x] **WEB-03**: Web app refuses to start when `process.env.HOST` is set to anything other than `127.0.0.1` or `localhost` (defense-in-depth)

### Discovery + Indexing

- [x] **DISC-01**: A filesystem scanner walks `~/golazo/<kid>/*/` for game folders that have a `.golazo/manifest.json` and (optionally) `.golazo/publish.json` + `.golazo/episode.mp4` + `.golazo/thumb.png`; returns a typed `EpisodeIndex` row per game
- [x] **DISC-02**: Per-game status is derived from disk: `prepared` (manifest only), `rendered` (episode.mp4 + thumb.png present), `published` (publish.json with videoId). Status is recomputed on each scan, never stored as truth
- [ ] **DISC-03**: An sqlite database at `web/data/index.db` (gitignored) caches the scan results for fast UI queries. Filesystem is authoritative — sqlite is invalidated by mtime drift or `manifestHash` change. Empty/missing sqlite rebuilds from scan
- [ ] **DISC-04**: A filesystem watcher (chokidar or node:fs/watch) invalidates sqlite rows when files under `~/golazo/<kid>/*/.golazo/` change; reflects updates in the UI within 2 s without full rescan
- [x] **DISC-05**: Scanner ignores game folders whose folder name does not parse via `parseGameFolderName` from v1.0 (reuses `src/prepare/filename.ts`); broken folders surface as a single dev-mode banner, not silent skips

### Browse Surface

- [ ] **UI-01**: The root route `/` lists all indexed episodes, sortable by date (default desc), opponent, result (W/L/D), and kid; sort persists in URL search params (`?sort=date.desc&kid=leo`)
- [ ] **UI-02**: Each row in the list view shows: thumbnail (thumb.png poster, lazy-loaded), kid name + accent color chip from `channels.yaml`, opponent (pretty-printed via Phase 2 `prettyOpponent`), date, score, status badge (prepared / rendered / published)
- [ ] **UI-03**: A per-kid filter (chips: `all` / `leo` / `mateo`) reduces the list; combined with sort, all state lives in URL search params (deep-linkable, refresh-safe)
- [ ] **UI-04**: Empty state renders a clear message + the path the scanner walked when no episodes are found; not a blank screen
- [x] **UI-05**: Typography matches Remotion compositions — display uses Cormorant Garamond Italic (self-hosted under `web/public/fonts/`), labels use Inter; visual rhythm echoes the cinematic episode style
- [ ] **UI-06**: Layout is responsive but optimized for desktop (operator's MacBook). Touch targets and mobile breakpoints not in scope for v2.0

### Episode Detail + Playback

- [ ] **PLAY-01**: Route `/episodes/<manifestHash>` is the canonical permalink for a game — works whether episode is prepared, rendered, or published. Unknown hash → 404
- [ ] **PLAY-02**: Detail view shows: title rendered via Phase 3 `renderTitle` template, description rendered via `renderDescription`, full manifest contents (clip list with durations, music pick, render block), publish.json contents if present (videoId, watchUrl, uploadedAt) with link out to YouTube Studio
- [ ] **PLAY-03**: When `episode.mp4` exists on disk, an HTML5 `<video>` element streams it via a Next.js route handler at `/api/asset/<kid>/<game>/episode.mp4`; thumb.png is the poster
- [ ] **PLAY-04**: Asset route handler enforces path safety — request paths are resolved against `~/golazo/`; any path that escapes (via `..`, symlinks, or absolute paths) returns 403. No filesystem access outside the scanner root
- [ ] **PLAY-05**: Asset route supports HTTP Range requests so the video player can seek without loading the whole file; verified by integration test (Range header → 206 Partial Content)

### Quality + Testing

- [ ] **WEB-QA-01**: Vitest unit tests cover the scanner, sqlite cache, and per-game status derivation (prepared / rendered / published) — table-driven, following Phase 1+2 patterns
- [ ] **WEB-QA-02**: Vitest integration tests verify list and detail routes against a fixtures dir under `web/tests/fixtures/golazo/` with at least 3 game folders spanning all three statuses
- [ ] **WEB-QA-03**: Playwright E2E suite covers the golden path (open `/` → filter to leo → click first episode → video plays) and a path-traversal attempt (request `/api/asset/../../etc/passwd` returns 403). Runs in CI, ≥ 80% line coverage on `web/src/`

## v2.1+ Backlog (carry-forwards + future)

| ID | Description | Source |
|----|-------------|--------|
| PUB-05-resumable | Replace googleapis SDK with raw HTTP resumable upload session protocol | v1.0 override |
| OAuth-DI | Replace `GOLAZO_OAUTH_MOCK=1` env-var branch with injectable factory pattern | v1.0 carry-forward |
| QA-03-extended | Commit 6+-clip fixture for visual chapter-rhythm regression coverage | v1.0 carry-forward |
| WEB-TRIGGER | Trigger render/publish from browser with real-time progress | v2.0 explicit out-of-scope |
| WEB-EDIT | Override title/description/score before publish | v2.0 explicit out-of-scope |
| WEB-LAN | LAN-accessible mode with shared-token auth for phone/iPad use | v2.0 explicit out-of-scope |

## Out of Scope (v2.0)

| Feature | Reason |
|---------|--------|
| Render/publish from browser | Read-only surface in v2.0 — CLI keeps action authority |
| Multi-user auth or sessions | Single operator on one Mac; localhost bind is access control |
| LAN-accessible mode | Carry-forward for v2.1+ if phone access becomes a real need |
| Cross-OS deployment | Operator's Mac is the only target; web UI shares the macOS-only constraint |
| Editing manifest / channels via UI | Filesystem + yaml + CLI remain the source of truth |
| Public YouTube discovery / playlist syncing | Out of scope (v1 unlisted-only constraint extends to v2 browse) |
| Mobile-first responsive layouts | Desktop-first; mobile is best-effort, not pinned by tests |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WEB-01 | TBD | Complete |
| WEB-02 | TBD | Complete |
| WEB-03 | TBD | Complete |
| DISC-01 | TBD | Complete |
| DISC-02 | TBD | Complete |
| DISC-03 | TBD | Pending |
| DISC-04 | TBD | Pending |
| DISC-05 | TBD | Complete |
| UI-01 | TBD | Pending |
| UI-02 | TBD | Pending |
| UI-03 | TBD | Pending |
| UI-04 | TBD | Pending |
| UI-05 | TBD | Complete |
| UI-06 | TBD | Pending |
| PLAY-01 | TBD | Pending |
| PLAY-02 | TBD | Pending |
| PLAY-03 | TBD | Pending |
| PLAY-04 | TBD | Pending |
| PLAY-05 | TBD | Pending |
| WEB-QA-01 | TBD | Pending |
| WEB-QA-02 | TBD | Pending |
| WEB-QA-03 | TBD | Pending |

**Coverage:**
- v2.0 requirements: 22 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 22

---
*Requirements defined: 2026-05-31 for milestone v2.0 Web UI*
