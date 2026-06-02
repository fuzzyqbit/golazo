/**
 * episodeUrl.ts — Single source of truth for the episode asset URL template.
 *
 * Pure function: no I/O, no network, no imports from next/* or node:*.
 * Both EpisodeDetail (server-rendered) and any future client-side logic
 * import from here — one template to update, not two.
 *
 * URL pattern: /api/asset/<kid>/<gameFolder>/episode.mp4
 * Both segments are encoded via encodeURIComponent so unusual characters
 * in slugs (spaces, special chars from future datasets) don't break the URL.
 *
 * Phase 8 reuse: the route lives at
 *   web/src/app/api/asset/[kid]/[game]/episode.mp4/route.ts
 * This URL maps exactly to that dynamic segment structure (Plan 08-01).
 *
 * SINGLE SOURCE OF TRUTH: this is the ONLY place the episode.mp4 URL template
 * lives — never hard-code the pattern elsewhere (mirrors thumbUrlFor).
 */

import type { EpisodeIndex } from '../episodeIndex.js';

/**
 * Build the episode asset URL for a given episode row.
 *
 * @param row - Must have `kid` and `gameFolder` fields (subset of EpisodeIndex).
 * @returns   Absolute path URL string, e.g. '/api/asset/leo/2026-05-20_vs_rivers_2-2/episode.mp4'
 */
export function episodeUrlFor(row: Pick<EpisodeIndex, 'kid' | 'gameFolder'>): string {
  return `/api/asset/${encodeURIComponent(row.kid)}/${encodeURIComponent(row.gameFolder)}/episode.mp4`;
}
