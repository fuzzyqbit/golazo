/**
 * Hashing helpers for the prepare pipeline (PREP-07 input half).
 *
 * Two functions live here:
 *
 *  - {@link computeClipSha256} streams an mp4 (or any file) through
 *    `createHash('sha256')` and resolves with the 64-char lowercase hex
 *    digest. Used to fill the per-clip `sha256` field on the manifest.
 *
 *  - {@link computeManifestHash} is the deterministic, pure function that
 *    produces the `sha256:`-prefixed `manifestHash` used for idempotency
 *    in Plan 05's manifest writer. The canonical input format (load-bearing
 *    across Phase 2 and beyond) is:
 *
 *        folderName + '\n' + sortedPairs
 *          .map(p => p.file + ':' + p.sha256)
 *          .join('\n')
 *
 *    Pairs are sorted by file name so iteration order does not flap the
 *    hash. Newline separators avoid boundary-ambiguity collisions between
 *    adjacent fields. Music and render metadata are EXCLUDED from the
 *    hash so picking a new track or re-rendering does not invalidate the
 *    cache.
 *
 * The functions are independent: `computeClipSha256` is the only one
 * that touches the filesystem, and `computeManifestHash` is a pure
 * function of its arguments.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** A single `{file, sha256}` pair for {@link computeManifestHash}. */
export interface ClipHashPair {
  /** Just the filename (e.g. `01-clip.mp4`), NOT an absolute path. */
  readonly file: string;
  /** Lowercase hex digest from {@link computeClipSha256}, no prefix. */
  readonly sha256: string;
}

/**
 * Compute the sha256 hex digest of the bytes at `absPath`. The file is
 * streamed through `createHash` so files of any size hash in constant
 * memory. Returns a 64-char lowercase hex string with NO `sha256:` prefix
 * — callers that want the prefixed form can add it themselves.
 *
 * Rejects when the file cannot be opened (e.g. does not exist, EACCES)
 * — the underlying `fs.ReadStream` error propagates verbatim so callers
 * can inspect `.code` for ENOENT etc.
 */
export async function computeClipSha256(absPath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(absPath);
    stream.on('error', reject);
    stream.on('data', (chunk: Buffer | string) => {
      hash.update(chunk);
    });
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}

/**
 * Compute the manifest hash from a folder name and the list of per-clip
 * `{file, sha256}` pairs. Pure deterministic function — same inputs
 * always produce the same output across machines, OS versions, and Node
 * versions (as long as the sha256 algorithm itself stays stable, which
 * it does by definition).
 *
 * The canonical input format is a stable contract that Phase 2 and
 * beyond MUST NOT mutate. See the module-level JSDoc for the exact
 * formula.
 */
export function computeManifestHash(folderName: string, pairs: readonly ClipHashPair[]): string {
  // Sort by file name so callers do not need to pre-sort. `localeCompare`
  // matches how Plan 05's manifest writer iterates clip entries.
  const sortedPairs = pairs.slice().sort((a, b) => a.file.localeCompare(b.file));
  const lines = sortedPairs.map((p) => `${p.file}:${p.sha256}`);
  const canonical = `${folderName}\n${lines.join('\n')}`;
  const hex = createHash('sha256').update(canonical).digest('hex');
  return `sha256:${hex}`;
}
