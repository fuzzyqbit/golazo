# Roadmap: golazo

## Overview

golazo is a local-Mac CLI that transforms folders of soccer highlight clips into branded, per-game YouTube episodes for two kids' channels. v2.0 adds a localhost web UI for browsing and playing rendered episodes — read-only surface over the v1.0 filesystem-authoritative storage.

## Shipped Milestones

- ✅ **v1.0 — MVP** (shipped 2026-05-19): 4 phases · 18 plans · 387 tests · 86.72% line coverage · 28/28 v1 requirements (1 override on PUB-05). See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) and [milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md).

## Active Milestone: v2.0 — Web UI

**Goal:** Operator browses and plays rendered episodes from a localhost Next.js app over the filesystem-authoritative `~/golazo/<kid>/<game>/.golazo/` storage. Read-only surface; CLI remains the action authority.

### Phases

- [ ] **Phase 5: Web Scaffold + Workspaces** — Next.js 16 + Turbopack setup under `web/`, npm workspace conversion (root + web share types), localhost-only bind hardening, self-hosted fonts, theme primitives
- [x] **Phase 6: Discovery + sqlite Cache + Watcher** — filesystem scanner over `~/golazo/`, per-game status derivation, sqlite invalidation by manifestHash + mtime, chokidar watcher (completed 2026-06-01)
- [ ] **Phase 7: Browse Surface** — list view at `/` (sort, per-kid filter, URL state, thumb posters), detail view at `/episodes/<manifestHash>` (manifest + template renders + publish.json status)
- [ ] **Phase 8: Player + Asset Serving + QA** — HTML5 video player, Next.js asset route handler with path-safety + HTTP Range support, vitest unit/integration, Playwright E2E, 80% coverage gate on `web/src/`

## Phase Details

### Phase 5: Web Scaffold + Workspaces
**Goal**: Operator can run `npm run web:dev` from repo root, get a Next.js 16 app served at `127.0.0.1:<port>` with the project's typographic theme; root + web share types via npm workspaces.
**Depends on**: v1.0 (Phases 1-4 shipped)
**Requirements**: WEB-01, WEB-02, WEB-03, UI-05
**Success Criteria** (what must be TRUE):
  1. `web/` subdir contains a Next.js 16 App Router project with its own `package.json`; root `package.json` declares `workspaces: ["web"]` (or `web` is otherwise reachable via path imports if workspaces are unworkable)
  2. `npm run web:dev` from repo root launches Turbopack-backed dev server bound exclusively to `127.0.0.1` on a fixed port (e.g. 4173); connecting via the LAN IP refuses with a clear console message
  3. Setting `HOST=0.0.0.0` rejects startup with a defense-in-depth error referencing `WEB-03`; setting `HOST=127.0.0.1` or unset proceeds normally
  4. Importing `manifestSchema` from `@golazo/cli` (or equivalent workspace name) inside `web/src/` typechecks against the live `src/prepare/manifest.ts` — no copying, no duplication
  5. Cormorant Garamond Italic + Inter are self-hosted under `web/public/fonts/` and applied to a placeholder home route; the page visibly uses the project's display + label fonts (same TTF files as `remotion/assets/fonts/`)
**Plans**:
- [x] 05-01-PLAN.md — npm workspace conversion at root (rename to @golazo/cli, declare workspaces:["web"], pin v1.0 contracts) [WEB-01]
- [x] 05-02-PLAN.md — Next.js 16 + Turbopack App Router scaffold under web/, root web:* scripts, cross-workspace type-import smoke [WEB-01]
- [x] 05-03-PLAN.md — Localhost-only enforcement: next dev -H 127.0.0.1 + instrumentation.ts HOST guard + integration test [WEB-02, WEB-03]
- [x] 05-04-PLAN.md — Self-hosted fonts via next/font/local + web theme tokens; visible Cormorant Garamond Italic + Inter on placeholder [UI-05]
**UI hint**: yes

### Phase 6: Discovery + sqlite Cache + Watcher
**Goal**: Operator's `~/golazo/` storage is indexed into a fast queryable sqlite cache, with chokidar-backed invalidation so UI rows reflect filesystem changes within 2 s without full rescan.
**Depends on**: Phase 5
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, DISC-05
**Success Criteria** (what must be TRUE):
  1. `scanGolazoRoot(~/golazo)` returns a typed array of `EpisodeIndex` rows for every game folder with a valid name + `.golazo/manifest.json`; folders that fail `parseGameFolderName` surface in a dev-mode banner field, not silent skips
  2. Per-game status is derived purely from filesystem presence: `prepared` (manifest only), `rendered` (+ episode.mp4 + thumb.png), `published` (+ publish.json with videoId). Recomputed each scan, never stored as truth
  3. sqlite at `web/data/index.db` (gitignored) is populated on first scan; subsequent reads serve list queries in < 50 ms for a 100-game fixture
  4. Invalidation: a row is invalidated when (a) the on-disk `manifestHash` differs from the cached row, or (b) any tracked file's mtime is newer than the cached scan time. Empty/missing sqlite rebuilds from scan on startup
  5. Adding a new game folder under `~/golazo/leo/` reflects in the running app's UI list within 2 s via the chokidar watcher; deleting one removes the row in the same window
**Plans**: 4 plans
- [x] 06-01-PLAN.md — Scanner: scanGolazoRoot + EpisodeIndex types + WarningBag + committed 3-game fixture (DISC-01, DISC-02, DISC-05)
- [x] 06-02-PLAN.md — sqlite cache: better-sqlite3 schema + CRUD + invalidation predicates + < 50ms bench (DISC-03)
- [x] 06-03-PLAN.md — chokidar watcher: 500ms per-folder debounce + cache mutation within 2s (DISC-04)
- [x] 06-04-PLAN.md — Startup wiring: discoveryRuntime singleton + instrumentation.ts hook + /api/debug/discovery + end-to-end integration smoke (all DISC-*)

