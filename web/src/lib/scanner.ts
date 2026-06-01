/**
 * scanGolazoRoot — pure synchronous filesystem scanner for the golazo storage root.
 *
 * Implements DISC-01 (typed EpisodeIndex per game folder), DISC-02 (status derived
 * from disk, recomputed each scan, never cached), and DISC-05 (folders whose basename
 * fails parseFilename surface in WarningBag.brokenFolders, never silently skipped).
 *
 * **Synchronous by design:** Plan 02's sqlite cache + Plan 04's startup wiring run
 * this scanner once on app boot, then again only on watcher events (Plan 03). There
 * are no concurrent scans, so async I/O buys nothing — sync fs calls keep the
 * call graph simple and the error paths straightforward.
 *
 * **No duplication:** This module imports manifestSchema, parseFilename, and
 * publishRecordSchema verbatim from @golazo/cli/dist/... via the npm workspace
 * symlink set up in Plan 05-01 (D-08 idiom). No schema copying.
 *
 * Walk depth: exactly two levels (kid/ then game/). Deeper subdirs are ignored.
 * Folders without .golazo/manifest.json are silently skipped (expected pre-prepare
 * state — not a warning). Folders whose name fails parseFilename are WarningBag entries.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

import { parseFilename } from '@golazo/cli/dist/prepare/filename.js';
import { manifestSchema } from '@golazo/cli/dist/prepare/manifest.js';
import { publishRecordSchema } from '@golazo/cli/dist/publish/publishRecord.js';
import type { PublishRecordDoc } from '@golazo/cli/dist/publish/publishRecord.js';

import type { EpisodeIndex, EpisodeStatus, ScanResult } from './episodeIndex';
import { createWarningBag, type WarningBag } from './warningBag';

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/** The hidden subdirectory inside each game folder where golazo artifacts live. */
export const GOLAZO_DOT_DIR = '.golazo';

/** Filename of the manifest inside GOLAZO_DOT_DIR. */
export const MANIFEST_FILE_NAME = 'manifest.json';

/** Filename of the rendered episode video inside GOLAZO_DOT_DIR. */
export const EPISODE_FILE_NAME = 'episode.mp4';

/** Filename of the rendered thumbnail image inside GOLAZO_DOT_DIR. */
export const THUMB_FILE_NAME = 'thumb.png';

/** Filename of the publish record inside GOLAZO_DOT_DIR. */
export const PUBLISH_FILE_NAME = 'publish.json';

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

/**
 * Derive the episode lifecycle status from the presence of artifacts on disk.
 *
 * Status precedence (pinned by Plan 01 test case 8):
 *   'published' = manifest + episode.mp4 + thumb.png + valid publish.json
 *   'rendered'  = manifest + episode.mp4 + thumb.png (no publish.json OR invalid publish.json)
 *   'prepared'  = manifest only
 *
 * Status is NEVER read from any cache — it is recomputed on every scan.
 */
export function deriveStatus(input: {
  hasEpisode: boolean;
  hasThumb: boolean;
  publishRecord: PublishRecordDoc | null;
}): EpisodeStatus {
  if (input.publishRecord !== null && input.hasEpisode && input.hasThumb) {
    return 'published';
  }
  if (input.hasEpisode && input.hasThumb) {
    return 'rendered';
  }
  return 'prepared';
}

// ---------------------------------------------------------------------------
// Single-folder scanner
// ---------------------------------------------------------------------------

/**
 * Attempt to build an EpisodeIndex row from one game folder.
 *
 * Returns null when:
 * - The folder basename fails parseFilename (adds to warnings.brokenFolders)
 * - The manifest file is absent (silent skip — expected pre-prepare state)
 * - The manifest cannot be JSON-parsed (adds to warnings.invalidManifests)
 * - The manifest fails schema validation (adds to warnings.invalidManifests)
 * - The manifest's kid field does not match the path-derived kid (adds to warnings.invalidManifests)
 *
 * Invalid publish.json: adds to warnings.invalidPublishRecords but does NOT return null —
 * the row is still returned with publishRecord=null and status falling back to 'rendered'.
 */
