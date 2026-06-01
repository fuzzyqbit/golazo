/**
 * manifestRead.ts — reads and validates .golazo/manifest.json for a single episode row.
 *
 * Used by the detail view (page.tsx at /episodes/[manifestHash]) to hydrate the
 * on-disk manifest for rendering. Mirrors the scanner's read pattern exactly but
 * scoped to one row on demand (per-request, not on boot).
 *
 * Schema is imported from @golazo/cli/dist/prepare/manifest.js — NOT redeclared here.
 * Path constants imported from scanner.ts for consistency.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { manifestSchema } from '@golazo/cli/dist/prepare/manifest.js';
import type { z } from 'zod';

import type { EpisodeIndex } from '../episodeIndex';
import { GOLAZO_DOT_DIR, MANIFEST_FILE_NAME } from '../scanner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Inferred type from the manifest schema. */
export type Manifest = z.infer<typeof manifestSchema>;

// ---------------------------------------------------------------------------
// ManifestReadError
// ---------------------------------------------------------------------------

/**
 * Thrown by readManifestFromRow when the manifest file is missing, unreadable,
 * unparseable as JSON, or fails schema validation. The dynamic route at
 * /episodes/[manifestHash] catches this and calls notFound() — the row exists
 * in the cache but the on-disk file is gone or corrupt.
 */
export class ManifestReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestReadError';
  }
}

// ---------------------------------------------------------------------------
// readManifestFromRow
// ---------------------------------------------------------------------------

/**
 * Read and zod-validate the manifest.json for a cached episode row.
 *
 * Constructs the path as `row.absFolderPath / .golazo / manifest.json`.
 * Throws ManifestReadError on:
 *   - File does not exist
 *   - readFileSync fails (e.g. permissions)
 *   - JSON.parse fails
 *   - manifestSchema.safeParse fails
 *
 * No I/O side effects — purely reads.
 */
export function readManifestFromRow(row: EpisodeIndex): Manifest {
  const manifestPath = join(row.absFolderPath, GOLAZO_DOT_DIR, MANIFEST_FILE_NAME);

  if (!existsSync(manifestPath)) {
    throw new ManifestReadError(
      `manifest.json not found at '${manifestPath}' (row: ${row.manifestHash})`,
    );
  }

  let rawJson: string;
  try {
    rawJson = readFileSync(manifestPath, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ManifestReadError(
      `failed to read manifest.json at '${manifestPath}': ${reason}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ManifestReadError(
      `manifest.json JSON parse error at '${manifestPath}': ${reason}`,
    );
  }

  const result = manifestSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path =
      issue && issue.path.length > 0
        ? issue.path.map((segment) => String(segment)).join('.')
        : '(root)';
    const reason = issue ? `${path}: ${issue.message}` : 'schema validation failed';
    throw new ManifestReadError(
      `manifest.json schema validation failed at '${manifestPath}': ${reason}`,
    );
  }

  return result.data;
}
