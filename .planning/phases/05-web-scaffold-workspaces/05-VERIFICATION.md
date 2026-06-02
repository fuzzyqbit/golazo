---
phase: 05-web-scaffold-workspaces
verified: 2026-06-01T01:10:00Z
status: passed
score: 5/5
overrides_applied: 1
re_verification: true
re_verified: 2026-06-02T16:40:00Z
closure_source: "Commit bf1432f (fix(05): exclude web/src/app + theme/index from tsconfig.check.json) — the 3 Phase-5-introduced TS errors are resolved by adding web/src/app/**, web/src/theme/index.ts, and web/instrumentation.ts to the tsconfig.check.json exclude list (same precedent as web/src/fonts.ts). Web code typechecks cleanly via web/tsconfig.json which uses bundler resolution + jsx preserve + @/* path mapping."
overrides:
  - id: "v1.0-typecheck-debt"
    accepted_by: "operator (golazo v2.0 milestone close prep)"
    accepted_at: "2026-06-02"
    rationale: "7 pre-existing tsc errors in src/cli/all.test.ts + src/publish/oauth.test.ts + retry.test.ts + runner.test.ts predate Phase 5 and slipped past v1.0 milestone close (vitest passed; tsc was not gated post-Plan-04-02). Not Phase 5's responsibility. Tracked as v1.0-typecheck-debt in v2.1+ backlog."
    impact: "Root `npx tsc --noEmit -p tsconfig.check.json` exits with 7 errors against test files only. Production source compiles cleanly. Vitest runs all tests successfully. Affects developer experience (IDE shows red squiggles in 4 test files) but does not affect runtime behavior or shipped code."
---

# Phase 5: Web Scaffold + Workspaces — Verification Report

**Phase Goal:** Operator can run `npm run web:dev` from repo root, get a Next.js 16 app served at `127.0.0.1:<port>` with the project's typographic theme; root + web share types via npm workspaces.
**Verified:** 2026-06-01T01:10:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | `web/` has Next.js 16 App Router project with own `package.json`; root declares `workspaces: ["web"]` | VERIFIED | `web/package.json` name=`@golazo/web`, `next: "^16"` (v16.2.6 installed). Root `package.json` name=`@golazo/cli`, `"workspaces": ["web"]`. Workspace symlinks `node_modules/@golazo/cli -> ../..` and `node_modules/@golazo/web -> ../../web` confirmed. |
| SC2 | `npm run web:dev` launches Turbopack dev server bound to `127.0.0.1` on port 4173 | VERIFIED | Root script: `npm run dev --workspace=@golazo/web`. Web dev script: `HOST=127.0.0.1 next dev -p 4173 -H 127.0.0.1`. Two-layer enforcement: Layer 1 CLI `-H 127.0.0.1` flag; Layer 2 `HOST=127.0.0.1` env prefix. Integration test Scenario A/C confirm 127.0.0.1 bind. `npm run web:build` exits 0; prior dev server smoke confirmed `curl http://127.0.0.1:4173/ → 200`. |
| SC3 | Setting `HOST=0.0.0.0` rejects startup with error referencing `WEB-03`; `HOST=127.0.0.1` or unset proceeds normally | VERIFIED | `web/instrumentation.ts` calls `validateHostBinding(process.env.HOST)` on Node.js runtime. `web/src/lib/hostGuard.ts` throws `WEB-03: refusing to bind to non-loopback HOST '0.0.0.0'...` for non-loopback values. 14 table-driven unit tests pass. Integration Scenario B confirms HOST=0.0.0.0 bare guard abort with WEB-03 in stderr. |
| SC4 | Importing `manifestSchema` from `@golazo/cli` (workspace) inside `web/src/` typechecks against live `src/prepare/manifest.ts` — no copying | VERIFIED | `web/tests/workspace-import.test.ts` imports `@golazo/cli/dist/prepare/manifest.js` via workspace symlink. 3 cases pass (importable + valid parse + malformed parse). `dist/prepare/manifest.js` exists. `node_modules/@golazo/cli → ../..` symlink confirmed. `manifestSchema.safeParse` is a function at runtime. |
| SC5 | Cormorant Garamond Italic + Inter self-hosted; applied to placeholder home route; same TTF bytes as `remotion/assets/fonts/` | VERIFIED | `web/src/fonts.ts` uses `next/font/local` with cross-workspace paths `../../remotion/assets/fonts/CormorantGaramond-Italic.ttf`, `Inter-Regular.ttf`, `Inter-Bold.ttf`. SHA-256 byte-equality confirmed for all three fonts: Remotion source TTFs match `web/.next/static/media/` copies exactly. `layout.tsx` applies `displayFont.variable + labelFont.variable` to `<html>`. `page.module.css` uses `var(--font-display)` and `var(--font-label)`. `web/public/fonts/` not required — primary Turbopack path serves from `.next/static/media/` (satisfies self-hosted intent). |

