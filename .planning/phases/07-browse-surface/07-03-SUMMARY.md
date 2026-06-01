---
phase: "07"
plan: "03"
subsystem: web/ui
tags:
  - phase-07
  - browse-surface
  - list-view
  - server-component
  - client-component
  - css-modules
  - integration-test
  - thumb-stub
  - path-safety

dependency_graph:
  requires:
    - "07-01: listParams (parseListParams, serializeListParams, SORT_KEYS, KID_FILTERS)"
    - "07-01: listOps (applyListParams, filterByKid, sortEpisodes)"
    - "07-02: channelAccents (getChannelAccents, accentFor, ChannelAccentMap)"
    - "06-04: discoveryRuntime (getDiscoveryRuntime, resolveGolazoRoot, queryAllEpisodes)"
  provides:
    - "web/src/lib/ui/thumbUrl.ts (thumbUrlFor — Phase 8 reuses for episode.mp4 URL)"
    - "web/src/lib/ui/assetPath.ts (assertSafeAssetPath — Phase 8 drop-in extension)"
    - "web/src/app/api/asset/[kid]/[game]/thumb.png/route.ts (path-safe thumb serving)"
    - "web/src/components/EmptyState.tsx (UI-04 root path display)"
    - "web/src/components/EpisodeRow.tsx (full row rendering contract)"
    - "web/src/components/EpisodeList.tsx ('use client' — URL-driven interactivity)"
    - "web/src/app/page.tsx (async Server Component — list view entry point)"
  affects:
    - "07-04: detail view (uses /episodes/[manifestHash] links from EpisodeRow)"
    - "Phase 8: asset serving (extends [kid]/[game]/ directory; imports assertSafeAssetPath)"

tech_stack:
  added: []
  patterns:
    - "Server Component (async page.tsx) → Client Component (EpisodeList) boundary via typed props"
    - "assertSafeAssetPath extracted for reuse — avoids Phase 8 refactor"
    - "accentFor inlined in EpisodeList (client-safe) to avoid node:fs transitive import across 'use client' boundary"
    - "CSS Modules with hand-mirrored hex values (cannot import TS tokens in .module.css)"
    - "TDD pattern: RED test commit → GREEN implementation commit for Unit + Integration"

key_files:
  created:
    - web/src/lib/ui/thumbUrl.ts
    - web/src/lib/ui/thumbUrl.test.ts
    - web/src/lib/ui/assetPath.ts
    - web/src/lib/ui/assetPath.test.ts
    - web/src/app/api/asset/[kid]/[game]/thumb.png/route.ts
    - web/src/components/EmptyState.tsx
    - web/src/components/EmptyState.module.css
    - web/src/components/EpisodeRow.tsx
    - web/src/components/EpisodeRow.module.css
    - web/src/components/EpisodeList.tsx
    - web/src/components/EpisodeList.module.css
    - web/tests/list-view.integration.test.ts
  modified:
    - web/src/app/page.tsx  (replaced Phase 5 placeholder entirely)
    - web/src/app/page.module.css  (replaced Phase 5 placeholder styles)

decisions:
  - "accentFor inlined as accentForClient in EpisodeList to avoid node:fs transitive import across 'use client' boundary — channelAccents.ts imports node:fs indirectly via @golazo/cli dist"
  - "Typographic placeholder used for 'prepared' status rows (per row_rendering_contract) — CSS-styled div with opponent initial char"
  - "U+2013 EN DASH in score field — string literal '–' rather than \\u2013 escape (same readability, same code point)"
  - "Empty GOLAZO_ROOT integration test uses port 4176 to avoid conflict with port 4175 (main fixture suite)"
  - "EpisodeList is the ONLY 'use client' component in Phase 7 Plan 03 — confirmed"

metrics:
  duration: "~8 min 32 s"
  completed: "2026-06-01T21:19:55Z"
  tasks_completed: 3
  files_changed: 14
---

# Phase 07 Plan 03: List View Summary

**Episode list view at `/` — Server Component fetches + filters, Client Component owns sort/filter URL interactivity, path-safe thumb stub ready for Phase 8 extension.**

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| T1 RED | thumbUrl + assetPath tests | b132720 | thumbUrl.test.ts, assetPath.test.ts |
| T1 GREEN | thumbUrl + assetPath + thumb route + EmptyState | 6e2308a | thumbUrl.ts, assetPath.ts, route.ts, EmptyState.tsx/.css |
| T2 | EpisodeRow + EpisodeList + page.tsx | 4d12d7f | EpisodeRow.tsx/.css, EpisodeList.tsx/.css, page.tsx, page.module.css |
| T3 RED | list-view integration tests | 4d667d1 | list-view.integration.test.ts |
| T3 GREEN | integration tests pass | 44ac2aa | next-env.d.ts (metadata) |

## page.tsx Server Component (excerpt)

```typescript
export default async function HomePage({ searchParams }: HomePageProps): Promise<React.JSX.Element> {
  const sp = await searchParams;                          // Next.js 16 Promise-typed
  const params = parseListParams(sp);                     // unknown values → defaults
  const runtime = await getDiscoveryRuntime();            // lazy singleton
  const accents = await getChannelAccents();              // channels.yaml
  const allRows = queryAllEpisodes(runtime.cache);        // sqlite query
  const rows = applyListParams(params, allRows);          // sort + filter

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>golazo</h1>
      {allRows.length === 0 ? (
        <EmptyState rootPath={runtime.rootPath} />
      ) : (
        <EpisodeList rows={rows} accents={accents} params={params} totalCount={allRows.length} />
      )}
    </main>
  );
}
```

## EpisodeRow.module.css Class Names

Full list of CSS Module class names for downstream snapshot/style guide reference:

