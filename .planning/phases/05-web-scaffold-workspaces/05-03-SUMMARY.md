---
phase: 05-web-scaffold-workspaces
plan: "03"
subsystem: web
tags: [security, localhost, defense-in-depth, next.js, instrumentation, vitest, tdd]

requires:
  - phase: 05-web-scaffold-workspaces
    plan: "02"
    provides: "web/ Next.js 16 scaffold; dev/start scripts; web/tsconfig.json; web/tests/"

provides:
  - "web/src/lib/hostGuard.ts — pure validateHostBinding validator; WEB-03 error token"
  - "web/src/lib/hostGuard.test.ts — 14 table-driven vitest cases (allow + deny)"
  - "web/instrumentation.ts — Next.js register() startup hook; Node.js-only HOST guard"
  - "web/tests/host-binding.integration.test.ts — 3-scenario spawn test (A default, B guard abort, C composed CLI-flag-wins)"
  - "web/package.json: dev/start scripts updated to HOST=127.0.0.1 next dev|start -p 4173 -H 127.0.0.1"

affects:
  - 05-04-fonts-theme
  - phase-06-web-routes

tech-stack:
  added: []
  patterns:
    - "Next.js instrumentation.ts register() hook for server-startup validation"
    - "Two-layer localhost defense: CLI -H flag (script-level) + env HOST guard (instrumentation-level)"
    - "Table-driven Vitest unit tests via describe.each for pure validator"
    - "Integration spawn tests: child_process.spawn with env override + lsof bind-address assertion"
    - "HOST=<val> inline env prefix in npm scripts overrides inherited environment"

key-files:
  created:
    - web/src/lib/hostGuard.ts
    - web/src/lib/hostGuard.test.ts
    - web/instrumentation.ts
    - web/tests/host-binding.integration.test.ts
  modified:
    - web/package.json (dev + start scripts: +HOST=127.0.0.1 prefix, +-H 127.0.0.1 flag)
    - web/tsconfig.json (include: +instrumentation.ts)

key-decisions:
  - "D-08 LOCKED: Two-layer enforcement (CLI -H flag + instrumentation register guard)"
  - "D-09 LOCKED: register() guards Node.js runtime only (NEXT_RUNTIME === nodejs)"
  - "D-10 LOCKED: error message contractually pins the WEB-03 token"
  - "D-11 LOCKED: unit + integration test split — pure-function vs spawn-coverage"
  - "D-11b LOCKED: integration test includes Scenario C (composed HOST=0.0.0.0 npm run dev with script-level HOST=127.0.0.1 override)"

decisions:
  - "D-08: Two-layer localhost enforcement — CLI -H 127.0.0.1 flag in package.json scripts (layer 1) + runtime hostGuard via instrumentation.ts register() (layer 2). Either layer's removal caught by integration test."
  - "D-09: register() guards Node.js runtime only — NEXT_RUNTIME check early-returns on edge runtime to avoid confusing edge bootstrap errors. v2.0 has no edge deployment path."
  - "D-10: WEB-03 token in error message — contractually pinned; Scenario B integration test and hostGuard unit test both assert it. Future refactors must preserve."
  - "D-11: Co-located unit (web/src/lib/hostGuard.test.ts) + separate integration (web/tests/host-binding.integration.test.ts) — unit pins pure-function correctness; integration pins end-to-end spawn behaviour. Either alone is insufficient."
  - "D-11b: Scenario C in integration test — pins CLI-flag-wins composition. A + B test isolated layers; C tests the actual operator path. Uses lsof + curl to prove 127.0.0.1 bind even when HOST=0.0.0.0 inherited."

metrics:
  duration: "8min 46s"
  completed: "2026-06-01"
  tasks: 3
  files: 6
---

# Phase 05 Plan 03: Localhost Defense — Two-Layer HOST Guard Summary