**Score:** 4/5 truths verified (SC1, SC2, SC3, SC4, SC5 each confirmed; 1 gap below on typecheck quality)

**Note on scoring:** The 5 ROADMAP Success Criteria are all substantively met. The gap below is a cross-cutting quality issue (`npm run typecheck` exit code) that is not itself a named SC but is tested by the verification method's check #3 and the Plan 04 SUMMARY claim.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/package.json` | Next.js 16 scaffold package | VERIFIED | name=`@golazo/web`, next=`^16` (16.2.6 installed), `@golazo/cli: file:..`, dev script with HOST+H |
| `web/src/app/layout.tsx` | App Router root layout | VERIFIED | Imports displayFont, labelFont from `@/fonts`; COLORS from `@/theme`; applies font variables to `<html>` |
| `web/src/app/page.tsx` | Placeholder home page | VERIFIED | CSS Module import; `.heading` + `.body` classNames applied; heading text present |
| `web/src/app/page.module.css` | CSS Module with font vars | VERIFIED | `.heading { font-family: var(--font-display); }`, `.body { font-family: var(--font-label); }` |
| `web/src/lib/hostGuard.ts` | Pure host validator (WEB-03) | VERIFIED | `validateHostBinding` function; `LOOPBACK_HOSTS` const; WEB-03 token in error message |
| `web/src/lib/hostGuard.test.ts` | 14-case unit tests | VERIFIED | 14 tests pass (8 allow + 5 deny + 1 LOOPBACK_HOSTS export) |
| `web/instrumentation.ts` | Next.js startup hook | VERIFIED | `register()` async; NEXT_RUNTIME guard; `validateHostBinding(process.env.HOST)` call |
| `web/tests/host-binding.integration.test.ts` | 3-scenario spawn test | VERIFIED | Scenarios A (happy path), B (guard abort), C (composed CLI-flag-wins) |
| `web/tests/workspace-import.test.ts` | Cross-workspace import smoke | VERIFIED | 3 cases; imports `manifestSchema` from `@golazo/cli/dist/prepare/manifest.js` |
| `web/src/fonts.ts` | Font registrations | VERIFIED | `displayFont` (Cormorant Garamond Italic), `labelFont` (Inter 400+700), `fontVariables` export |
| `web/src/theme/tokens.ts` | Theme constants | VERIFIED | `COLORS`, `TYPOGRAPHY`, `SPACING` as const |
| `web/src/theme/index.ts` | Barrel export | VERIFIED (wiring gap) | Exists; `export * from './tokens'`; FAILS under NodeNext (no .js extension) |
| `web/src/theme/tokens.test.ts` | 10-case theme tests | VERIFIED | 10 tests pass |
| `tests/workspace.test.ts` | 16-case v1.0 contract pin | VERIFIED | 16 tests pass; pins name, workspaces, bin, scripts |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `web/src/app/layout.tsx` | `web/src/fonts.ts` | `import { displayFont, labelFont } from '@/fonts'` | WIRED | Path alias resolves under web/tsconfig.json (bundler); fails under tsconfig.check.json (NodeNext) |
| `web/src/app/layout.tsx` | `web/src/theme/index.ts` | `import { COLORS } from '@/theme'` | WIRED | Same path alias situation as above |
| `web/instrumentation.ts` | `web/src/lib/hostGuard.ts` | `await import('./src/lib/hostGuard')` | WIRED | Dynamic import; no `.js` extension (correct for Turbopack bundler); confirmed by integration tests |
| `web/src/fonts.ts` | `remotion/assets/fonts/*.ttf` | `next/font/local` cross-workspace relative path | WIRED | SHA-256 byte equality confirmed for all 3 TTFs; fonts in `.next/static/media/` |
| `web/tests/workspace-import.test.ts` | `dist/prepare/manifest.js` | `import { manifestSchema } from '@golazo/cli/dist/prepare/manifest.js'` | WIRED | Workspace symlink confirmed; 3 test cases pass |
| Root `web:dev` | `web package.json dev script` | `npm run dev --workspace=@golazo/web` | WIRED | Script delegation confirmed |

