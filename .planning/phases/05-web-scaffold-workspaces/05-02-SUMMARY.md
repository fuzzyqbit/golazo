---
phase: 05-web-scaffold-workspaces
plan: "02"
subsystem: web
tags: [next.js, turbopack, app-router, npm-workspaces, typescript, vitest, zod]

requires:
  - phase: 05-web-scaffold-workspaces
    plan: "01"
    provides: "@golazo/cli scoped name + workspaces:[\"web\"] declared"

provides:
  - "web/ directory with Next.js 16.2.6 + Turbopack App Router skeleton"
  - "web/package.json: @golazo/web, Next 16.2.6, react 19.x, @golazo/cli via file:.., vitest"
  - "web/tsconfig.json: jsx:preserve, moduleResolution:bundler, DOM libs, next plugin"
  - "web/next.config.ts: minimal placeholder"
  - "web/src/app/layout.tsx + page.tsx: placeholder home page"
  - "Root web:dev, web:build, web:start orchestrator scripts"
  - "tsconfig.check.json widened to include web/src/**/* + web/tests/**/* + web/next.config.ts"
  - "web/tests/workspace-import.test.ts: 3-case vitest suite proving WEB-01 SC#4"
  - "node_modules/@golazo/cli and @golazo/web symlinks wired"

affects:
  - 05-03-localhost-hardening
  - 05-04-fonts-theme

tech-stack:
  added:
    - "next@16.2.6"
    - "react@19.2.6 (web workspace)"
    - "react-dom@19.2.6 (web workspace)"
    - "vitest@4.1.6 (web devDep)"
  patterns:
    - "Next.js App Router layout.tsx + page.tsx file conventions"
    - "Cross-workspace type import via npm workspace symlink + dist/ subpath"
    - "web/tsconfig.json extends root but overrides moduleResolution to bundler"

key-files:
  created:
    - web/package.json
    - web/tsconfig.json
    - web/next.config.ts
    - web/next-env.d.ts
    - web/src/app/layout.tsx
    - web/src/app/page.tsx
    - web/.gitignore
    - web/tests/workspace-import.test.ts
  modified:
    - package.json (added web:dev, web:build, web:start scripts)
    - package-lock.json (workspace-aware, Next.js 16.2.6 installed)
    - tsconfig.check.json (include widened to cover web/ tree)

key-decisions:
  - "D-04 LOCKED: web/tsconfig.json uses moduleResolution:bundler (NOT NodeNext)"
  - "D-05 LOCKED: dev port = 4173"
  - "D-06 LOCKED: @golazo/cli imports via dist/... subpath (no exports map)"
  - "D-07 LOCKED: cross-workspace type-import smoke in web/tests/workspace-import.test.ts"
  - "D-08 LOCKED: @golazo/cli referenced as file:.. in web/package.json (not wildcard *)"

decisions:
  - "D-04: web/tsconfig.json moduleResolution=bundler — Next.js App Router + Turbopack require bundler; NodeNext would force .js extensions on every relative import in web/, incompatible with Next.js conventions"
  - "D-05: dev port 4173 — avoids Next.js default 3000 (often occupied); semantically signals preview (matches Vite); fixed value avoids cognitive load"
  - "D-06: @golazo/cli/dist/... imports — no exports map on root package.json; deferred to Phase 6/7 when multi-import convenience warrants it"
  - "D-07: cross-workspace smoke in web/tests/ — belongs to web package; runs under web tsconfig (DOM lib + bundler moduleResolution), correctly simulates real web-code import patterns"
  - "D-08: @golazo/cli as file:.. — npm 10.9.4 does not resolve workspace-host packages via * wildcard from workspace members; file:.. is the npm-native approach for referencing the parent monorepo root"

metrics:
  duration: "13min 10s"
  completed: "2026-06-01"
  tasks: 2
  files: 11
---

# Phase 05 Plan 02: Next.js 16 Web Scaffold Summary

