/**
 * Music pool loader — reads `remotion/assets/music/index.json`, validates
 * each entry via zod, resolves absolute file paths, asserts each file exists
 * on disk, and returns the pool sorted by file name ascending.
 *
 * The default index path is `remotion/assets/music/index.json` resolved
 * relative to the current working directory. Pass `opts.indexPath` to
 * override (used in tests and for non-standard project layouts).
 *
 * This module does NOT invoke ffprobe — it trusts the `durationSec` values
 * declared in `index.json`. Plan 02-04 (render driver) may add an integrity
 * probe later if needed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

import { MusicPoolError } from '../prepare/errors.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for a single entry in `remotion/assets/music/index.json`.
 * The `file` field must be a simple lowercase ASCII filename (no path
 * separators) so callers can safely `join(baseDir, entry.file)`.
 */
export const musicPoolEntrySchema = z.object({
  file: z.string().regex(/^[a-z0-9-]+\.mp3$/),
  title: z.string().min(1),
  durationSec: z.number().positive(),
  mood: z.enum(['atmos', 'driving', 'uplift', 'tense']),
});

/**
 * A validated pool entry augmented with the absolute path to the .mp3 file.
 * `absPath` is derived from the index.json parent directory at load time.
 */
export type MusicPoolEntry = z.infer<typeof musicPoolEntrySchema> & { absPath: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default path to `index.json`, resolved relative to the working directory
 * at module-load time. Override via `loadMusicPool({ indexPath: ... })`.
 */
export const DEFAULT_MUSIC_INDEX_PATH = resolve('remotion/assets/music/index.json');

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load and validate the music pool from `remotion/assets/music/index.json`
 * (or a custom path via `opts.indexPath`).
 *
 * Steps:
 * 1. Assert the index file exists on disk.
 * 2. JSON-parse the file; throw on malformed input.
 * 3. Validate via `z.array(musicPoolEntrySchema).min(1)`.
 * 4. Assert each declared `.mp3` file exists on disk.
 * 5. Sort by `file` ascending (deterministic iteration order).
 * 6. Return the augmented array.
 *
 * @throws {MusicPoolError} for any validation or file-system failure.
 */
export function loadMusicPool(opts?: { indexPath?: string }): MusicPoolEntry[] {
  const indexPath = opts?.indexPath ?? DEFAULT_MUSIC_INDEX_PATH;

  // Step 1: index file must exist
  if (!existsSync(indexPath)) {
    throw new MusicPoolError({
      field: 'indexPath',
      reason: `index.json not found at '${indexPath}'`,
      remediation: 'commit remotion/assets/music/index.json or pass --music-index <path>',
    });
  }

  // Step 2: parse JSON
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new MusicPoolError({
      field: 'indexPath',
      reason: `invalid JSON: ${msg}`,
      remediation: 'fix remotion/assets/music/index.json',
    });
  }

  // Step 3: zod validation — empty array caught below via min(1) failure
  const parsed = z.array(musicPoolEntrySchema).safeParse(rawJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue
      ? `pool[${issue.path.map((s) => String(s)).join('.')}]`
      : 'pool';
    const reason = issue?.message ?? 'failed schema validation';
    throw new MusicPoolError({
      field,
      reason,
      remediation: 'fix remotion/assets/music/index.json',
    });
  }

  // Step 4: empty pool check (zod min(1) would also catch this, but we want
  // a specific error message)
  if (parsed.data.length === 0) {
    throw new MusicPoolError({
      field: 'pool',
      reason: 'music pool is empty',
      remediation:
        'commit at least one mp3 + entry in remotion/assets/music/index.json',
    });
  }

  // Step 5: resolve absPath + disk-existence check
  const baseDir = dirname(indexPath);
  const entries: MusicPoolEntry[] = parsed.data.map((e, idx) => {
    const absPath = join(baseDir, e.file);
    if (!existsSync(absPath)) {
      throw new MusicPoolError({
        field: `pool[${idx}].file`,
        reason: `'${e.file}' declared in index.json but not present at '${absPath}'`,
        remediation: 'commit the file or remove the entry from index.json',
      });
    }
    return { ...e, absPath };
  });

  // Step 6: sort by file ascending (deterministic pool iteration order)
  entries.sort((a, b) => a.file.localeCompare(b.file));

  return entries;
}