---

## Data-Flow Trace (Level 4)

Not applicable for this phase — Phase 5 delivers infrastructure (workspace, scaffold, localhost hardening, fonts/theme). No dynamic data rendering. The placeholder home page renders static content intentionally.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Root vitest 403 tests pass | `cd /golazo && npx vitest run` | 33 files, 403/403 pass | PASS |
| Web vitest 30 tests pass | `cd /golazo/web && npx vitest run` | 4 files, 30/30 pass | PASS |
| `web:build` exits 0 | `npm run web:build` | Next.js 16.2.6 build succeeded, routes: `/`, `/_not-found` | PASS |
| Font SHA-256 byte equality | `shasum -a 256` on source vs `.next/static/media/` | All 3 TTFs match (CormorantGaramond + Inter Regular + Inter Bold) | PASS |
| `@golazo/cli` workspace symlink | `ls -la node_modules/@golazo/cli` | `-> ../..` (repo root) | PASS |
| `manifestSchema` importable | `node --input-type=module -e "import('./dist/prepare/manifest.js')"` | `safeParse: function, parse: function` | PASS |
| `npm run typecheck` exits 0 | `npm run typecheck` | **10 errors** (3 web/ Phase-5-introduced, 7 src/ pre-existing) | FAIL |
| Web-local typecheck exits 0 | `cd web && npx tsc --noEmit` | Exits 0 cleanly | PASS |

---

## Probe Execution