**Two-layer localhost enforcement shipped: CLI `-H 127.0.0.1` flag in dev/start scripts + runtime `validateHostBinding` guard in `instrumentation.ts`. 14-case unit suite covers the pure validator; 3-scenario integration suite spawns real next dev processes to pin isolated-layer AND composed-operator-path behaviour. WEB-02 + WEB-03 fully covered.**

## Performance

- **Duration:** 8 min 46 s
- **Started:** 2026-06-01T04:19:00Z
- **Completed:** 2026-06-01T04:28:46Z
- **Tasks:** 3 (Task 1: validator + unit tests TDD; Task 2: instrumentation + script -H flag; Task 3: 3-scenario integration test)
- **Files created/modified:** 6

## Accomplishments

- Created `web/src/lib/hostGuard.ts` with pure `validateHostBinding(host)` and `LOOPBACK_HOSTS` constant; error message pins `WEB-03` token
- Created `web/src/lib/hostGuard.test.ts` with 14 table-driven cases (8 allow + 5 deny + 1 LOOPBACK_HOSTS export check) — all 14 pass
- Created `web/instrumentation.ts` with `register()` async, NEXT_RUNTIME guard, and dynamic import of hostGuard
- Updated `web/package.json` dev/start scripts to `HOST=127.0.0.1 next dev -p 4173 -H 127.0.0.1` and `HOST=127.0.0.1 next start -p 4173 -H 127.0.0.1`
- Created `web/tests/host-binding.integration.test.ts` with Scenarios A (happy path default env), B (HOST=0.0.0.0 bare guard abort), C (HOST=0.0.0.0 npm run dev composed CLI-flag-wins)
- All 20 web tests + 403 root vitest tests pass; both typecheck contexts exit 0
- `GOLAZO_SKIP_HOST_INTEGRATION=1` skips the integration describe block cleanly (verified)
- lsof used successfully for bind-address assertions (fallback path not needed on this Mac)

## Task Commits

Each task committed atomically:

1. **Task 1 RED+GREEN: pure validator + unit tests** — `a8281e9` (test)
2. **Task 2: instrumentation.ts + script -H flag** — `32a66dc` (feat)
3. **Task 3: 3-scenario integration test + script inline HOST prefix** — `5b4d42f` (feat)

## Files Created/Modified

| File | Action | Notes |
|------|--------|-------|
| `web/src/lib/hostGuard.ts` | Created | Pure validator; LOOPBACK_HOSTS const; WEB-03 token in error |
| `web/src/lib/hostGuard.test.ts` | Created | 14 table-driven vitest cases |
| `web/instrumentation.ts` | Created | Next.js startup hook; Node.js-only; dynamic import (no .js ext) |
| `web/tests/host-binding.integration.test.ts` | Created | 3-scenario spawn tests; lsof bind assert; GOLAZO_SKIP_HOST_INTEGRATION |
| `web/package.json` | Modified | dev: HOST=127.0.0.1 next dev -p 4173 -H 127.0.0.1; start: same pattern |
| `web/tsconfig.json` | Modified | include: +instrumentation.ts |

## Decisions Made

**D-08 LOCKED: Two-layer enforcement — CLI -H flag + instrumentation register guard**
- Layer 1 (CLI -H flag): `next dev -H 127.0.0.1` in package.json scripts — operator's normal path always binds loopback
- Layer 2 (instrumentation guard): `validateHostBinding(process.env.HOST)` in register() — catches any direct `npx next dev` invocation that bypasses the script
- WEB-03 explicitly mandates defense in depth; Scenario B integration test proves layer 2 fires in isolation (no -H flag)

**D-09 LOCKED: register() guards Node.js runtime only**
- `if (process.env.NEXT_RUNTIME !== 'nodejs') return;` early-exits on Edge runtime
- Edge runtime has different HOST semantics; aborting in Edge bootstrap produces confusing dev errors
- v2.0 ships only dev server + `next start` (both Node.js); no Edge deployment path exists yet

**D-10 LOCKED: WEB-03 token in error message is contractually pinned**
- `WEB-03: refusing to bind to non-loopback HOST '${host}'.` — both unit test and Scenario B grep for this token
- Future refactors must preserve `WEB-03` literal; integration test enforces the contract