export function scanGameFolder(input: {
  absFolderPath: string;
  kid: string;
  warnings: WarningBag;
  scannedAtMs: number;
}): EpisodeIndex | null {
  const folderName = basename(input.absFolderPath);

  // --- Step 1: parse folder name ---
  let gameMeta: ReturnType<typeof parseFilename>;
  try {
    gameMeta = parseFilename(folderName);
  } catch (err) {
    // FilenameError (or any other value) — accumulate and skip
    const reason = err instanceof Error ? err.message : String(err);
    input.warnings.brokenFolders.push({
      absPath: input.absFolderPath,
      reason,
    });
    return null;
  }

  // --- Step 2: manifest existence check (silent skip if absent) ---
  const manifestPath = join(input.absFolderPath, GOLAZO_DOT_DIR, MANIFEST_FILE_NAME);
  if (!existsSync(manifestPath)) {
    return null; // Pre-prepare state — not a warning
  }

  // --- Step 3: read + validate manifest ---
  let rawJson: string;
  try {
    rawJson = readFileSync(manifestPath, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    input.warnings.invalidManifests.push({
      absPath: input.absFolderPath,
      reason: `failed to read manifest: ${reason}`,
    });
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    input.warnings.invalidManifests.push({
      absPath: input.absFolderPath,
      reason: `manifest JSON parse error: ${reason}`,
    });
    return null;
  }

  const manifestResult = manifestSchema.safeParse(parsed);
  if (!manifestResult.success) {
    const issue = manifestResult.error.issues[0];
    const path =
      issue && issue.path.length > 0
        ? issue.path.map((segment) => String(segment)).join('.')
        : '(root)';
    const reason = issue ? `${path}: ${issue.message}` : 'schema validation failed';
    input.warnings.invalidManifests.push({
      absPath: input.absFolderPath,
      reason,
    });
    return null;
  }
  const manifest = manifestResult.data;

  // --- Step 4: kid consistency check (path-derived vs manifest body) ---
  if (manifest.kid !== input.kid) {
    input.warnings.invalidManifests.push({
      absPath: input.absFolderPath,
      reason: `manifest kid '${manifest.kid}' does not match path-derived kid '${input.kid}'`,
    });
    return null;
  }

  // --- Step 5: probe filesystem for episode, thumb, publish ---
  const episodePath = join(input.absFolderPath, GOLAZO_DOT_DIR, EPISODE_FILE_NAME);
  const thumbPath = join(input.absFolderPath, GOLAZO_DOT_DIR, THUMB_FILE_NAME);
  const publishPath = join(input.absFolderPath, GOLAZO_DOT_DIR, PUBLISH_FILE_NAME);

  const hasEpisode = existsSync(episodePath);
  const hasThumb = existsSync(thumbPath);

  let publishRecord: PublishRecordDoc | null = null;
  if (existsSync(publishPath)) {
    let rawPublish: unknown;
    try {
      rawPublish = JSON.parse(readFileSync(publishPath, 'utf8'));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      input.warnings.invalidPublishRecords.push({
        absPath: input.absFolderPath,
        reason: `publish.json JSON parse error: ${reason}`,
      });
      rawPublish = null;
    }

    if (rawPublish !== null) {
      const publishResult = publishRecordSchema.safeParse(rawPublish);
      if (!publishResult.success) {
        const issue = publishResult.error.issues[0];
        const path =
          issue && issue.path.length > 0
            ? issue.path.map((segment) => String(segment)).join('.')
            : '(root)';
        const reason = issue ? `${path}: ${issue.message}` : 'schema validation failed';
        input.warnings.invalidPublishRecords.push({
          absPath: input.absFolderPath,
          reason,
        });
        // publishRecord stays null — status falls back to 'rendered' if episode+thumb present
      } else {
        publishRecord = publishResult.data;
      }
    }
  }

  // --- Step 6: derive status ---
  const status = deriveStatus({ hasEpisode, hasThumb, publishRecord });

  // --- Step 7: build EpisodeIndex row ---
  const row: EpisodeIndex = {
    manifestHash: manifest.manifestHash,
    kid: input.kid,
    gameFolder: folderName,
    absFolderPath: input.absFolderPath,
    date: gameMeta.date,
    opponent: gameMeta.opponent,
    scoreFor: gameMeta.scoreFor,
    scoreAgainst: gameMeta.scoreAgainst,
    result: gameMeta.result,
    status,
    thumbAbsPath: hasThumb ? thumbPath : null,
    episodeAbsPath: hasEpisode ? episodePath : null,
    publishVideoId: publishRecord?.videoId ?? null,
    publishWatchUrl: publishRecord?.watchUrl ?? null,
    clipCount: manifest.clips.length,
    scannedAtMs: input.scannedAtMs,
  };

  return row;
}

// ---------------------------------------------------------------------------
// Root scanner
// ---------------------------------------------------------------------------

/**
 * Walk `absRootPath/<kid>/<game>/` exactly two levels deep and return all valid
 * EpisodeIndex rows plus a WarningBag of non-fatal anomalies.
 *
 * Ordering contract (pinned by Plan 01 test case 9):
 *   kid ascending (localeCompare) → date descending (lexicographic reverse) → gameFolder ascending
 * Plan 02's sqlite list query MUST emit the same order.
 *
 * If `absRootPath` does not exist, returns `{ episodes: [], warnings }` (caller bug — no crash).
 */
export function scanGolazoRoot(absRootPath: string): ScanResult {
  const warnings = createWarningBag();
  const episodes: EpisodeIndex[] = [];
  const scannedAtMs = Date.now();

  if (!existsSync(absRootPath)) {
    return { episodes, warnings };
  }

  // Level 1: kid directories
  const kidEntries = readdirSync(absRootPath, { withFileTypes: true });
  for (const kidEntry of kidEntries) {
    if (!kidEntry.isDirectory()) continue;
    const kid = kidEntry.name;
    const kidPath = join(absRootPath, kid);

    // Level 2: game directories
    const gameEntries = readdirSync(kidPath, { withFileTypes: true });
    for (const gameEntry of gameEntries) {
      if (!gameEntry.isDirectory()) continue;
      const absFolderPath = join(kidPath, gameEntry.name);

      const row = scanGameFolder({ absFolderPath, kid, warnings, scannedAtMs });
      if (row !== null) {
        episodes.push(row);
      }
    }
  }

  // Sort: kid asc, date desc, gameFolder asc
  episodes.sort((a, b) => {
    const kidCmp = a.kid.localeCompare(b.kid);
    if (kidCmp !== 0) return kidCmp;
    // date desc: newer dates sort first; ISO dates are lexicographically comparable
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return a.gameFolder.localeCompare(b.gameFolder);
  });

  return { episodes, warnings };
}
