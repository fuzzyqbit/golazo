---
phase: 05-web-scaffold-workspaces
plan: "01"
subsystem: infra
tags: [npm-workspaces, package-json, monorepo, vitest, typescript]

requires:
  - phase: 04-convenience-qa-polish
    provides: "387 passing v1.0 tests; v1.0 CLI milestone verified"

provides:
  - "Root package renamed to @golazo/cli (scoped workspace name)"
  - "workspaces: [\"web\"] declared in root package.json"
  - "package-lock.json workspace-aware schema"
  - "tests/workspace.test.ts — 16-test suite pinning v1.0 CLI invariants"
  - "Total test count: 403 (387 prior + 16 new)"

affects:
  - 05-02-web-package-scaffold
  - any plan importing from @golazo/cli

tech-stack:
  added: []
  patterns:
    - "npm workspaces in-place layout: root stays CLI, web/ is sibling (D-02)"
    - "Contract-pin test pattern: workspace.test.ts locks package.json shape for future regressions"

key-files:
  created:
    - tests/workspace.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "D-01 LOCKED: scoped name = @golazo/cli (cli is the precise role; @golazo/core rejected — core implies shared headless libs)"
  - "D-02 LOCKED: workspace layout = in-place (root stays CLI, web/ is sibling) — NO restructure into packages/; zero v1.0 file moves; all 387 test fixture paths preserved"
  - "D-03 LOCKED: NO exports map on root package.json yet — Plan 02 imports via dist/... paths; deferred to v2.1 if multi-import convenience justifies it"
  - "npm 10.9.x tolerates workspaces: [\"web\"] with no web/ directory on disk — npm install exits 0; no stub web/package.json needed"

patterns-established:
  - "Workspace contract pin: tests/workspace.test.ts reads package.json at test-module-load time and asserts shape; future plans cannot silently break CLI bin or scripts"

requirements-completed:
  - WEB-01

duration: 9min
completed: "2026-06-01"
---

# Phase 05 Plan 01: Workspace Host Conversion Summary

**Root package renamed from `golazo` to `@golazo/cli` with `workspaces: ["web"]` declared; 16-test vitest suite pins v1.0 CLI invariants (bin path, scripts, packageManager, engines) for all future plans**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-01T03:49:29Z
- **Completed:** 2026-06-01T03:58:26Z
- **Tasks:** 1
- **Files modified:** 3 (package.json, package-lock.json, tests/workspace.test.ts)

## Accomplishments

- Renamed `package.json#name` from `golazo` to `@golazo/cli` — the scoped workspace name Plan 02 will import from
- Added `"workspaces": ["web"]` as sibling of `"private": true` — exactly two-line diff; no other fields touched
- Refreshed `package-lock.json` with workspace-aware schema (name field + workspaces slot in `packages[""]`)
- Created `tests/workspace.test.ts` with 16 assertions across 9 logical groups pinning all v1.0 contracts
- All 403 tests pass (387 prior + 16 new); `bin.golazo` = `./dist/cli/index.js` unchanged; tsconfig files byte-identical

## Task Commits

Each task was committed atomically:

1. **Task 1: Workspace host conversion + workspace.test.ts** — `d62f916` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `package.json` — `name` renamed to `@golazo/cli`; `workspaces: ["web"]` added; all other fields byte-identical
- `package-lock.json` — regenerated with workspace-aware schema; name + workspaces slot updated
- `tests/workspace.test.ts` — 16-test vitest suite (9 logical assertion groups) pinning v1.0 CLI invariants

## Decisions Made

**D-01 LOCKED: Scoped name = `@golazo/cli`**
- `cli` is the precise role for this package (it IS a CLI)
- `@golazo/core` rejected — `core` implies shared headless libs without opinionated entry points
- Plan 02 will import shared types via `@golazo/cli/dist/prepare/manifest.js` paths

**D-02 LOCKED: In-place workspace layout (root = CLI, `web/` = sibling)**
- No restructure into `packages/cli/` + `packages/web/`
- Rationale: zero v1.0 file moves; all 387 test fixture paths preserved; `dist/cli/index.js` bin path unchanged; minimal blast radius for Plan 01
- Trade-off acknowledged: root `package.json` mixes CLI scripts and workspace orchestration (Plan 02 adds `web:dev`, `web:build`, `web:start`). Acceptable for a two-package monorepo.

**D-03 LOCKED: No `exports` map on root `package.json` this plan**
- Plan 02 imports via existing `dist/...` paths produced by `npm run build`
- Adding an exports map would force Plan 02 to negotiate which subpaths are public — scope expansion
- Deferred to Phase 6/7 or v2.1 if multi-import convenience becomes painful

**npm 10.9.x workspace-missing-member behavior confirmed:**
- `npm install` with `workspaces: ["web"]` and no `web/` directory on disk exits 0 with no warnings
- No stub `web/package.json` needed in this plan — Plan 02 creates `web/package.json` directly
- This was the Context7-anticipated behavior; the fallback path (commit stub) was not triggered

## Deviations from Plan

**Test count note:** The plan specified "9 cases" (9 assertion groups). The actual test count in `tests/workspace.test.ts` is 16 because assertion group 8 (v1.0 scripts) is table-driven — each of the 8 script entries generates one `it()` block. Total: 8 script tests + 7 other group tests + 1 allowed-keys test = 16. This is correct and intentional; the plan's "9 cases" referred to 9 logical groups. Final suite: 403 tests (not 396 as projected), because 387+16=403.

None — plan executed exactly as specified. The two `package.json` field changes are the entire implementation.

## Issues Encountered

- Transient vitest webpack cache contention on first full-suite run (ENOENT rename 3.pack_ -> 3.pack): ran again and 403/403 passed. No action taken — this is a known webpack cache race on macOS, pre-existing before this plan.

## tsconfig Invariant Confirmation

`git diff tsconfig.json tsconfig.check.json` shows **zero changes** — both files are byte-identical to pre-plan state. This plan does NOT touch any tsconfig, as specified.

## bin Invariant Confirmation

`package.json#bin.golazo` is still `"./dist/cli/index.js"`. The executable name `golazo` is independent of the package name `@golazo/cli`. npm publishes the bin under the KEY of the `bin` field, not the package name. `npm run build` produces `dist/cli/index.js`; node-eval bin-existence check exits 0.

## Known Stubs

None — this plan adds no UI rendering, no data binding, no placeholder text. `tests/workspace.test.ts` asserts live `package.json` data.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 02 (web package scaffold) can now `npm install` into the workspace and drop `web/package.json` — npm will wire `node_modules/@golazo/cli` → repo root automatically
- `@golazo/cli` scoped name is available for `import { ... } from '@golazo/cli/dist/...'` in web/src/
- All v1.0 CLI contracts locked by `tests/workspace.test.ts` — any future regression surfaces immediately

---
*Phase: 05-web-scaffold-workspaces*
*Completed: 2026-06-01*
