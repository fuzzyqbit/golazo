---
phase: "07"
plan: "01"
subsystem: web/ui
tags:
  - phase-07
  - browse-surface
  - url-state
  - pure-functions
  - tdd
  - typescript
dependency_graph:
  requires: []
  provides:
    - web/src/lib/ui/listParams.ts (parseListParams, serializeListParams, DEFAULT_LIST_PARAMS, SORT_KEYS, KID_FILTERS, ListParams, SortKey, SortDir, KidFilter)
    - web/src/lib/ui/listOps.ts (sortEpisodes, filterByKid, applyListParams, RESULT_RANK)
  affects:
    - Plan 07-03 (Server Component reads searchParams → parseListParams; client calls serializeListParams for router.replace)
tech_stack:
  added: []
  patterns:
    - table-driven tests with it.each + inline FIXTURE
    - pure-module pattern (no next/react/node imports)
    - immutable array ops ([...rows].sort)
    - named-constant result ranking (RESULT_RANK)
key_files:
  created:
    - web/src/lib/ui/listParams.ts
    - web/src/lib/ui/listParams.test.ts
    - web/src/lib/ui/listOps.ts
    - web/src/lib/ui/listOps.test.ts
  modified: []
decisions:
  - "DEFAULT_LIST_PARAMS = { sort: { key: 'date', dir: 'desc' }, kid: 'all' } — date.desc + all omitted from URL"
  - "RESULT_RANK = { W: 0, D: 1, L: 2 } — operator-intuitive ascending (best-first W → D → L)"
  - "Tie-breaker: kid ASC → date DESC → gameFolder ASC (matches Phase 6 Plan 01 scanner contract)"
  - "serializeListParams key order: sort before kid (deterministic)"
  - "filterByKid('all', rows) returns rows as-is (no copy); other kids return rows.filter (new array)"
metrics:
  duration: "7 min 0 s"
  completed: "2026-06-01T21:03:02Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 07 Plan 01: URL State Params + List Ops Summary

Pure URL-state parsing/serialization (`?sort=<key>.<dir>&kid=<filter>`) plus deterministic sort/filter functions over `EpisodeIndex[]`, with 45 table-driven tests across two colocated test files.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| T1 RED | listParams test file | df659db | web/src/lib/ui/listParams.test.ts |
| T1 GREEN | listParams implementation | 8c1fbef | web/src/lib/ui/listParams.ts |
| T2 RED | listOps test file | c9a4ee1 | web/src/lib/ui/listOps.test.ts |
| T2 GREEN | listOps implementation | e3129f2 | web/src/lib/ui/listOps.ts |

## Implementation Details

### DEFAULT_LIST_PARAMS (exact shipped value)
```typescript
export const DEFAULT_LIST_PARAMS: ListParams = {
  sort: { key: 'date', dir: 'desc' },
  kid: 'all',
} as const;
```

### RESULT_RANK (exact shipped value)
```typescript
export const RESULT_RANK: Record<'W' | 'D' | 'L', number> = {
  W: 0,
  D: 1,
  L: 2,
} as const;
```
Ascending = best-first (W → D → L). Descending reverses.

### Sort Tie-Breaker
All `sortEpisodes` branches fall back to: `kid ASC → date DESC → gameFolder ASC`, matching the Phase 6 Plan 01 scanner ordering contract (pinned by cache.ts QUERY_ALL_SQL).

### URL Contract
- `?sort=<key>.<dir>&kid=<filter>`
- Defaults (`date.desc` + `all`) omitted from URL — `serializeListParams(DEFAULT_LIST_PARAMS)` returns `''`
- Serialization key order: `sort` before `kid` (deterministic)
- Invalid/array values fall back silently to defaults — never throws

## Test Results

```
cd web && npx vitest run src/lib/ui/
  Test Files  2 passed (2)
  Tests       45 passed (45)
```

- `listParams.test.ts`: 26 tests (14 parse cases, 6 serialize cases, 3 round-trip cases, plus constant/default assertions)
- `listOps.test.ts`: 19 tests (filterByKid ×4, sortEpisodes ×9, tie-breaker ×1, applyListParams ×3, RESULT_RANK ×1, immutability ×1)

Root suite unchanged: `npx vitest run` → 403 tests pass.

## Defaults Tweaked During RED → GREEN Cycles

None — defaults shipped exactly as specified in the plan.

One deviation during RED→GREEN: the listOps test file had incorrect expected sort order for `date.desc`/`date.asc`/`kid.asc`/`kid.desc` cases (my mental model reversed the tie-breaker order for rows with same date). Fixed the test expectations to match the correct tie-breaker logic (`gameFolder ASC` within same `kid+date`). The implementation was correct from the start.

## File-Disjoint Confirmation with Plan 02

Plan 07-02 files (per plan frontmatter): `web/src/app/page.tsx`, `web/src/app/page.test.tsx`, `web/src/app/layout.tsx`. No overlap with Plan 07-01's `web/src/lib/ui/` directory.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

One test-expectation correction (not a deviation): listOps RED test had wrong expected order for `date.desc`/`date.asc`/`kid.asc`/`kid.desc` cases. The tie-breaker is `kid ASC → date DESC → gameFolder ASC`. For two rows with `kid=leo, date=2026-04-01`, `gameFolder='2026-04-01_vs_apex_1-1'` sorts before `gameFolder='2026-04-01_vs_united_1-0'`. Test expectations corrected before GREEN commit.

## Known Stubs

None. Pure-logic modules with no data source wiring.

## Threat Flags

None. Pure utility functions — no network endpoints, no auth paths, no file access, no schema changes.

## Self-Check: PASSED

- [x] web/src/lib/ui/listParams.ts exists
- [x] web/src/lib/ui/listParams.test.ts exists
- [x] web/src/lib/ui/listOps.ts exists
- [x] web/src/lib/ui/listOps.test.ts exists
- [x] Commit df659db exists (RED listParams)
- [x] Commit 8c1fbef exists (GREEN listParams)
- [x] Commit c9a4ee1 exists (RED listOps)
- [x] Commit e3129f2 exists (GREEN listOps)
- [x] 45 tests pass in web/src/lib/ui/
- [x] 403 root tests unchanged
- [x] npx tsc --noEmit exits 0
- [x] No imports from next/*, react, node:*