**D-11 LOCKED: unit + integration test split**
- Unit test (`hostGuard.test.ts`) pins pure-function correctness; can run without Next.js or spawn
- Integration test (`host-binding.integration.test.ts`) pins end-to-end spawn behaviour; unit alone could pass while instrumentation wiring is silently broken

**D-11b LOCKED: Scenario C pins composed operator path**
- `HOST=0.0.0.0 npm run dev` — without Scenario C, composed behaviour was only manual smoke
- Script's inline `HOST=127.0.0.1` prefix overrides inherited env; lsof confirms 127.0.0.1 bind; curl confirms 200
- Automates the precedence proof: script env wins over caller-set HOST when using npm run dev

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dynamic import `.js` extension rejected by Next.js/Turbopack bundler**
- **Found during:** Task 2, smoke test (Step 4)
- **Issue:** `await import('./src/lib/hostGuard.js')` caused `MODULE_NOT_FOUND` — Next.js Turbopack bundler resolves TypeScript sources directly and does not accept `.js` on `.ts` source files
- **Fix:** Changed to `await import('./src/lib/hostGuard')` (no extension). Plan anticipated this: "if Next.js / Turbopack rejects this, try `./src/lib/hostGuard` (no extension) per Next's documented file-convention import patterns"
- **Files modified:** `web/instrumentation.ts`
- **Commit:** `32a66dc`

**2. [Rule 3 - Blocking] Scenario C failed: `HOST=0.0.0.0 npm run dev` caused guard to fire**
- **Found during:** Task 3 (first integration test run)
- **Issue:** Next.js's `-H` CLI flag controls the bind address but does NOT override `process.env.HOST`. The instrumentation guard reads `process.env.HOST` directly, so even with `-H 127.0.0.1` in the script, the inherited `HOST=0.0.0.0` caused the guard to fire and abort startup
- **Root cause:** Plan assumed `-H` flag overrides `process.env.HOST`; it does not — they are independent
- **Fix:** Updated dev/start scripts to prefix `HOST=127.0.0.1` before the next command: `HOST=127.0.0.1 next dev -p 4173 -H 127.0.0.1`. The shell's inline env assignment overrides inherited `HOST=0.0.0.0`, so the guard sees `127.0.0.1` and passes. The instrumentation guard still fires correctly for bare `HOST=0.0.0.0 npx next dev` (Scenario B) because that bypasses the script entirely
- **Security assessment:** The fix is strictly more secure — the script now sets HOST to 127.0.0.1 explicitly regardless of caller, rather than relying solely on the `-H` flag. Both layers work correctly in all three scenarios
- **Files modified:** `web/package.json`
- **Commit:** `5b4d42f`

**3. [Rule 2 - Missing] `web/tsconfig.json` did not cover `instrumentation.ts`**
- **Found during:** Task 2, typecheck verification
- **Issue:** `instrumentation.ts` is at `web/` root; `web/tsconfig.json` `include` only covered `src/**/*` and `tests/**/*`
- **Fix:** Added `"instrumentation.ts"` to `web/tsconfig.json` include array
- **Files modified:** `web/tsconfig.json`
- **Commit:** `32a66dc`

**4. [Rule 1 - Bug] `tsconfig.check.json` cannot typecheck `web/instrumentation.ts` (moduleResolution conflict)**
- **Found during:** Task 3, final typecheck run
- **Issue:** Root `tsconfig.check.json` uses NodeNext moduleResolution (inherited from root `tsconfig.json`), which requires `.js` extensions on ESM imports. The dynamic import in `instrumentation.ts` uses no extension (deviation 1). Root typecheck emitted `TS2835` error
- **Fix:** Removed `web/instrumentation.ts` from `tsconfig.check.json` include. `instrumentation.ts` is now covered ONLY by `web/tsconfig.json` (bundler moduleResolution). Root typecheck covers `web/src/**/*`, `web/tests/**/*`, `web/next.config.ts` — all pass cleanly
- **Rationale:** The two tsconfig contexts use different moduleResolution strategies intentionally (D-04). Files at the web/ root that depend on bundler resolution cannot be included in the root NodeNext typecheck context
- **Files modified:** `tsconfig.check.json`
- **Commit:** `5b4d42f`

