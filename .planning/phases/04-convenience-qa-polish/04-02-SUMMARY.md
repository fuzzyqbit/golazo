---
phase: 04-convenience-qa-polish
plan: 02
subsystem: qa-tooling
tags: [coverage, vitest, testing, ci-gate]
dependency_graph:
  requires: []
  provides: [coverage-gate, test-coverage-script, baseline-coverage-metrics]
  affects: [04-03-PLAN.md]
tech_stack:
  added: []
  patterns: [v8-coverage, vitest-thresholds]
key_files:
  created: []
  modified:
    - vitest.config.ts
    - package.json
    - README.md
    - src/cli/all.integration.test.ts
decisions:
  - "coverage.all omitted (default false) — only imported-during-test files counted, consistent with Remotion exclusion stance"
  - "src/**/types.ts excluded — interface-only modules with no executable logic; artificially deflate denominator"
  - "all.integration.test.ts test 5 timeout increased 120_000→240_000ms — two Remotion renders under coverage instrumentation exceed 120 s"
  - "coverage/ was already gitignored in .gitignore line 4 — no .gitignore change needed"
metrics:
  duration: "6 min 16 s"
  completed: "2026-05-15"
  tasks_completed: 2
  files_modified: 4
---

# Phase 04 Plan 02: Coverage Gate Tooling Summary

Wired v8 coverage reporting with an 80% line-coverage gate on `src/`. Added `npm run test:coverage` script, README Testing section, and fixed a coverage-mode timeout. **The 80% threshold passes at baseline (86.72% lines)** — Plan 04-03 starts from green.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend vitest.config.ts with coverage thresholds + include/exclude | 5aee5b8 | vitest.config.ts |
| 2 | Add test:coverage npm script + README Testing section + fix coverage timeout | 570204e | package.json, README.md, src/cli/all.integration.test.ts |

## Final vitest.config.ts Coverage Block

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'html'],
  include: ['src/**/*.ts'],
  exclude: [
    '**/*.test.ts',
    '**/*.test-cases.ts',
    'tests/fixtures/**',
    'tests/snapshots/**',
    'remotion/**',
    'dist/**',
    '*.config.ts',
    '*.config.js',
    'eslint.config.js',
    'src/**/types.ts',
  ],
  thresholds: {
    lines: 80,
  },
},
```

## Exclusion Rationale

| Exclusion | Reason |
|-----------|--------|
| `remotion/**` | Remotion compositions are visually regression-tested via `renderStill` snapshots (Plan 04-04); line coverage is inappropriate for JSX/composition trees |
| `**/*.test.ts` | Test files contain no production logic |
| `**/*.test-cases.ts` | Named test-case constants — no production logic |
| `tests/fixtures/**` | Binary fixtures and fixture configs; not production code |
| `tests/snapshots/**` | Committed PNG snapshots; not code |
| `dist/**` | Build output; not source |
| `*.config.ts`, `*.config.js`, `eslint.config.js` | Tooling config; not application logic |
| `src/**/types.ts` | Interface-only modules with no executable statements; artificially deflate threshold denominator |

## Baseline Coverage Measurement

**Command:** `npm run test:coverage`
**Run date:** 2026-05-15
**Test suite:** 380 tests passing (30 test files)

```
 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   86.62 |     72.1 |   86.92 |   86.72 |                   
 cli               |   80.85 |    37.14 |      75 |   80.85 |                   
  all.ts           |     100 |       75 |     100 |     100 | 133-166           
  index.ts         |      55 |    17.39 |      50 |      55 | 60-83             
 cli/commands      |   57.42 |    44.44 |   72.72 |   57.42 |                   
  all.ts           |   89.36 |    69.56 |     100 |   89.36 | 67-70,91-94,139   
  auth.ts          |   14.28 |        0 |      50 |   14.28 | 26-37             
  prepare.ts       |    5.55 |        0 |      50 |    5.55 | 34-76             
  publish.ts       |     100 |       80 |     100 |     100 | 57                
  render.ts        |    6.25 |        0 |      50 |    6.25 | 41-78             
 config            |   87.83 |    70.83 |     100 |   90.27 |                   
  channels.ts      |   84.21 |    71.73 |     100 |   87.27 | ...19,172-173,195 
  errors.ts        |     100 |       50 |     100 |     100 | 63                
 prepare           |   93.89 |    81.05 |   81.39 |   93.59 |                   
  clips.ts         |     100 |    91.66 |     100 |     100 | 59                
  errors.ts        |   87.03 |      100 |   56.25 |   87.03 | ...72,327,368,425 
  filename.ts      |     100 |       95 |     100 |     100 | 81                
  kid.ts           |     100 |    86.66 |     100 |     100 | 75-88             
  manifest.ts      |   88.63 |    64.28 |   88.88 |   88.09 | 220-226           
  probe.ts         |    92.3 |    55.55 |     100 |    92.3 | 83                
 publish           |   96.47 |    88.66 |    87.8 |    96.8 |                   
  oauth.ts         |   90.16 |    84.37 |      70 |   90.16 | 277-282           
  publishRecord.ts |     100 |       75 |     100 |     100 | 144,156-159       
  retry.ts         |   95.94 |       90 |      80 |   97.18 | 66,172            
  templates.ts     |     100 |    66.66 |     100 |     100 | 120-123           
 render            |   81.35 |    63.44 |     100 |   81.28 |                   
  driver.ts        |   71.92 |    52.38 |     100 |   71.42 | ...55,473-474,513 
  musicPool.ts     |     100 |    81.25 |     100 |     100 | 87,99-102         
  ...nentPretty.ts |    90.9 |    83.33 |     100 |     100 | 41                
