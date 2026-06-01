---
phase: 07-browse-surface
plan: "04"
subsystem: web-ui
tags:
  - phase-07
  - browse-surface
  - detail-view
  - server-component
  - templates-reuse
  - dynamic-routes
  - 404
  - tdd

dependency_graph:
  requires:
    - 07-01  # listParams helper
    - 07-02  # channelAccents + resolveChannelsPath
    - 07-03  # list view pattern reference
    - 06-04  # discoveryRuntime + queryEpisodeByHash
  provides:
    - /episodes/[manifestHash] detail route
    - EpisodeDetail server component
    - manifestRead + publishRead helpers
  affects:
    - web/src/app/episodes/  # new route segment
    - web/src/components/EpisodeDetail.tsx
    - web/src/lib/ui/manifestRead.ts
    - web/src/lib/ui/publishRead.ts

tech_stack:
  added:
    - EpisodeDetail.tsx (server component, no use client)
    - manifestRead.ts (readManifestFromRow helper — ManifestReadError class)
    - publishRead.ts (readPublishFromRow helper — null on all failures)
    - not-found.tsx (typographic 404 for unknown manifestHash)
  patterns:
    - Next.js App Router dynamic route ([manifestHash]) with await params
    - decodeURIComponent for sha256: colon handling
    - notFound() from next/navigation for 404 path
    - resolveChannelsPath() from channelAccents.ts for GOLAZO_CHANNELS_PATH env awareness
    - TDD RED → GREEN per helper module

key_files:
  created:
    - web/src/app/episodes/[manifestHash]/page.tsx
    - web/src/app/episodes/[manifestHash]/page.module.css
    - web/src/app/episodes/[manifestHash]/not-found.tsx
    - web/src/app/episodes/[manifestHash]/not-found.module.css
    - web/src/components/EpisodeDetail.tsx
    - web/src/components/EpisodeDetail.module.css
    - web/src/lib/ui/manifestRead.ts
    - web/src/lib/ui/manifestRead.test.ts
    - web/src/lib/ui/publishRead.ts
    - web/src/lib/ui/publishRead.test.ts
    - web/tests/detail-view.integration.test.ts
  modified:
    - web/src/app/episodes/[manifestHash]/page.tsx  # added resolveChannelsPath fix

decisions:
  - "Used resolveChannelsPath() from channelAccents.ts in page.tsx to respect GOLAZO_CHANNELS_PATH env var — same pattern as Plan 02 rather than hardcoding the path"
  - "URL encoding: sha256: prefix may be percent-encoded as sha256%3A in browser URLs. page.tsx calls decodeURIComponent(rawManifestHash) before the cache lookup. Integration test Case 5 pins that both encoded and unencoded forms work."
  - "Port 4177 chosen for detail-view integration test (4176 was already taken by list-view empty-root Suite B)"
  - "not-found.tsx gets its own not-found.module.css (plan said page.module.css but the 404 needs distinct typography without the detail page's main padding)"
  - "playerMount section left as empty <section> seam in EpisodeDetail.tsx for Phase 8 PLAY-03/04/05 video player"

metrics:
  duration: ~15 minutes
  completed: 2026-06-01
  tasks_completed: 3
  files_created: 11
  tests_added: 14  # 8 unit + 6 integration
---

# Phase 7 Plan 04: Detail View Summary

**One-liner:** Episode detail view at `/episodes/<manifestHash>` with title via `renderTitle`, description via `renderDescription`, manifest clip list + music + render block, and publish.json contents with YouTube Studio link — all server-rendered, zero schema duplication.

## What Was Built

### Task 1: manifestRead + publishRead helpers (TDD)

**manifestRead.ts** — `readManifestFromRow(row: EpisodeIndex): Manifest`

- Reads `<row.absFolderPath>/.golazo/manifest.json`
- Validates via `manifestSchema` from `@golazo/cli/dist/prepare/manifest.js` (imported, not redeclared)
- Throws `ManifestReadError` on: missing file, read failure, JSON parse error, schema error
- `ManifestReadError` caught by page.tsx → mapped to `notFound()`

**publishRead.ts** — `readPublishFromRow(row: EpisodeIndex): PublishRecordDoc | null`

- Reads `<row.absFolderPath>/.golazo/publish.json`
- Validates via `publishRecordSchema` from `@golazo/cli/dist/publish/publishRecord.js` (imported, not redeclared)
- Returns `null` on ALL failure modes (missing, parse error, schema error)
- Logs to `console.error` for observability before returning null — never throws

TDD commits: RED (0844f77) → GREEN (3418b6a)

### Task 2: Detail route + EpisodeDetail component + not-found page

**page.tsx TemplateInput construction** (key excerpt):

```typescript
const channelsPath = resolveChannelsPath();
const channel = loadChannel(row.kid, { path: channelsPath, skipTokenCheck: true });

const templateInput: TemplateInput = {
  kid: {
    name: channel.name,
    club: channel.club,
    jersey: channel.jersey,
    source: channel.source,
  },
  game: {
    date: row.date,
    opponent: row.opponent,
    scoreFor: row.scoreFor,
    scoreAgainst: row.scoreAgainst,
    result: row.result,
  },
};

const title = renderTitle(templateInput);
const description = renderDescription(templateInput);
```

