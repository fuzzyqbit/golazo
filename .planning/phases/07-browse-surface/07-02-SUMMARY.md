---
phase: 07-browse-surface
plan: "02"
subsystem: ui
tags: [channels-yaml, server-helper, accent-colors, typescript, tdd, workspace-import]

requires:
  - phase: 05-web-foundation
    provides: "@golazo/cli workspace dep in web/package.json enabling dist imports"
  - phase: 06-browse-data-layer
    provides: "web/src/theme/tokens.ts with COLORS.accentDefault fallback token"

provides:
  - "getChannelAccents() async server helper — loads channels.yaml, returns { [kidKey]: hexAccent }"
  - "accentFor(map, kidKey) lookup — guaranteed fallback to COLORS.accentDefault"
  - "resolveChannelsPath() — GOLAZO_CHANNELS_PATH env override + default"
  - "ChannelAccentMap type — Record<string, string>"

affects:
  - 07-browse-surface-plan-03  # page.tsx will call getChannelAccents() once per request
  - any-component-using-kid-accent-chips

tech-stack:
  added: []
  patterns:
    - "skipTokenCheck: true on loadChannelsFile for UI-only paths (no OAuth token needed)"
    - "existsSync pre-check before loadChannelsFile for graceful missing-file fallback"
    - "Catch ChannelsConfigError → log + return {} pattern (mirrors discoveryRuntime)"
    - "@golazo/cli/dist/config/channels.js cross-workspace dist import (same .js suffix as scanner.ts)"

key-files:
  created:
    - web/src/lib/ui/channelAccents.ts
    - web/src/lib/ui/channelAccents.test.ts

key-decisions:
  - "existsSync pre-check chosen over parsing ChannelsConfigError.reason — cleaner, deterministic missing-file path"
  - "async function signature on getChannelAccents even though loader is sync — allows future async I/O migration without API churn"
  - "Import ChannelsFile type from @golazo/cli/dist/config/types.js for proper dist-boundary typing"

patterns-established:
  - "Pattern: Server-side channels.yaml access goes through @golazo/cli/dist/config/channels.js with skipTokenCheck:true — never copy src/config/channels.ts"
  - "Pattern: GOLAZO_CHANNELS_PATH env override mirrors GOLAZO_ROOT pattern from Phase 6"

requirements-completed:
  - UI-02

duration: 5min
completed: 2026-06-01
---

# Phase 07 Plan 02: Channel Accent Loader Summary

**Server-side channels.yaml accent loader using @golazo/cli dist import with skipTokenCheck, graceful empty-map fallback on missing/malformed file, and accentFor() fallback to COLORS.accentDefault**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-01T21:06:00Z
- **Completed:** 2026-06-01T21:07:40Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- `getChannelAccents({ channelsPath })` loads channels.yaml via `@golazo/cli/dist/config/channels.js` with `skipTokenCheck: true` and returns `{ leo: '#ffce5a', mateo: '#5acfff' }` against the committed fixture
- Missing channels.yaml pre-checked with `existsSync` and returns `{}` gracefully — UI never 500s
- Malformed yaml caught as `ChannelsConfigError`, logged via `console.error`, returns `{}` (mirrors discoveryRuntime error pattern)
- `accentFor(map, kidKey)` uses `map[kidKey] ?? COLORS.accentDefault` — named token constant, no magic inline hex
- `resolveChannelsPath()` honors `GOLAZO_CHANNELS_PATH` env override, defaults to `path.resolve('./channels.yaml')`
- 11 tests pass (≥6 required); all verified with `cd web && npx vitest run src/lib/ui/channelAccents.test.ts`

## Fixture Values

`getChannelAccents({ channelsPath: 'web/tests/fixtures/golazo/channels.yaml' })` returns:
```json
{ "leo": "#ffce5a", "mateo": "#5acfff" }
```

## ChannelsConfigError Swallow

Yes — needed. The fixture's `oauth_token` paths (`~/.golazo/leo-token.json`, `~/.golazo/mateo-token.json`) do not exist in dev/CI environments. Without `skipTokenCheck: true`, `loadChannelsFile` would throw `ChannelsConfigError` on the token check. With `skipTokenCheck: true`, no swallow is needed for the happy path. The `ChannelsConfigError` catch block handles malformed yaml (which vitest exercises via a tmpdir fixture with invalid yaml content).

## resolveChannelsPath Default

`path.resolve('./channels.yaml')` — resolves against `process.cwd()`, which is the repo root when running `npm run web:dev` from the repo root (standard operator workflow).

## File-Disjoint Confirmation with Plan 01

Plan 01 modified: `web/src/lib/ui/listParams.ts`, `web/src/lib/ui/listOps.ts`
Plan 02 modified: `web/src/lib/ui/channelAccents.ts`, `web/src/lib/ui/channelAccents.test.ts`
Zero file overlap confirmed.

## Test Counts

`cd web && npx vitest run src/lib/ui/` — **56 tests pass (3 test files)**: listParams.test.ts (14), listOps.test.ts (31), channelAccents.test.ts (11).

## Task Commits

TDD RED + GREEN pattern:

1. **Test: channelAccents RED** - `c69fe72` (test — 11 failing tests)
2. **Impl: channelAccents GREEN** - `548a4a0` (feat — all 11 pass)

**Plan metadata:** (this commit)

## Files Created/Modified

- `web/src/lib/ui/channelAccents.ts` — exports `ChannelAccentMap`, `getChannelAccents()`, `accentFor()`, `resolveChannelsPath()`
- `web/src/lib/ui/channelAccents.test.ts` — 11 table-driven cases covering happy path, missing file, malformed yaml, multiple kids, skipTokenCheck, accentFor fallback, resolveChannelsPath env override

## Decisions Made

- `existsSync` pre-check over parsing `ChannelsConfigError.reason` — avoids brittle error-message string matching; deterministic
- `async` function signature on `getChannelAccents` even though loader is sync — allows future migration to async I/O without API churn at call sites
- `ChannelsFile` type imported from `@golazo/cli/dist/config/types.js` — maintains proper dist-boundary typing, no src/ traversal

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Pre-existing unrelated failure in `tests/host-binding.integration.test.ts > Scenario B` caused by another Next.js dev server running on port 4174 during test run (environment collision, not a code issue). Logged to deferred items — out of scope for this plan.

## Known Stubs

None — `getChannelAccents()` loads real data from `channels.yaml` and returns actual hex values.

## Threat Flags

None — this module is read-only filesystem access to `channels.yaml` (no network endpoints, no auth paths, no schema changes at trust boundaries).

## Next Phase Readiness

- `getChannelAccents()` is ready for Plan 03's `page.tsx` to call once per request and pass the map as a prop to `EpisodeRow` for kid-name chip rendering
- `accentFor(map, kidKey)` provides the per-row lookup with guaranteed fallback

## Self-Check

- `web/src/lib/ui/channelAccents.ts` — FOUND
- `web/src/lib/ui/channelAccents.test.ts` — FOUND
- Commit `c69fe72` (RED) — FOUND
- Commit `548a4a0` (GREEN) — FOUND
- `cd web && npx vitest run src/lib/ui/channelAccents.test.ts` — 11 passed

## Self-Check: PASSED

---
*Phase: 07-browse-surface*
*Completed: 2026-06-01*