**5. [Rule 1 - Bug] TypeScript error in integration test: `match[1]` type `string | undefined` not assignable to `string | null`**
- **Found during:** Task 3, final typecheck run
- **Issue:** `RegExpMatchArray[number]` is `string | undefined` in TypeScript with `noUncheckedIndexedAccess: true`; `parseListenBindAddress` return type was `string | null`
- **Fix:** Changed `return match[1]` to `return match[1] ?? null`
- **Files modified:** `web/tests/host-binding.integration.test.ts`
- **Commit:** `5b4d42f`

## lsof Command + Output Format

The integration test uses:
```bash
execFileSync('lsof', ['-iTCP:' + port, '-sTCP:LISTEN', '-P', '-n'], { encoding: 'utf8' })
```

Parse pattern: `/(\S+):(\d+)\s*\(LISTEN\)/` against each line of output. The NAME column on macOS contains `127.0.0.1:14173 (LISTEN)`. The bind address is the first capture group.

**lsof was available and worked on this Mac** — netstat fallback was not needed.

## Scenario C Child-Process Cleanup

Scenario C uses `detached: true` in spawn and kills via `process.kill(-child.pid, 'SIGTERM')` (negative PID kills the process group, including the npm-spawned next dev child). The 2-second SIGKILL grace period fired in cleanup. No orphaned next dev processes observed between test runs.

## GOLAZO_SKIP_HOST_INTEGRATION=1 Verification

Setting `GOLAZO_SKIP_HOST_INTEGRATION=1` causes `describe.skipIf(SKIP)` to mark all 3 integration tests as skipped. Vitest reports `3 skipped` and exits 0. Verified manually.

## Test Count Delta

- Root vitest suite: 403 (unchanged — root vitest.config.ts does NOT include web/tests/)
- Web vitest suite: 20 total (3 workspace-import + 14 hostGuard unit + 3 host-binding integration)
- Total across both workspaces: 423

## tsconfig.json Invariant Confirmation

`git diff tsconfig.json` shows **zero changes** — base TypeScript config byte-identical to pre-plan state.

## bin Invariant Confirmation

`package.json#bin.golazo` is still `"./dist/cli/index.js"`. `npm run build` emits `dist/cli/index.js`; bin-existence check exits 0.

## Threat Flags

No new network endpoints, auth paths, or schema changes introduced. The `instrumentation.ts` file REDUCES the threat surface by aborting startup on non-loopback HOST — it is a mitigation, not new surface.

## Known Stubs

None — all functionality is fully implemented and tested.

## Self-Check: PASSED

- `web/src/lib/hostGuard.ts`: FOUND; exports `validateHostBinding` + `LOOPBACK_HOSTS`; WEB-03 in message
- `web/src/lib/hostGuard.test.ts`: FOUND; 14 tests pass
- `web/instrumentation.ts`: FOUND; register() async; NEXT_RUNTIME guard; validateHostBinding call
- `web/tests/host-binding.integration.test.ts`: FOUND; 3 scenarios; all pass
- `web/package.json` dev script: `HOST=127.0.0.1 next dev -p 4173 -H 127.0.0.1` CONFIRMED
- `web/package.json` start script: `HOST=127.0.0.1 next start -p 4173 -H 127.0.0.1` CONFIRMED
- Commits a8281e9, 32a66dc, 5b4d42f: in git log
- Root vitest 403/403: PASS
- Web vitest 20/20: PASS
- Web typecheck: exits 0
- Root tsconfig.check.json: exits 0
- Root build + bin: PASS
- tsconfig.json byte-identical: CONFIRMED
- root package.json byte-identical: CONFIRMED
