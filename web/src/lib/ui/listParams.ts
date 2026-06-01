/**
 * listParams.ts — URL state parsing and serialization for the browse surface.
 *
 * Pure module: no imports from next/*, react, or node:*.
 * Safe to call from Server Components on every request — MUST NOT throw on
 * operator-typed nonsense in the URL bar.
 *
 * URL contract (UI-01, UI-03):
 *   ?sort=<key>.<dir>&kid=<filter>
 *   Defaults (date.desc + all) are omitted from the serialized URL.
 *   Key order in serialization is deterministic: sort before kid.
 */

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** Valid sort keys for the episode list. */
export type SortKey = 'date' | 'opponent' | 'result' | 'kid';

/** Sort direction. */
export type SortDir = 'asc' | 'desc';

/** Kid filter — 'all' is the identity filter. */
export type KidFilter = 'all' | 'leo' | 'mateo';

/** Parsed URL state for the episode list. */
export interface ListParams {
  sort: { key: SortKey; dir: SortDir };
  kid: KidFilter;
}

// ---------------------------------------------------------------------------
// Runtime validation sets
// ---------------------------------------------------------------------------

/** All valid sort key values — used for runtime validation of URL input. */
export const SORT_KEYS: readonly SortKey[] = ['date', 'opponent', 'result', 'kid'] as const;

/** All valid kid filter values — used for runtime validation of URL input. */
export const KID_FILTERS: readonly KidFilter[] = ['all', 'leo', 'mateo'] as const;

// ---------------------------------------------------------------------------
// Default
// ---------------------------------------------------------------------------

/** Default list params — sort date.desc, no kid filter. Serializes to ''. */
export const DEFAULT_LIST_PARAMS: ListParams = {
  sort: { key: 'date', dir: 'desc' },
  kid: 'all',
} as const;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

function isSortDir(value: string): value is SortDir {
  return value === 'asc' || value === 'desc';
}

function isKidFilter(value: string): value is KidFilter {
  return (KID_FILTERS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parse Next.js searchParams into a typed ListParams.
 *
 * Accepts the Next.js searchParams shape where values may be:
 *   - string (normal)
 *   - string[] (repeated key)
 *   - undefined (key absent)
 *
 * Unknown / malformed values fall back to defaults silently — never throws.
 */
export function parseListParams(
  input: Record<string, string | string[] | undefined>,
): ListParams {
  const sortRaw = input['sort'];
  const kidRaw = input['kid'];

  // Parse sort — must be a string (not array) with exactly one dot
  let sortKey: SortKey = DEFAULT_LIST_PARAMS.sort.key;
  let sortDir: SortDir = DEFAULT_LIST_PARAMS.sort.dir;

  if (typeof sortRaw === 'string') {
    const dotIdx = sortRaw.indexOf('.');
    if (dotIdx !== -1 && dotIdx === sortRaw.lastIndexOf('.')) {
      const keyCandidate = sortRaw.slice(0, dotIdx);
      const dirCandidate = sortRaw.slice(dotIdx + 1);
      if (isSortKey(keyCandidate) && isSortDir(dirCandidate)) {
        sortKey = keyCandidate;
        sortDir = dirCandidate;
      }
    }
  }
  // Array value (repeated key) or undefined → fall back to defaults (no action needed)

  // Parse kid
  let kid: KidFilter = DEFAULT_LIST_PARAMS.kid;
  if (typeof kidRaw === 'string' && isKidFilter(kidRaw)) {
    kid = kidRaw;
  }

  return { sort: { key: sortKey, dir: sortDir }, kid };
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/**
 * Serialize ListParams into a URLSearchParams-compatible string.
 *
 * Omits default values so the canonical URL is clean.
 * Key order is deterministic: sort before kid.
 */
export function serializeListParams(params: ListParams): string {
  const parts: string[] = [];

  const { sort, kid } = params;
  const isDefaultSort =
    sort.key === DEFAULT_LIST_PARAMS.sort.key &&
    sort.dir === DEFAULT_LIST_PARAMS.sort.dir;

  if (!isDefaultSort) {
    parts.push(`sort=${sort.key}.${sort.dir}`);
  }

  if (kid !== DEFAULT_LIST_PARAMS.kid) {
    parts.push(`kid=${kid}`);
  }

  return parts.join('&');
}