**Next.js 16.2.6 + Turbopack App Router skeleton created under web/ with workspace wiring, root web:* orchestrator scripts, widened typecheck, and 3-case vitest suite proving the cross-workspace manifestSchema import (WEB-01 SC#4)**

## Performance

- **Duration:** 13 min 10 s
- **Started:** 2026-06-01T04:02:01Z
- **Completed:** 2026-06-01T04:15:11Z
- **Tasks:** 2 (1 scaffold + 1 TDD cross-workspace smoke)
- **Files created/modified:** 11

## Accomplishments

- Created `web/` App Router skeleton with 7 files: `package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `.gitignore`
- Added `web:dev`, `web:build`, `web:start` orchestrator scripts to root `package.json`
- Widened `tsconfig.check.json` include to cover `web/src/**/*`, `web/tests/**/*`, `web/next.config.ts`
- Installed Next.js 16.2.6 (latest 16.x at execution time); wired workspace symlinks `node_modules/@golazo/cli -> ..` and `node_modules/@golazo/web -> web/`
- Dev server verified: `npm run web:dev` from root launches Turbopack; `curl http://127.0.0.1:4173/` returns 200 with `golazo — web (placeholder)` heading in body
- Wrote and passed 3-case vitest smoke proving `manifestSchema` imports from `@golazo/cli/dist/prepare/manifest.js` via workspace symlink
- All 403 root tests pass; root typecheck and web typecheck both exit 0; `dist/cli/index.js` bin path intact

## Task Commits

Each task was committed atomically:

1. **Task 1: Next.js 16 scaffold + root scripts + tsconfig widening** — `d2952e0` (feat)
2. **Task 2 RED: failing workspace import test** — `0f55385` (test)
3. **Task 2 GREEN: wire manifestSchema import, 3 cases pass** — `d472ec7` (feat)

## Files Created/Modified

| File | Action | Notes |
|------|--------|-------|
| `web/package.json` | Created | @golazo/web, Next 16.2.6, @golazo/cli via file:.., vitest |
| `web/tsconfig.json` | Created | Extends root; jsx:preserve, moduleResolution:bundler, DOM libs |
| `web/next.config.ts` | Created | Minimal; Plan 03 adds hostname enforcement |
| `web/next-env.d.ts` | Created | Auto-updated by Next.js on first dev run (committed per docs) |
| `web/src/app/layout.tsx` | Created | App Router root layout; Plan 04 attaches font className |
| `web/src/app/page.tsx` | Created | Placeholder home page |
| `web/.gitignore` | Created | .next/, data/ ignored |
| `web/tests/workspace-import.test.ts` | Created | 3-case WEB-01 SC#4 smoke |
| `package.json` | Modified | +web:dev, +web:build, +web:start scripts |
| `package-lock.json` | Modified | Next.js 16.2.6 + react 19.x + workspace wiring |
| `tsconfig.check.json` | Modified | include widened: +web/src/**/* +web/tests/**/* +web/next.config.ts |

## Decisions Made

**D-04 LOCKED: `moduleResolution: "bundler"` in `web/tsconfig.json`**
- Next.js App Router + Turbopack require `bundler` resolution
- `NodeNext` would force `.js` extensions on every relative import in `web/`, incompatible with Next.js App Router conventions (`import './globals.css'`, `import Component from './Component'` without extension)
- Trade-off accepted: `web/` and root `src/` use different moduleResolution strategies. Correct and expected — they are different compilation contexts (web is bundled by Turbopack; src/ is compiled by tsc for Node.js)

**D-05 LOCKED: dev port = 4173**
- Avoids Next.js default port 3000 (commonly occupied during development)
- Semantically signals "preview" (matches Vite's preview-port convention)
- Fixed value avoids "what port did it pick" cognitive load
- No port conflicts found; `-H 127.0.0.1` flag confirmed supported per Context7 docs (`next dev -H <hostname>`)

**D-06 LOCKED: `@golazo/cli/dist/...` subpath imports (no exports map)**
- `web/tests/workspace-import.test.ts` imports `@golazo/cli/dist/prepare/manifest.js`
- No `exports` map added to root `package.json` — scope preserved from Plan 01 (D-03)
- Deferred to Phase 6/7 or v2.1 if multi-import convenience becomes painful

**D-07 LOCKED: cross-workspace smoke in `web/tests/workspace-import.test.ts`**
- Test belongs to web package, not root tests/
- Running from web/ uses web tsconfig (DOM lib + bundler moduleResolution), correctly simulating real web-code import patterns
- Root vitest suite does NOT pick up web/tests/ (root vitest.config.ts doesn't list web/) — workspace test suites isolated

**D-08 LOCKED: `@golazo/cli` referenced as `"file:.."` in `web/package.json`**
- Plan specified `"*"` wildcard; npm 10.9.4 attempted registry resolution (`GET /registry.npmjs.org/@golazo%2fcli`) instead of workspace resolution
- Root package `@golazo/cli` is the workspace HOST, not a member listed in `workspaces:[]`, so npm doesn't resolve `"*"` as a local workspace reference from web/
- `file:..` is the npm-native approach for workspace members referencing the workspace root; npm installs create `node_modules/@golazo/cli -> ../..` symlink correctly
- Plan's stated fallback was "switch to explicit version `0.1.0`" — but that would still hit the registry. `file:..` is the correct npm workspaces idiom

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@golazo/cli: "*"` fails npm resolution — switched to `file:..`**
- **Found during:** Task 1, Step 4 (npm install)
- **Issue:** `npm install` tried to fetch `@golazo/cli@*` from registry (HTTP 404). npm 10.9.x treats `"*"` as a registry semver range for the workspace HOST package (not listed in `workspaces:[]`), not a local workspace reference
- **Fix:** Changed `"@golazo/cli": "*"` to `"@golazo/cli": "file:.."` in `web/package.json`. npm resolves this to the repo root, creates `node_modules/@golazo/cli -> ../..` symlink correctly
- **Files modified:** `web/package.json`
- **Commit:** `d2952e0`

**2. [Rule 1 - Bug] `beforeAll` with `execSync` caused ENOENT in vitest sandbox — removed**
- **Found during:** Task 2, RED phase run
- **Issue:** The defensive `beforeAll` used `execSync('npm run build', ...)` in a vitest worker environment where shell spawning fails (ENOENT on /bin/sh). The dist file already exists from Task 1's build step
- **Fix:** Removed the `execSync` block; documented the pre-flight requirement as a comment. The clean-clone defensive path is a documentation concern, not a runtime concern for this test
- **Files modified:** `web/tests/workspace-import.test.ts`
- **Commit:** `d472ec7`

**3. [Auto] `web/next-env.d.ts` auto-modified by Next.js on first dev run**
- **Found during:** Task 1, Step 5 (dev server verification)
- **Issue:** Next.js added `import "./.next/dev/types/routes.d.ts"` to `next-env.d.ts` on first startup
- **Fix:** Accepted the modification (this is documented Next.js behavior — file should not be manually edited). Committed as-is per Next.js docs
- **Impact:** None — `next-env.d.ts` is always auto-regenerated; the import line is normal

**4. [Rule 3 - TDD] RED phase test passed immediately (not a true RED)**
- **Found during:** Task 2, RED phase
- **Issue:** The initial test in the RED commit had `execSync` errors (not actual assertion failures). After removing the beforeAll, the test ran green immediately because the workspace symlink + dist file were already in place from Task 1
- **Fix:** Proceeded to GREEN commit per plan's TDD guidance: "RED-GREEN: write the test first. With the workspace symlink in place (Task 1) and dist/prepare/manifest.js on disk, all three cases should pass on first run." This is expected TDD behavior when infrastructure is pre-populated
- **TDD Gate:** RED commit `0f55385` exists (test); GREEN commit `d472ec7` exists (implementation); gate compliance documented

## Known Stubs

The `web/src/app/page.tsx` heading `golazo — web (placeholder)` is an intentional placeholder per plan spec. Plan 04 (fonts + theme) is the designated plan to replace it with styled content. This stub is plan-intentional and does not prevent the plan's goal (scaffold stands + dev server works + cross-workspace import proved).

## tsconfig Invariant Confirmation

`git diff tsconfig.json` shows **zero changes** — base TypeScript config is byte-identical to pre-plan state.

## bin Invariant Confirmation

`package.json#bin.golazo` is still `"./dist/cli/index.js"`. `npm run build` still emits `dist/cli/index.js`; bin-existence check exits 0.

## Next.js Version Record

**Next.js 16.2.6** — latest 16.x point release at execution time (2026-06-01). Plans 03 + 04 + Phase 6+ can rely on this version being locked in `package-lock.json`. The `next: "^16"` caret allows future 16.x patch releases.

## Test Count Delta

- Root vitest suite: 403 (unchanged — root vitest.config.ts does NOT include web/tests/)
- Web vitest suite: 3 new cases in `web/tests/workspace-import.test.ts`
- Total across both workspaces: 406

## Threat Flags

No new security-relevant surface introduced. This plan creates static scaffold files and a test — no network endpoints, no auth paths, no file access patterns, no schema changes at trust boundaries.

## Self-Check: PASSED

- All 8 scaffold files + test file: FOUND
- Root scripts `web:dev`, `web:build`, `web:start`: FOUND
- `tsconfig.check.json` widened: FOUND
- Symlinks `@golazo/cli` + `@golazo/web`: FOUND
- Task commits d2952e0, 0f55385, d472ec7: in git log
- Root typecheck: exits 0
- Web typecheck: exits 0
- Root vitest 403/403: PASS
- Web vitest 3/3: PASS
- Dev server serves placeholder heading: VERIFIED
