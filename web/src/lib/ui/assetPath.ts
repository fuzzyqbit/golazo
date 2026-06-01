/**
 * assetPath.ts — Path-safety helper for asset route handlers.
 *
 * Extracted as a standalone helper so BOTH asset route files share it:
 *   - web/src/app/api/asset/[kid]/[game]/thumb.png/route.ts  (Phase 7)
 *   - web/src/app/api/asset/[kid]/[game]/episode.mp4/route.ts (Phase 8, drop-in)
 *
 * Path safety rules enforced:
 *   1. kid and game must NOT contain '/', '\\', '..', or '\0' — rejects at segment level
 *   2. The resolved candidate path must start with resolved-root + path.sep —
 *      defends against symlink escapes and any absolute-path bypass
 *
 * Any violation throws AssetPathError. Route handlers catch AssetPathError → 403.
 *
 * D-19: Phase 8 imports assertSafeAssetPath from this module. Do NOT inline
 * the logic into route.ts — that would force a refactor when Phase 8 lands.
 */

import { resolve, relative, isAbsolute, sep } from 'node:path';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Thrown by assertSafeAssetPath when a path-safety rule is violated.
 * Route handlers map this to HTTP 403.
 */
export class AssetPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetPathError';
  }
}

// ---------------------------------------------------------------------------
// Unsafe segment patterns
// ---------------------------------------------------------------------------

/** Characters / sequences that are never valid in a kid or game segment. */
const UNSAFE_PATTERNS = [
  '..',      // directory traversal
  '/',       // forward slash (path separator)
  '\\',      // backslash (Windows path separator)
  '\0',      // null byte (filesystem escape)
];

function isUnsafeSegment(segment: string): boolean {
  // Absolute path attempt (e.g. kid = '/etc/passwd')
  if (isAbsolute(segment)) return true;
  // Contains any unsafe pattern
  return UNSAFE_PATTERNS.some((p) => segment.includes(p));
}

// ---------------------------------------------------------------------------
// assertSafeAssetPath
// ---------------------------------------------------------------------------

/**
 * Validate and build the absolute path to an asset file inside the golazo root.
 *
 * @param rootPath  Absolute path to the golazo storage root (from resolveGolazoRoot).
 * @param kid       Kid segment from the URL (e.g. 'leo').
 * @param game      Game segment from the URL (e.g. '2026-05-20_vs_rivers_2-2').
 * @param fileName  File name within the .golazo directory (e.g. 'thumb.png').
 * @returns         Absolute path string: `<rootPath>/<kid>/<game>/.golazo/<fileName>`.
 *
 * @throws {AssetPathError} When any path-safety rule is violated.
 */
export function assertSafeAssetPath(
  rootPath: string,
  kid: string,
  game: string,
  fileName: string,
): string {
  // Rule 1: segment-level validation
  if (isUnsafeSegment(kid)) {
    throw new AssetPathError(
      `Unsafe or invalid kid segment: "${kid}". Forbidden characters: ${UNSAFE_PATTERNS.join(', ')} or absolute path.`,
    );
  }
  if (isUnsafeSegment(game)) {
    throw new AssetPathError(
      `Unsafe or invalid game segment: "${game}". Forbidden characters: ${UNSAFE_PATTERNS.join(', ')} or absolute path.`,
    );
  }

  // Rule 2: resolved-path containment check (defends against symlink escape + path.join trickery)
  const resolvedRoot = resolve(rootPath);
  const candidate = resolve(rootPath, kid, game, '.golazo', fileName);

  // relative() from resolvedRoot to candidate must NOT start with '..'
  // and must NOT be an absolute path (isAbsolute catches edge cases)
  const rel = relative(resolvedRoot, candidate);
  if (isAbsolute(rel) || rel.startsWith('..')) {
    throw new AssetPathError(
      `Resolved path escapes root. root="${resolvedRoot}", candidate="${candidate}"`,
    );
  }

  // Ensure the candidate is strictly INSIDE the root (not equal to root itself)
  if (!candidate.startsWith(resolvedRoot + sep)) {
    throw new AssetPathError(
      `Resolved path is not inside root. root="${resolvedRoot}", candidate="${candidate}"`,
    );
  }

  return candidate;
}
