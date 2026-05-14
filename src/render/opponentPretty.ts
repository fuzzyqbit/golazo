/**
 * Pretty-print a game-folder opponent slug into a display name.
 *
 * Algorithm:
 *   1. Lowercase the whole input.
 *   2. Split on hyphens.
 *   3. For each part:
 *      - If ACRONYM_ALLOW_LIST contains it (case-insensitive) → upper-case it.
 *      - Otherwise → title-case: first letter upper, rest lower.
 *   4. Join with spaces.
 *
 * Examples:
 *   'united'         → 'United'
 *   'city-sc'        → 'City SC'
 *   'ac-milan'       → 'AC Milan'
 *   'real-madrid-cf' → 'Real Madrid Cf'  (cf not in allow-list)
 *   'FC-Barcelona'   → 'FC Barcelona'    (normalised to lower before lookup)
 *
 * Phase 3 (PUB-03) may move this helper to src/shared/ — import in
 * src/render/driver.ts; Phase 3 updates that import without changing logic.
 */

/** Lower-cased parts that are rendered in ALL CAPS. Keep the list small. */
export const ACRONYM_ALLOW_LIST = new Set(['sc', 'fc', 'ac']);

/**
 * Convert a hyphen-separated opponent slug to a human-readable name.
 *
 * @param slug  Folder-name slug (e.g. `'city-sc'` from `_vs_city-sc_`).
 * @returns     Display name (e.g. `'City SC'`), empty string for empty input.
 */
export function prettyOpponent(slug: string): string {
  if (slug === '') return '';

  const parts = slug.toLowerCase().split('-');
  const formatted = parts.map((part) => {
    if (ACRONYM_ALLOW_LIST.has(part)) {
      return part.toUpperCase();
    }
    // Title-case: first letter upper, rest lower (lower() already applied above)
    if (part.length === 0) return '';
    return part.charAt(0).toUpperCase() + part.slice(1);
  });

  return formatted.join(' ');
}
