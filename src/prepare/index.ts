/**
 * `runPrepare` — the orchestrator that composes Plans 02-04 + Task 1's
 * manifest layer into the working `golazo prepare <folder>` pipeline.
 *
 * Step order (matters — the case 4 vs case 6 distinction in
 * `index.test.ts` depends on it):
 *
 *  1. Resolve absolute folder path.
 *  2. Parse folder name (FilenameError if malformed).
 *  3. resolveKidFromPath (KidPathError / UnknownKidError /
 *     ChannelsConfigError propagate).
 *  4. discoverClips (ClipDiscoveryError if empty).
 *  5. For each clip, run probeDuration + computeClipSha256 in parallel.
 *     ProbeError propagates if any clip is invalid mp4. This step runs
 *     BEFORE the hash compare, so corrupt clips short-circuit to
 *     ProbeError instead of taking the hash-changed branch.
 *  6. Compute candidate manifestHash (via buildManifest).
 *  7. Read any existing `.golazo/manifest.json`. ManifestError propagates
 *     if the on-disk file is malformed or fails the schema.
 *  8. Decide write disposition:
 *       - existing && existing.manifestHash === candidate.manifestHash
 *         && !force → return `{skipped:true, reason:'hash-match'}`
 *         without writing.
 *       - force → write, return reason `'force'`.
 *       - existing && existing.manifestHash !== candidate.manifestHash →
 *         write, return reason `'hash-changed'`.
 *       - else → write, return reason `'first-run'`.
 *
 * The function is async because probeDuration + computeClipSha256 are
 * async; nothing else here touches I/O asynchronously.
 */
import { basename, join, resolve } from 'node:path';

import { discoverClips } from './clips.js';
import { parseFilename } from './filename.js';
import { computeClipSha256 } from './hash.js';
import { resolveKidFromPath } from './kid.js';
import {
  buildManifest,
  readManifest,
  writeManifest,
  MANIFEST_FILE_NAME,
  type Manifest,
} from './manifest.js';
import { probeDuration } from './probe.js';

/** Why runPrepare wrote (or did not write) the manifest. */
export type PrepareReason = 'first-run' | 'hash-match' | 'hash-changed' | 'force';

/**
 * Return value from {@link runPrepare}. `skipped` is `true` only when the
 * existing manifestHash matched the candidate and `force` was not set.
 */
export interface PrepareResult {
  skipped: boolean;
  reason: PrepareReason;
  manifest: Manifest;
  manifestPath: string;
}

/** Inputs to {@link runPrepare}. */
export interface RunPrepareOpts {
  /** Path to the game folder (relative or absolute — resolved internally). */
  folderPath: string;
  /** Optional override for the channels.yaml location (forwarded to resolveKidFromPath). */
  channelsPath?: string;
  /** When `true`, rewrite the manifest even when the hash matches the on-disk file. */
  force?: boolean;
}

/**
 * Compose the prepare pipeline against `opts.folderPath`. See the
 * module-level JSDoc for the exact step order and idempotency contract.
 */
export async function runPrepare(opts: RunPrepareOpts): Promise<PrepareResult> {
  const absFolder = resolve(opts.folderPath);
  const folderName = basename(absFolder);

  // Step 2: filename parse (may throw FilenameError).
  const gameMeta = parseFilename(folderName);

  // Step 3: kid resolution (may throw KidPathError / UnknownKidError /
  // ChannelsConfigError).
  const kid = resolveKidFromPath(absFolder, { channelsPath: opts.channelsPath });

  // Step 4: clip discovery (may throw ClipDiscoveryError).
  const discovered = discoverClips(absFolder);

  // Step 5: per-clip probe + hash IN PARALLEL. Within a single clip,
  // probeDuration and computeClipSha256 are independent so Promise.all
  // halves the wall-clock for that clip. Across clips, Promise.all the
  // outer array so all clips are probed/hashed concurrently. Total time
  // is roughly max(probe+hash per clip) instead of sum-of-all.
  const clipsWithMetrics = await Promise.all(
    discovered.map(async (clip) => {
      const [durationSec, sha256] = await Promise.all([
        probeDuration(clip.absPath),
        computeClipSha256(clip.absPath),
      ]);
      return { file: clip.file, durationSec, sha256 };
    }),
  );

  // Step 6: build the candidate manifest (computes manifestHash internally).
  const candidate = buildManifest({
    folderName,
    kid,
    gameMeta,
    clips: clipsWithMetrics,
  });

  // Step 7: read any existing manifest (may throw ManifestError on a
  // malformed on-disk file). Null when this is a first run.
  const existing = readManifest(absFolder);
  const manifestPath = join(absFolder, MANIFEST_FILE_NAME);

  // Step 8: idempotency decision.
  if (
    existing !== null &&
    existing.manifestHash === candidate.manifestHash &&
    !opts.force
  ) {
    return {
      skipped: true,
      reason: 'hash-match',
      manifest: existing,
      manifestPath,
    };
  }

  let reason: PrepareReason;
  if (opts.force) {
    reason = 'force';
  } else if (existing !== null) {
    // Hash differs (the `===` check above failed) → content changed.
    reason = 'hash-changed';
  } else {
    reason = 'first-run';
  }

  writeManifest(absFolder, candidate);

  return {
    skipped: false,
    reason,
    manifest: candidate,
    manifestPath,
  };
}
