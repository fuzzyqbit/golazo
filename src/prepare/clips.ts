/**
 * Clip discovery (PREP-03).
 *
 * Given an absolute folder path, returns every file inside it whose name
 * matches `^\d+-.+\.mp4$` (e.g. `01-clip.mp4`, `10-anything-with-dashes.mp4`)
 * sorted by the integer value of the numeric prefix. Non-matching files
 * are filtered out silently *unless* the result would be empty, in which
 * case a {@link ClipDiscoveryError} is thrown that lists every skipped
 * file so the operator can see what got rejected.
 *
 * This module is filesystem-touching but stateless — it does NO writes
 * and no recursion. It only inspects the immediate contents of the
 * supplied folder via `readdirSync`. Plan 05's orchestrator composes
 * this with `parseFilename`, `resolveKidFromPath`, `probeDuration`, and
 * `computeClipSha256` into the full manifest builder.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ClipDiscoveryError } from './errors.js';

/**
 * Regex that defines the canonical clip filename. One or more digits, a
 * literal dash, at least one further character, and the `.mp4` extension.
 * The capture group is the numeric prefix as a string (e.g. `'01'`, `'10'`)
 * — `discoverClips` parses it via `Number(...)` so `10-clip.mp4` sorts
 * AFTER `02-clip.mp4` (which lexicographic comparison would get wrong).
 */
export const CLIP_FILENAME_REGEX = /^(\d+)-.+\.mp4$/;

/** A single discovered clip — the filename plus the absolute path. */
export interface ClipEntry {
  readonly file: string;
  readonly absPath: string;
}

/**
 * List every clip file inside `folderPath`, sorted by the integer value
 * of the leading `NN-` prefix. Throws {@link ClipDiscoveryError} when
 * the folder does not exist, is not a directory, or contains zero files
 * matching the canonical pattern. The thrown error always lists the
 * skipped files so the operator sees what was filtered.
 */
export function discoverClips(folderPath: string): ClipEntry[] {
  if (!existsSync(folderPath)) {
    throw new ClipDiscoveryError({
      folderPath,
      skippedFiles: [],
      reason: `folder does not exist: ${folderPath}`,
    });
  }

  const stat = statSync(folderPath);
  if (!stat.isDirectory()) {
    // When the supplied path is a file, surface it in the skipped list so
    // the operator can see they pointed at a file by mistake. Anything
    // else (sockets, symlinks to nowhere, etc.) lands here too with the
    // path basename shown.
    const basename = folderPath.split(/[\\/]/).pop() ?? folderPath;
    throw new ClipDiscoveryError({
      folderPath,
      skippedFiles: [basename],
      reason: 'path is not a directory',
    });
  }

  const entries = readdirSync(folderPath);

  const matched: string[] = [];
  const skipped: string[] = [];
  for (const entry of entries) {
    if (CLIP_FILENAME_REGEX.test(entry)) {
      matched.push(entry);
    } else {
      skipped.push(entry);
    }
  }

  if (matched.length === 0) {
    throw new ClipDiscoveryError({
      folderPath,
      skippedFiles: skipped,
      reason: 'no files match NN-*.mp4',
    });
  }

  // Sort by integer prefix first, then by full filename as a stable
  // tiebreaker so two entries at the same prefix have a deterministic
  // order (e.g. `01-clip.mp4` before `01-other.mp4`).
  matched.sort((a, b) => {
    const aMatch = CLIP_FILENAME_REGEX.exec(a);
    const bMatch = CLIP_FILENAME_REGEX.exec(b);
    /* c8 ignore next 4 -- both names already passed the same regex above;
       this guard exists only to satisfy `noUncheckedIndexedAccess`. */
    if (!aMatch?.[1] || !bMatch?.[1]) {
      return a.localeCompare(b);
    }
    const prefixDiff = Number(aMatch[1]) - Number(bMatch[1]);
    if (prefixDiff !== 0) return prefixDiff;
    return a.localeCompare(b);
  });

  return matched.map((file) => ({ file, absPath: join(folderPath, file) }));
}
