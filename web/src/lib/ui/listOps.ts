/**
 * listOps.ts — Pure sort/filter operations over EpisodeIndex[].
 *
 * No imports from next/*, react, node:*, or @golazo/cli/*.
 * Every function is pure: same input → same output, no I/O, no Date.now().
 *
 * Sort tie-breaker contract (pinned by Phase 6 Plan 01 test case 9 + cache.ts
 * QUERY_ALL_SQL): kid ASC → date DESC → gameFolder ASC.
 *
 * Result sort ordering: W → D → L is "best-first" for ascending;
 * reversed for descending. RESULT_RANK pins the explicit mapping.
 */

import type { EpisodeIndex } from '../episodeIndex.js';
import type { KidFilter, ListParams } from './listParams.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Explicit result rank for sort ordering.
 * Ascending = best-first (W < D < L).
 * No magic numbers — named constant throughout.
 */
export const RESULT_RANK: Record<'W' | 'D' | 'L', number> = {
  W: 0,
  D: 1,
  L: 2,
} as const;

// ---------------------------------------------------------------------------
// Tie-breaker
// ---------------------------------------------------------------------------

/**
 * Canonical scanner tie-breaker: kid ASC → date DESC → gameFolder ASC.
 * Applied when two rows are equal on the primary sort key.
 */
function tieBreaker(a: EpisodeIndex, b: EpisodeIndex): number {
  const kidCmp = a.kid.localeCompare(b.kid);
  if (kidCmp !== 0) return kidCmp;

  // date DESC — note reversed order (b before a)
  const dateCmp = b.date.localeCompare(a.date);
  if (dateCmp !== 0) return dateCmp;

  return a.gameFolder.localeCompare(b.gameFolder);
}

// ---------------------------------------------------------------------------
// filterByKid
// ---------------------------------------------------------------------------

/**
 * Filter episode rows by kid.
 *
 * 'all' is the identity — returns rows as-is (content-equivalent).
 * Any other value filters to rows where row.kid === kid.
 * Never mutates the input array.
 */
export function filterByKid(kid: KidFilter, rows: EpisodeIndex[]): EpisodeIndex[] {
  if (kid === 'all') return rows;
  return rows.filter((r) => r.kid === kid);
}

// ---------------------------------------------------------------------------
// sortEpisodes
// ---------------------------------------------------------------------------

/**
 * Sort episode rows by the given sort key and direction.
 *
 * Returns a NEW array — input is never mutated (immutability gate).
 * Ties fall back to the canonical scanner order: kid ASC → date DESC → gameFolder ASC.
 */
export function sortEpisodes(
  rows: EpisodeIndex[],
  sort: ListParams['sort'],
): EpisodeIndex[] {
  const DIR = sort.dir === 'desc' ? -1 : 1;

  return [...rows].sort((a, b) => {
    let primary = 0;

    switch (sort.key) {
      case 'date':
        primary = a.date.localeCompare(b.date) * DIR;
        break;
      case 'opponent':
        primary = a.opponent.localeCompare(b.opponent) * DIR;
        break;
      case 'result':
        primary = (RESULT_RANK[a.result] - RESULT_RANK[b.result]) * DIR;
        break;
      case 'kid':
        primary = a.kid.localeCompare(b.kid) * DIR;
        break;
    }

    if (primary !== 0) return primary;
    return tieBreaker(a, b);
  });
}

// ---------------------------------------------------------------------------
// applyListParams
// ---------------------------------------------------------------------------

/**
 * Apply list params (filter then sort) to an episode array.
 *
 * Equivalent to: sortEpisodes(filterByKid(params.kid, rows), params.sort)
 */
export function applyListParams(
  params: ListParams,
  rows: EpisodeIndex[],
): EpisodeIndex[] {
  return sortEpisodes(filterByKid(params.kid, rows), params.sort);
}
