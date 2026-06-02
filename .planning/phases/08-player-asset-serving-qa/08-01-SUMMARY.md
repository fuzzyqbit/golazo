---
phase: "08"
plan: "01"
subsystem: asset-serving
tags:
  - phase-08
  - range-parser
  - asset-route
  - path-safety
  - http-range
dependency_graph:
  requires:
    - "07-03: assertSafeAssetPath from assetPath.ts"
    - "07-03: thumb.png/route.ts pattern (runtime/dynamic exports, ctx.params await)"
    - "06-04: discoveryRuntime resolveGolazoRoot"
  provides:
    - "parseRangeHeader pure function (web/src/lib/ui/rangeParser.ts)"
    - "GET /api/asset/[kid]/[game]/episode.mp4 route handler"
    - "Integration test suite on port 4178"
  affects:
    - "08-02: EpisodeDetail video player wires episodeUrlFor(row) to this route"
tech_stack:
  added:
    - "rangeParser.ts — pure RFC 7233 single-range header parser (zero deps)"
    - "episode.mp4/route.ts — Next.js nodejs route with createReadStream + Readable.toWeb"
  patterns:
    - "Readable.toWeb(nodeStream) for Node.js ReadableStream -> Web ReadableStream"
    - "TDD RED/GREEN cycle: stub throws -> table-driven tests -> implementation"
    - "Table-driven test cases (CASES array + it.each) matching assetPath.test.ts style"
key_files:
  created:
    - "web/src/lib/ui/rangeParser.ts"
    - "web/src/lib/ui/rangeParser.test.ts"
    - "web/src/app/api/asset/[kid]/[game]/episode.mp4/route.ts"
    - "web/tests/episode-asset.integration.test.ts"
  modified: []
decisions:
  - "parseRangeHeader returns null for malformed Range (RFC 7233 s2.1 treat as absent -> 200 full)"
  - "Suffix overflow (bytes=-N where N >= size) clamped to full file, not unsatisfiable"
  - "Caching: private, max-age=60 — matches thumb.png policy; operator sees re-renders quickly"
  - "Readable.toWeb from node:stream used for Node 22 Web stream wrapping of createReadStream"
  - "Integration test skip gate: GOLAZO_SKIP_ASSET_INTEGRATION=1 (distinct from list/discovery gates)"
metrics:
  duration: "8 min 15 s"
  completed: "2026-06-02"
  tasks: 2
  files: 4
---

# Phase 8 Plan 1: Range-Aware episode.mp4 Asset Route Summary

**One-liner:** RFC 7233 single-range parser + path-safe episode.mp4 streaming route with 200/206/416/403/404/405 HTTP surface, backed by table-driven TDD.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | rangeParser failing tests | 235e21a | rangeParser.ts (stub), rangeParser.test.ts |
| 1 (GREEN) | rangeParser implementation | 483055a | rangeParser.ts (full) |
| 2 (RED) | Integration test + stub route | fb2b8df | episode.mp4/route.ts (stub), integration test |
| 2 (GREEN) | Full route handler | 277210d | episode.mp4/route.ts (full), integration test (comment fix) |

## parseRangeHeader — Final Signature

```typescript
export type RangeRequest = { start: number; end: number };

export function parseRangeHeader(
  header: string | null | undefined,
  totalSize: number,
): RangeRequest | 'unsatisfiable' | null
```

### Case Table (20 unit tests)

| Input | totalSize | Result |
|-------|-----------|--------|
| `bytes=0-99` | 1000 | `{ start: 0, end: 99 }` |
| `bytes=500-599` | 1000 | `{ start: 500, end: 599 }` |
| `bytes=0-` | 1000 | `{ start: 0, end: 999 }` (EOF) |
| `bytes=100-` | 1000 | `{ start: 100, end: 999 }` (EOF) |
| `bytes=-500` | 1000 | `{ start: 500, end: 999 }` (suffix) |
| `bytes=-1` | 1000 | `{ start: 999, end: 999 }` (last byte) |
| `bytes=-1500` | 1000 | `{ start: 0, end: 999 }` (suffix > size, clamped full) |
| `bytes=0-9999` | 1000 | `{ start: 0, end: 999 }` (end clamped) |
| `bytes=1000-2000` | 1000 | `'unsatisfiable'` (start >= size) |
| `bytes=999-999` | 999 | `'unsatisfiable'` (start == size) |
| `bytes=-0` | 1000 | `'unsatisfiable'` (zero-length suffix) |
| `null` / `undefined` / `''` | 1000 | `null` |
| `items=0-99` | 1000 | `null` (wrong unit) |
| `bytes=0-99,100-199` | 1000 | `null` (multi-range) |
| `bytes=100-99` | 1000 | `null` (end < start) |
| `bytes=abc-99` | 1000 | `null` (non-numeric start) |
| `bytes=0-xyz` | 1000 | `null` (non-numeric end) |
| `bytes 0-99` | 1000 | `null` (missing = sign) |

**Pure module gate:** `grep -c "from 'node:" rangeParser.ts` = 0 (zero node:* imports)

## episode.mp4 Route — HTTP Surface

| Status | Scenario | Trigger |
|--------|----------|---------|
| 200 | Full file stream | No Range header, or malformed Range (null result) |
| 206 | Partial content | Valid Range header — createReadStream with start/end |
| 403 | Path safety violation | assertSafeAssetPath throws AssetPathError |
| 404 | File not found | existsSync(episodePath) is false |
| 405 | Method not allowed | POST / PUT / DELETE |
| 416 | Range not satisfiable | parseRangeHeader returns 'unsatisfiable' |