**EpisodeDetail.tsx** — server-rendered (confirmed: no `'use client'`):
- Section 1: back link (← all episodes)
- Section 2: `<h1>` title in `var(--font-display)` Cormorant Garamond Italic
- Section 3: `<pre>` description with `white-space: pre-line` (preserves `\n` from `renderDescription`)
- Section 4: manifest section — hash (monospace), clip `<ol>` (filename + durationSec), music pick (or `(not set)`), render block (or `(not yet rendered)`)
- Section 5: publish section — videoId, watchUrl link, uploadedAt, channelId, privacyStatus, YouTube Studio link (`https://studio.youtube.com/video/<videoId>/edit`) OR "Not published yet" message
- Phase 8 seam: empty `<section className="playerMount">` for PLAY-03/04/05 video player

**not-found.tsx** — typographic 404 page:
- Renders when `notFound()` fires inside `/episodes/[manifestHash]` segment
- `<h1>` "Episode not found" in Cormorant Garamond Italic
- Link back to `/`

**URL encoding decision:** `sha256:<64hex>` contains `:` which browsers may encode as `%3A`. page.tsx calls `decodeURIComponent(rawManifestHash)` before the cache lookup. Next.js dynamic segments capture the raw URL string; the decode normalizes both forms to the canonical `sha256:...` format.

Commit: 72b53af + 2086c15 (channels path fix)

### Task 3: Integration tests (6 cases, port 4177)

All 6 cases green:

1. **Published** (`mateo/dragons`): 200, HTML contains 'Dragons', 'dQw4w9WgXcQ' (videoId), 'youtu.be', 'YouTube Studio'
2. **Rendered** (`leo/rivers`): 200, HTML contains 'Rivers', 'Not published yet'
3. **Prepared** (`leo/united`): 200, HTML contains 'United', '(not yet rendered)'
4. **Unknown hash**: 404, HTML contains 'Episode not found'
5. **URL encoding**: `sha256%3A<hex>` resolves same episode as unencoded (pins browser URL behavior)
6. **Template equivalence**: title in HTML matches `renderTitle(...)` computed in-test — confirms zero template duplication

Commit: 7994884

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing GOLAZO_CHANNELS_PATH env awareness in loadChannel call**
- **Found during:** Task 3 (integration test run — all 500 errors except 404)
- **Issue:** `loadChannel(row.kid, { skipTokenCheck: true })` used its built-in default path (`./channels.yaml` relative to `process.cwd()`), ignoring the `GOLAZO_CHANNELS_PATH` env var set by the test spawner
- **Fix:** Added `resolveChannelsPath()` call from `channelAccents.ts` (Plan 02's helper) to get the env-aware path; passes it as `opts.path` to `loadChannel`
- **Files modified:** `web/src/app/episodes/[manifestHash]/page.tsx`
- **Commit:** 2086c15

**2. [Rule 2 - Missing functionality] Added not-found.module.css**
- **Found during:** Task 2 creation
- **Issue:** Plan referenced `page.module.css` for not-found styling but the 404 page has distinct layout needs (no detail-page sections)
- **Fix:** Created `not-found.module.css` as a sibling CSS Module for the 404 page
- **Files modified:** `web/src/app/episodes/[manifestHash]/not-found.module.css` (new)
- **Commit:** 72b53af

## TDD Gate Compliance

- RED commit: `test(07-04): add failing tests for manifestRead + publishRead helpers` (0844f77)
- GREEN commit: `feat(07-04): implement manifestRead + publishRead helpers` (3418b6a)

Both gates present in git log.

## Known Stubs

None — the detail view renders live data from committed fixtures. No hardcoded empty values or placeholder text in the component output paths.

The `playerMount` section in `EpisodeDetail.tsx` is an intentional placeholder (empty `<section>`) for Phase 8 PLAY-03/04/05. It does not affect the plan's stated goals (PLAY-01 + PLAY-02 only).

## v2.1+ Backlog

- **Phase 8 PLAY-03**: HTML5 `<video>` player — slots into the `playerMount` section in `EpisodeDetail.tsx`. May require a small `'use client'` island for player controls.
- **Phase 8 PLAY-04/05**: Asset range serving for episode.mp4 — the detail route already has `row.episodeAbsPath` available; Phase 8 adds the streaming route + wires the `src` prop.

## Self-Check

Verifying claims...

- All 11 created files: FOUND
- All 5 task commits: FOUND (0844f77, 3418b6a, 72b53af, 7994884, 2086c15)
- No 'use client' in page.tsx or EpisodeDetail.tsx: PASSED
- renderTitle + renderDescription imported from @golazo/cli/dist/publish/templates.js: PASSED
- loadChannel imported from @golazo/cli/dist/config/channels.js: PASSED
- manifestSchema imported (not redeclared) in manifestRead.ts: PASSED
- publishRecordSchema imported (not redeclared) in publishRead.ts: PASSED
- Unknown hash returns 404 via notFound() + not-found.tsx: PASSED (integration Case 4)

## Self-Check: PASSED