| Class | Purpose |
|-------|---------|
| `.row` | Grid wrapper (6 columns) + Link reset; hover border-color transition |
| `.thumbWrapper` | 160px × 9/16 aspect-ratio container |
| `.thumb` | `<img loading="lazy">` inside thumb wrapper |
| `.placeholder` | Typographic placeholder div for `prepared` status rows |
| `.kidChip` | Kid name chip with letter-spacing 0.16em; accent via inline style |
| `.opponent` | display font (Cormorant Garamond Italic) |
| `.date` | label font, muted color |
| `.score` | label font bold, foreground; U+2013 EN DASH in content |
| `.status_prepared` | Muted pill |
| `.status_rendered` | Foreground pill |
| `.status_published` | accentDefault (#ffce5a) pill |

## 'use client' Boundary Confirmation

**EpisodeList.tsx is the ONLY 'use client' component in Phase 7 Plan 03.**

- `web/src/app/page.tsx` — no directive (Server Component)
- `web/src/components/EpisodeRow.tsx` — no directive (Server Component)
- `web/src/components/EmptyState.tsx` — no directive (Server Component)
- `web/src/components/EpisodeList.tsx` — `'use client'` at line 1 ✓

## assetPath.ts Path-Safety Logic (for Phase 8)

```typescript
export class AssetPathError extends Error { ... }

const UNSAFE_PATTERNS = ['..', '/', '\\', '\0'];

export function assertSafeAssetPath(
  rootPath: string, kid: string, game: string, fileName: string,
): string {
  // Rule 1: segment-level validation (absolute path + unsafe chars)
  if (isUnsafeSegment(kid)) throw new AssetPathError(`Unsafe kid: "${kid}"`);
  if (isUnsafeSegment(game)) throw new AssetPathError(`Unsafe game: "${game}"`);

  // Rule 2: resolved-path containment check (symlink escape defense)
  const resolvedRoot = resolve(rootPath);
  const candidate = resolve(rootPath, kid, game, '.golazo', fileName);
  const rel = relative(resolvedRoot, candidate);
  if (isAbsolute(rel) || rel.startsWith('..')) throw new AssetPathError(...);
  if (!candidate.startsWith(resolvedRoot + sep)) throw new AssetPathError(...);

  return candidate;  // absolute path to: <root>/<kid>/<game>/.golazo/<file>
}
```

Phase 8 imports: `import { assertSafeAssetPath, AssetPathError } from '@/lib/ui/assetPath';`

## Test Counts

| Suite | File | Tests |
|-------|------|-------|
| Unit | thumbUrl.test.ts | 7 |
| Unit | assetPath.test.ts | 11 |
| Integration | list-view.integration.test.ts | 9 (2 suites) |
| **Total added** | | **27** |

Full web suite (skip-flagged): **167 tests pass, 12 skipped**.
Root suite: **403 tests unchanged**.

## Typographic Placeholder Decision

YES — typographic placeholder implemented for `prepared`-status rows (per row_rendering_contract). When `row.status === 'prepared'`, EpisodeRow renders a CSS-styled `<div className={styles.placeholder}>` containing the uppercase first character of `row.opponent` instead of a `<img>`. This gives visual feedback that a thumb exists in the plan but hasn't been rendered yet.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Client boundary node:fs transitive import**

- **Found during:** Task 2 — `npx next build` failed with "the chunking context (unknown) does not support external modules (request: node:fs)"
- **Issue:** `EpisodeList.tsx` (`'use client'`) imported `accentFor` from `channelAccents.ts`, which transitively imports `node:fs` via `@golazo/cli` dist. Node.js modules cannot be bundled into client chunks.
- **Fix:** Inlined a client-safe `accentForClient` function directly in `EpisodeList.tsx` (pure lookup: `map[kidKey] ?? ACCENT_DEFAULT` with literal hex). The server-side `accentFor` in `channelAccents.ts` remains unchanged for `page.tsx` use.
- **Files modified:** `web/src/components/EpisodeList.tsx`
- **Commit:** 4d12d7f (fixed in same commit as implementation)

## Known Stubs

None — thumbUrlFor returns real URLs, thumb route serves real bytes from fixture, EpisodeList receives real rows from the sqlite cache.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: path_traversal | web/src/app/api/asset/[kid]/[game]/thumb.png/route.ts | New network endpoint serving filesystem bytes; path-safety enforced via assertSafeAssetPath (D-19 mitigated) |

## Self-Check: PASSED

- [x] web/src/lib/ui/thumbUrl.ts exists
- [x] web/src/lib/ui/thumbUrl.test.ts exists (7 tests)
- [x] web/src/lib/ui/assetPath.ts exists
- [x] web/src/lib/ui/assetPath.test.ts exists (11 tests)
- [x] web/src/app/api/asset/[kid]/[game]/thumb.png/route.ts exists
- [x] web/src/components/EmptyState.tsx exists
- [x] web/src/components/EpisodeRow.tsx exists
- [x] web/src/components/EpisodeList.tsx exists (line 1: 'use client')
- [x] web/src/app/page.tsx is async Server Component (no 'use client')
- [x] web/tests/list-view.integration.test.ts exists (9 cases, all pass)
- [x] Commit b132720 (RED thumbUrl/assetPath tests) — FOUND
- [x] Commit 6e2308a (GREEN implementation) — FOUND
- [x] Commit 4d12d7f (Task 2 components + page) — FOUND
- [x] Commit 4d667d1 (RED integration tests) — FOUND
- [x] 18 unit tests pass (web/src/lib/ui/)
- [x] 9 integration tests pass (web/tests/list-view.integration.test.ts)
- [x] 403 root tests unchanged
- [x] npx tsc --noEmit exits 0
- [x] npx next build exits 0
- [x] assertSafeAssetPath exported from assetPath.ts for Phase 8 reuse