**Response headers for 206:** Content-Type: video/mp4, Content-Length: chunk bytes, Content-Range: bytes start-end/total, Accept-Ranges: bytes, Cache-Control: private, max-age=60

**Response headers for 200:** Content-Type: video/mp4, Content-Length: total size, Accept-Ranges: bytes, Cache-Control: private, max-age=60

## assertSafeAssetPath Reuse Verification

```
assertSafeAssetPath import count:    3 (import line + two usage occurrences in JSDoc)
function assertSafeAssetPath redef:  0 (NOT redefined — grep gate passes)
```

Import line: `import { assertSafeAssetPath, AssetPathError } from '@/lib/ui/assetPath';`

## Caching Policy

`Cache-Control: private, max-age=60` — matches thumb.png route. Rationale: operator re-renders produce new episode files; 60-second TTL means they see the update within 1 minute without browser forcing; `private` prevents CDN/proxy caching (operator-only access on localhost).

## Integration Test

- **Port:** 4178 (distinct from 4173 dev, 4175 list, 4176 list-empty, 4177 detail)
- **Skip gate:** `GOLAZO_SKIP_ASSET_INTEGRATION=1`
- **Fixture:** `web/tests/fixtures/golazo/` (leo/2026-05-20_vs_rivers_2-2 has episode.mp4; leo/2026-05-13_vs_united_3-1 has only manifest)
- **EXPECTED_SIZE:** computed from `statSync(EPISODE_PATH).size` at test runtime (not hardcoded)

### All 7 Cases Passing

| Case | Method | URL | Expected | Result |
|------|--------|-----|----------|--------|
| 1 | GET | /api/asset/leo/2026-05-20_.../episode.mp4 | 200 full bytes | PASS |
| 2 | GET + Range: bytes=0-99 | same | 206, 100 bytes, Content-Range | PASS |
| 3 | GET + Range: bytes=10-19 | same | 206, 10 bytes, Content-Range | PASS |
| 4 | GET + Range OOB | same | 416, Content-Range: bytes */size | PASS |
| 5 | GET | /api/asset/../etc/episode.mp4 | 403 or 404 | PASS (Next.js normalized to 404) |
| 6 | GET | /api/asset/leo/2026-05-13_.../episode.mp4 | 404 | PASS |
| 7 | POST | /api/asset/leo/2026-05-20_.../episode.mp4 | 405 | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSDoc comment contained `*/` sequence terminating block comment**
- **Found during:** Task 2 GREEN phase (first integration test run)
- **Issue:** Both `episode.mp4/route.ts` and `episode-asset.integration.test.ts` had JSDoc comments with the text `bytes */<size>` which the Turbopack/oxc parser interprets as closing the `/** ... */` block comment, causing a parse error.
- **Fix:** Replaced `bytes */<size>` with `bytes star/size` in JSDoc comments in both files; also replaced `§` section symbol with `s` for ASCII safety.
- **Files modified:** `web/src/app/api/asset/[kid]/[game]/episode.mp4/route.ts`, `web/tests/episode-asset.integration.test.ts`
- **Commit:** 277210d (included in GREEN commit)

**2. [Rule 1 - Bug] Port 4178 remained in use between test runs**
- **Found during:** Task 2 GREEN phase (second integration test run attempt)
- **Issue:** First integration test run left Next.js on port 4178; second run got EADDRINUSE
- **Fix:** `lsof -ti:4178 | xargs kill -9` — manual cleanup between runs; no code change needed. The test's `afterAll` + `killServer` handles cleanup in normal sequential runs.
- **Impact:** Test-environment-only issue, not a code bug.

### Plan Notes

**Case 5 (path traversal):** Next.js route normalization means `encodeURIComponent('..')` in the URL path results in Next.js routing to `/api/etc/episode.mp4` (stripping the `..` segment entirely) rather than delivering `..` to the route handler. This means the route handler's `assertSafeAssetPath` is never invoked — Next.js routing itself blocks the traversal. The test asserts `[403, 404]` covers both behaviors as documented in the plan.

## Phase 8 Hand-off Note

Plan 08-02 will wire the `<video>` element into EpisodeDetail. It should create a pure helper `episodeUrlFor(row)` mirroring `thumbUrlFor` from Phase 7:

```typescript
// Suggested: web/src/lib/ui/episodeUrl.ts
export function episodeUrlFor(row: Pick<EpisodeIndex, 'kid' | 'gameFolder'>): string {
  return `/api/asset/${encodeURIComponent(row.kid)}/${encodeURIComponent(row.gameFolder)}/episode.mp4`;
}
```

The route is live at `GET /api/asset/[kid]/[game]/episode.mp4` with `Accept-Ranges: bytes` advertised, so the browser `<video>` element will automatically use Range requests for seeking without any additional server work.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| rangeParser.ts exists | FOUND |
| rangeParser.test.ts exists | FOUND |
| episode.mp4/route.ts exists | FOUND |
| episode-asset.integration.test.ts exists | FOUND |
| SUMMARY.md exists | FOUND |
| Commit 235e21a (RED rangeParser) | FOUND |
| Commit 483055a (GREEN rangeParser) | FOUND |
| Commit fb2b8df (RED route + integration) | FOUND |
| Commit 277210d (GREEN route) | FOUND |
| assertSafeAssetPath import count >= 1 | 3 (PASS) |
| function assertSafeAssetPath redef = 0 | 0 (PASS) |
| node:* imports in rangeParser = 0 | 0 (PASS) |