No probe scripts defined for Phase 5. Step 7c: SKIPPED (no `scripts/*/tests/probe-*.sh` found).

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WEB-01 | 05-01, 05-02 | Next.js 16 under `web/`; npm workspaces; types shared | SATISFIED | workspace declared, symlinks wired, cross-workspace import test passes |
| WEB-02 | 05-03 | `web:dev` binds to `127.0.0.1`; `web:start` same | SATISFIED | dev/start scripts: `HOST=127.0.0.1 next dev|start -p 4173 -H 127.0.0.1`; integration tests pass |
| WEB-03 | 05-03 | Refuses startup when HOST is non-loopback | SATISFIED | `validateHostBinding` in `instrumentation.ts`; WEB-03 token pinned; Scenario B integration test passes |
| UI-05 | 05-04 | Cormorant Garamond Italic + Inter self-hosted; applied to placeholder | SATISFIED | SHA-256 byte equality confirmed; fonts in `.next/static/media/`; `var(--font-display)` / `var(--font-label)` applied via CSS Modules |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/src/app/page.tsx` | 6 | `golazo — web (placeholder)` heading text | INFO | Intentional per plan spec; Plan 07 (Browse Surface) replaces with real episode list |
| `web/src/app/page.tsx` | 7 | `Phase 5 scaffold. Episode list lands in Phase 7.` body text | INFO | Intentional per plan spec; not a code stub — page is visibly styled with live fonts |
| `tsconfig.check.json` | — | Includes `web/src/**/*` under NodeNext but missing `@/*` paths and some web files fail NodeNext | WARNING | Root `npm run typecheck` produces 3 Phase-5-introduced TS errors; web-local typecheck passes cleanly |

No debt markers (TBD, FIXME, XXX) found in Phase 5 files.

The placeholder text in `page.tsx` is explicitly documented as plan-intentional (Plan 02 SUMMARY: "stub from Plan 02 resolved by Plan 04"), and the page IS styled with live fonts. This is INFO, not a blocker.

---

## Human Verification Required

### 1. Visual Typography Confirmation

**Test:** Run `npm run web:dev`, open `http://127.0.0.1:4173` in a browser
**Expected:** Page heading displays in Cormorant Garamond Italic (distinctive serif italic); body text in Inter; dark background (`#0a0a0a`) with light foreground (`#f5f1e8`); gold accent color available
**Why human:** CSS rendering, font rendering, and visual rhythm cannot be verified programmatically

### 2. HOST=0.0.0.0 Guard Rejection (Live Server)

**Test:** Set `HOST=0.0.0.0` and run `npx next dev -p 4173` from `web/` directory (bypassing the npm script)
**Expected:** Server fails to start; stderr contains `WEB-03: refusing to bind to non-loopback HOST '0.0.0.0'`
**Why human:** The integration test covers this (Scenario B) but integration tests use `GOLAZO_SKIP_HOST_INTEGRATION` skip mechanism in some environments; a manual smoke confirms the guard fires in the operator's actual environment

---

## Gaps Summary

### GAP-1: `npm run typecheck` fails with 3 Phase-5-introduced web errors (WARNING-level)

**Root cause:** `tsconfig.check.json` was widened to include `web/src/**/*` during Phase 5 (Plan 02), which subjects web files to the root NodeNext `moduleResolution`. Two categories of incompatibility:

1. **Path alias**: `web/src/app/layout.tsx` imports `@/fonts` and `@/theme` — these path aliases exist in `web/tsconfig.json` (`"@/*": ["./src/*"]`) but NOT in `tsconfig.check.json`. TS2307 x2.
2. **No-extension barrel**: `web/src/theme/index.ts` exports `from './tokens'` (no `.js`) which NodeNext requires. TS2835 x1.

**The Plan 04 SUMMARY claims `npx tsc --noEmit -p tsconfig.check.json` exits 0, but this is false.** The errors exist at commit `0e72ae6` (Task 2 final commit) and persist at HEAD.

**Impact assessment:** The web-local typecheck (`cd web && npx tsc --noEmit`) passes cleanly, meaning web code is correctly typed under its own (bundler) context. The root typecheck failure is a configuration gap, not a type-safety gap in the web code itself. However, the SUMMARY claim is directly contradicted by the codebase, and the fix is straightforward.

**Fix options (choose one):**
- Add `"@/*": ["./src/*"]` paths to `tsconfig.check.json` (but requires `baseUrl: "web"` which conflicts with root context)
- Exclude `web/src/app/layout.tsx` and `web/src/theme/index.ts` from `tsconfig.check.json` (same precedent as `web/src/fonts.ts` and `web/instrumentation.ts`)
- Exclude all `web/src/**/*` from `tsconfig.check.json` and rely solely on `cd web && npx tsc --noEmit` for web type coverage (cleaner architectural separation)

**Note on pre-existing src/ errors:** 7 additional errors in `src/cli/all.test.ts`, `src/publish/oauth.test.ts`, `src/publish/retry.test.ts`, `src/publish/runner.test.ts` predate Phase 5. These files were not modified during Phase 5 (confirmed by `git log --oneline ad30b22..HEAD -- <files>` returning empty). The Plan 04 SUMMARY explicitly documents these as a pre-existing out-of-scope issue. These are not Phase 5 regressions.

---

## Deferred Items

None — all Phase 5 deliverables are complete. Phase 6 (Discovery + sqlite Cache + Watcher) takes over next.

---

_Verified: 2026-06-01T01:10:00Z_
_Verifier: Claude (gsd-verifier)_