-------------------|---------|----------|---------|---------|-------------------

=============================== Coverage summary ===============================
Statements   : 86.62% ( 751/867 )
Branches     : 72.1% ( 336/466 )
Functions    : 86.92% ( 113/130 )
Lines        : 86.72% ( 732/844 )
================================================================================
```

## Threshold Status

| Metric | Result | Threshold | Status |
|--------|--------|-----------|--------|
| Lines | 86.72% | 80% | PASSES |
| Statements | 86.62% | not gated | — |
| Branches | 72.1% | not gated | — |
| Functions | 86.92% | not gated | — |

**The 80% line threshold passes at baseline.** Plan 04-03 starts from a green gate and does not need to add fill-in coverage to satisfy QA-02.

## Low-Coverage Modules for Plan 04-03 Reference

These modules have the lowest line coverage if Plan 04-03 wants to improve branch/function coverage:

| Module | Lines | Branches | Notes |
|--------|-------|----------|-------|
| `cli/commands/prepare.ts` | 5.55% | 0% | CLI handler stub — mostly not-yet-implemented path |
| `cli/commands/render.ts` | 6.25% | 0% | CLI handler stub — mostly not-yet-implemented path |
| `cli/commands/auth.ts` | 14.28% | 0% | CLI handler stub — mostly not-yet-implemented path |
| `cli/index.ts` | 55% | 17.39% | Top-level entry; error-path branches not exercised |
| `render/driver.ts` | 71.92% | 52.38% | Several error branches uncovered |

Note: The stub CLI handlers (`prepare.ts`, `render.ts`, `auth.ts`) show low coverage because they return "not yet implemented" for most paths — this is by design per Phase 1 decisions and will remain until later phases land.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed coverage-mode test timeout in all.integration.test.ts**
- **Found during:** Task 2 — first `npm run test:coverage` run
- **Issue:** Test 5 in `all.integration.test.ts` has a 120_000ms timeout and performs two full Remotion renders. Coverage instrumentation adds significant overhead, pushing the render beyond the 120 s limit and causing the test to time out. The identical test passes in `npm test` (no coverage) within the same budget.
- **Fix:** Increased the timeout from `120_000` to `240_000` (4 minutes) in `all.integration.test.ts` test 5.
- **Files modified:** `src/cli/all.integration.test.ts`
- **Commit:** 570204e (bundled with Task 2)

**2. [No-op] .gitignore already had coverage/ on line 4**
- **Issue:** Plan said to add `coverage/` if missing — it was already present.
- **Fix:** No change made; idempotency confirmed via `grep -cE '^coverage/?$' .gitignore`.

## Known Stubs

None — this plan adds tooling only (vitest config + npm script + README docs). No production data flows introduced.

## Threat Flags

None — changes are dev tooling configuration and documentation only. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- vitest.config.ts exists and contains `thresholds`, `lines: 80`, `src/**/*.ts` include, `remotion/**` exclude: confirmed
- package.json `test:coverage` script = `vitest run --coverage`: confirmed
- README.md `## Testing` section present: confirmed
- coverage/ gitignored: confirmed (line 4 of .gitignore)
- Commits 5aee5b8, 570204e exist in git log: confirmed
- `npm run test:coverage` runs and passes with 86.72% line coverage: confirmed
