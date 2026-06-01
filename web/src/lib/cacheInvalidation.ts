/**
 * cacheInvalidation — lightweight invalidation predicates for the sqlite cache.
 *
 * Implements D-19 (LOCKED): the invalidation hot-path runs on every chokidar event.
 * `peekManifestHashFromFile` uses a regex over manifest.json bytes — NOT JSON.parse.
 * The canonical `"manifestHash": "sha256:<64hex>"` shape Phase 1 emits is byte-stable
 * (the JSON serializer always produces double-quoted keys; hex chars are always lowercase).
 * A regex over 4kB of text is ~30x faster than JSON.parse + zod safeParse.
 *
 * Pessimistic default: null peek result (file absent, unreadable, or no regex match)
 * → treat as stale → triggers a full re-scan. This is always safe — a false positive
 * stale result causes a redundant scan, not incorrect data.
 *
 * TRACKED_FILES is sourced from scanner.ts exported constants — no duplication of
 * the canonical filenames.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  GOLAZO_DOT_DIR,
  MANIFEST_FILE_NAME,
  EPISODE_FILE_NAME,
  THUMB_FILE_NAME,
  PUBLISH_FILE_NAME,
} from './scanner';
import type { EpisodeIndex } from './episodeIndex';

// ---------------------------------------------------------------------------
// Tracked files
// ---------------------------------------------------------------------------

/**
 * Relative paths (from game folder root) of files that signal state changes.
 * Any modification to these files should trigger a cache invalidation.
 *
 * Sourced from scanner.ts constants — single source of truth for filenames.
 */
export const TRACKED_FILES: readonly string[] = [
  join(GOLAZO_DOT_DIR, MANIFEST_FILE_NAME),
  join(GOLAZO_DOT_DIR, EPISODE_FILE_NAME),
  join(GOLAZO_DOT_DIR, THUMB_FILE_NAME),
  join(GOLAZO_DOT_DIR, PUBLISH_FILE_NAME),
] as const;

// ---------------------------------------------------------------------------
// peekManifestHashFromFile
// ---------------------------------------------------------------------------

/**
 * Regex for extracting `manifestHash` from manifest.json without JSON.parse.
 * Matches the canonical format emitted by Plan 01's `computeManifestHash`:
 *   "manifestHash" : "sha256:<64 lowercase hex chars>"
 *
 * Allows optional whitespace around the colon. Does NOT match uppercase hex
 * (sha256 digests are always lowercase in this project — see prepare/manifest.ts).
 */
const MANIFEST_HASH_REGEX = /"manifestHash"\s*:\s*"(sha256:[0-9a-f]{64})"/;

/**
 * Extract the `manifestHash` value from `<absFolderPath>/.golazo/manifest.json`
 * using a regex over the raw file bytes — no JSON.parse.
 *
 * Returns the captured `sha256:<64hex>` string on success.
 * Returns `null` on:
 * - File does not exist
 * - File is not readable (IO error)
 * - File content does not match the regex (malformed or no manifestHash key)
 */
export function peekManifestHashFromFile(absFolderPath: string): string | null {
  const file = join(absFolderPath, GOLAZO_DOT_DIR, MANIFEST_FILE_NAME);

  if (!existsSync(file)) {
    return null;
  }

  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }

  const m = MANIFEST_HASH_REGEX.exec(text);
  return m?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// trackedFileMtimes
// ---------------------------------------------------------------------------

/**
 * Return the last-modified time (ms since epoch) for each tracked file under
 * `absFolderPath`. Missing files contribute `mtimeMs: 0` — lower than any valid
 * `scannedAtMs` value, so they will never trigger a stale-by-mtime result.
 */
export function trackedFileMtimes(
  absFolderPath: string,
): { path: string; mtimeMs: number }[] {
  return TRACKED_FILES.map((rel) => {
    const p = join(absFolderPath, rel);
    if (!existsSync(p)) {
      return { path: rel, mtimeMs: 0 };
    }
    try {
      return { path: rel, mtimeMs: statSync(p).mtimeMs };
    } catch {
      return { path: rel, mtimeMs: 0 };
    }
  });
}

// ---------------------------------------------------------------------------
// isRowStale
// ---------------------------------------------------------------------------

/**
 * Determine whether a cached episode row needs to be refreshed from disk.
 *
 * Returns `true` (stale) when:
 * 1. `diskManifestHash` is null — peek failed (pessimistic: assume stale)
 * 2. `diskManifestHash` !== `cachedRow.manifestHash` — hash drift (definitive)
 * 3. Any `trackedMtimes[i].mtimeMs > cachedRow.scannedAtMs` — file modified after scan
 *
 * Returns `false` (fresh) when hash matches AND all tracked mtimes are <= scannedAtMs.
 *
 * Pure function — disk access happens in `peekManifestHashFromFile` and
 * `trackedFileMtimes`; callers compose these helpers themselves so both can be
 * batched or cached at the call site.
 */
export function isRowStale(input: {
  cachedRow: EpisodeIndex;
  diskManifestHash: string | null;
  trackedMtimes: { mtimeMs: number }[];
}): boolean {
  // Null disk hash → pessimistic stale
  if (input.diskManifestHash === null) {
    return true;
  }

  // Hash drift → definitive stale
  if (input.diskManifestHash !== input.cachedRow.manifestHash) {
    return true;
  }

  // Mtime drift → stale if any tracked file was modified after the last scan
  for (const { mtimeMs } of input.trackedMtimes) {
    if (mtimeMs > input.cachedRow.scannedAtMs) {
      return true;
    }
  }

  return false;
}