### Phase 7: Browse Surface
**Goal**: Operator opens `/` and sees all indexed episodes with sort + per-kid filter + thumbnail posters; clicking any row deep-links to `/episodes/<manifestHash>` showing manifest details + rendered title/description templates + publish.json status.
**Depends on**: Phase 6
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-06, PLAY-01, PLAY-02
**Success Criteria** (what must be TRUE):
  1. `/` renders all indexed episodes; sort defaults to `date.desc`. Changing sort dropdown updates URL search param (`?sort=opponent.asc`); refresh preserves state
  2. Each list row displays: lazy-loaded thumb.png poster, kid name with accent-color chip from `channels.yaml`, opponent pretty-printed via `prettyOpponent` from Phase 2, date, score, status badge (`prepared` / `rendered` / `published`)
  3. Per-kid chip filter (`all` / `leo` / `mateo`) reduces the list; combined sort + filter state lives in URL search params for deep-linkability
  4. Empty state (no episodes found) renders a clear message with the scanned root path — not a blank screen
  5. `/episodes/<manifestHash>` shows: rendered title via `renderTitle` (Phase 3), rendered description via `renderDescription`, full manifest details (clip list with durations, music pick info, render block), and publish.json contents when present (videoId, watchUrl, uploadedAt) with link out to YouTube Studio. Unknown hash → 404
**Plans**: 4 plans
- [x] 07-01-PLAN.md — URL state + list operations: parseListParams/serializeListParams + sortEpisodes/filterByKid pure functions [UI-01, UI-03]
- [x] 07-02-PLAN.md — channelAccents server helper: load channels.yaml accents map via @golazo/cli loader with skipTokenCheck [UI-02]
- [x] 07-03-PLAN.md — List view: page.tsx Server Component + EpisodeList client component + EpisodeRow/EmptyState + path-safe thumb asset route stub [UI-01, UI-02, UI-03, UI-04, UI-06]
- [ ] 07-04-PLAN.md — Detail view: /episodes/[manifestHash] Server Component + EpisodeDetail + manifest/publish read helpers + notFound() [PLAY-01, PLAY-02]
**UI hint**: yes

### Phase 8: Player + Asset Serving + QA
**Goal**: Operator presses play on the detail view and the rendered `episode.mp4` streams inline via a path-safe asset route with seek support; vitest + Playwright cover the surface at ≥80% line coverage on `web/src/`.
**Depends on**: Phase 7
**Requirements**: PLAY-03, PLAY-04, PLAY-05, WEB-QA-01, WEB-QA-02, WEB-QA-03
**Success Criteria** (what must be TRUE):
  1. Detail view renders an HTML5 `<video controls poster="<thumb url>" src="<asset url>"/>` that streams `episode.mp4` via `/api/asset/<kid>/<game>/episode.mp4`; thumb.png is the poster
  2. Asset route handler resolves requested paths against `~/golazo/` and refuses any request that escapes via `..`, symlink, or absolute path with HTTP 403; integration test pins both the escape attempt and the normal-path success
  3. Asset route honors HTTP `Range` requests for `episode.mp4` — issuing a request with `Range: bytes=0-99` returns HTTP 206 with the first 100 bytes; verified by integration test
  4. Vitest unit tests cover scanner + sqlite cache + status derivation + path-safety helper (table-driven). Vitest integration tests verify list + detail routes against `web/tests/fixtures/golazo/` with ≥3 game folders spanning all three statuses
  5. `pnpm playwright test` (or `npm run web:e2e`) runs the golden-path E2E (open `/` → filter to `leo` → click first episode → video element fires `play`) and the path-traversal regression (`GET /api/asset/../../etc/passwd` → 403). Coverage on `web/src/` ≥ 80% lines
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 5. Web Scaffold + Workspaces | 2/4 | In Progress|  |
| 6. Discovery + sqlite Cache + Watcher | 4/4 | Complete   | 2026-06-01 |
| 7. Browse Surface | 3/4 | In Progress|  |
| 8. Player + Asset Serving + QA | 0/TBD | Not started | — |

## v2.1+ Backlog (carry-forwards + future)

- **PUB-05-resumable** — Replace googleapis SDK upload with raw HTTP resumable upload session protocol. Source: Phase 3 verification override.
- **OAuth-DI** — Replace `GOLAZO_OAUTH_MOCK=1` env-var branch in `exchangeCode` with injectable factory pattern. Source: Plan 03-01 carry-forward.
- **QA-03-extended** — Commit 6+-clip fixture + integration render to close visual chapter-rhythm regression coverage. Source: Phase 2 → Phase 4 carry-forward.
- **WEB-TRIGGER** — Trigger render/publish from browser with real-time progress. Source: v2.0 explicit out-of-scope.
- **WEB-EDIT** — Override title/description/score before publish. Source: v2.0 explicit out-of-scope.
- **WEB-LAN** — LAN-accessible mode with shared-token auth for phone/iPad use. Source: v2.0 explicit out-of-scope.

---
*Roadmap created: 2026-05-13 by gsd-roadmapper*
*v1.0 shipped: 2026-05-19 — see milestones/v1.0-ROADMAP.md for full phase + plan history*
*v2.0 planned: 2026-05-31 — 4 phases (5-8), 22 requirements, coarse granularity, npm workspaces decision deferred to Phase 5 planning*
*Phase 7 planned: 2026-06-01 — 4 plans (07-01..07-04), 3-wave dependency structure (1: A+B pure logic + accents helper, 2: list view + thumb route stub, 3: detail view)*
