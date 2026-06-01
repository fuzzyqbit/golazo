/**
 * publishRead.ts — reads and validates .golazo/publish.json for a single episode row.
 *
 * Used by the detail view (page.tsx at /episodes/[manifestHash]) to surface
 * publish status. Returns null on any failure (missing file, parse error, schema
 * error) — publish.json is optional state; absence must never crash the UI.
 *
 * Schema is imported from @golazo/cli/dist/publish/publishRecord.js — NOT redeclared.
 * Path constants imported from scanner.ts for consistency.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { publishRecordSchema } from '@golazo/cli/dist/publish/publishRecord.js';
import type { PublishRecordDoc } from '@golazo/cli/dist/publish/publishRecord.js';

import type { EpisodeIndex } from '../episodeIndex';
import { GOLAZO_DOT_DIR, PUBLISH_FILE_NAME } from '../scanner';

// Re-export for convenience
export type { PublishRecordDoc };

// ---------------------------------------------------------------------------
// readPublishFromRow
// ---------------------------------------------------------------------------

/**
 * Read and zod-validate publish.json for a cached episode row.
 *
 * Constructs the path as `row.absFolderPath / .golazo / publish.json`.
 * Returns null on ALL failure modes (missing, parse error, schema error).
 * Logs to console.error for observability before returning null.
 *
 * NEVER throws — callers depend on null meaning "not published yet".
 */
export function readPublishFromRow(row: EpisodeIndex): PublishRecordDoc | null {
  const publishPath = join(row.absFolderPath, GOLAZO_DOT_DIR, PUBLISH_FILE_NAME);

  if (!existsSync(publishPath)) {
    return null;
  }

  let rawJson: string;
  try {
    rawJson = readFileSync(publishPath, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[publishRead] failed to read publish.json at '${publishPath}': ${reason}`);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[publishRead] publish.json JSON parse error at '${publishPath}': ${reason}`);
    return null;
  }

  const result = publishRecordSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path =
      issue && issue.path.length > 0
        ? issue.path.map((segment) => String(segment)).join('.')
        : '(root)';
    const reason = issue ? `${path}: ${issue.message}` : 'schema validation failed';
    console.error(
      `[publishRead] publish.json schema validation failed at '${publishPath}': ${reason}`,
    );
    return null;
  }

  return result.data;
}
