/**
 * Deterministic music track picker for the golazo render pipeline.
 *
 * `pickTrack` selects a music track from the pool using a sha256-seeded
 * pseudorandom index, then resolves which duration strategy to apply:
 *
 *   trim-fade  — The picked track is longer than the episode; trim the end
 *                with a fade-out at render time.
 *   reroll     — The initial pick was too short; the picker re-tries with a
 *                new seed until it finds a long-enough track.
 *   crossfade  — No track in the pool is long enough; the longest track is
 *                picked and the render driver will loop it with a crossfade.
 *
 * **Pure deterministic function.** No reads from process.env / Date /
 * Math.random. The seed source is the manifestHash + the per-attempt
 * counter, hashed via sha256. Given the same opts, every call returns the
 * same MusicPick — byte-stable across processes, platforms, and Node.js
 * versions.
 *
 * **The picker does NOT re-sort the pool.** Callers (`loadMusicPool`) sort
 * by file before passing to `pickTrack`; the picker indexes by pool-array
 * position. If you pass an unsorted pool you will get reproducible but
 * load-order-dependent results.
 *
 * **MUSIC_REROLL_LIMIT** caps the re-roll attempts so a pathologically large
 * pool of all-short tracks still terminates in O(MUSIC_REROLL_LIMIT) hash
 * calls. The hard ceiling is `pool.length` — if the pool is smaller than
 * `MUSIC_REROLL_LIMIT`, every element is tried at most once before the
 * crossfade fallback is triggered.
 */
import { createHash } from 'node:crypto';

import { MusicPickError } from '../prepare/errors.js';
import type { MusicPoolEntry } from './musicPool.js';

// Re-export MusicPickError so consumers can import it from this module
// without reaching into the prepare/errors barrel.
export { MusicPickError } from '../prepare/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which duration-fitting strategy was applied to the selected track. */
export type MusicPickStrategy = 'trim-fade' | 'reroll' | 'crossfade';

/** Result of a successful `pickTrack` call. */
export interface MusicPick {
  /** Pool entry file name (e.g. `'atmos-3.mp3'`). */
  track: string;
  /** Pool entry duration in seconds (NOT the episode duration). */
  durationSec: number;
  /** Duration-fitting strategy applied. */
  strategy: MusicPickStrategy;
  /** Number of re-roll attempts before this pick was accepted. 0 for first pick. */
  reroll: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Soft upper bound on re-roll attempts per `pickTrack` call.
 * The actual limit is `min(pool.length, MUSIC_REROLL_LIMIT)` so a small pool
 * is exhausted before this cap is reached.
 */
export const MUSIC_REROLL_LIMIT = 32;

// ---------------------------------------------------------------------------
// Algorithm helpers
// ---------------------------------------------------------------------------

/**
 * Compute a 16-hex-character seed for re-roll attempt `r` from `manifestHash`.
 * Using 16 hex chars (64-bit value) gives negligible collision probability
 * for any realistic pool size while keeping the modulo arithmetic simple.
 */
function computeSeed(manifestHash: string, r: number): string {
  return createHash('sha256')
    .update(`${manifestHash}:roll:${r}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Map a 16-hex seed to a pool index via BigInt modulo.
 * `BigInt` is required because a 16-hex-char value is up to 2^64−1, which
 * overflows `Number.MAX_SAFE_INTEGER` (2^53−1).
 */
function seedToIndex(seedHex: string, poolLength: number): number {
  return Number(BigInt('0x' + seedHex) % BigInt(poolLength));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Select a music track from `pool` deterministically, based on `manifestHash`
 * and the three-strategy algorithm described in the module JSDoc.
 *
 * @param opts.manifestHash  `'sha256:<hex>'` from `runPrepare` output.
 * @param opts.totalDurationSec  Episode runtime budget in seconds.
 * @param opts.pool  Validated pool from `loadMusicPool()` — sorted by file asc.
 *
 * @throws {MusicPickError} If `pool` is empty.
 */
export function pickTrack(opts: {
  manifestHash: string;
  totalDurationSec: number;
  pool: MusicPoolEntry[];
}): MusicPick {
  const { manifestHash, totalDurationSec, pool } = opts;

  // Guard: empty pool
  if (pool.length === 0) {
    throw new MusicPickError({
      reason: 'music pool is empty',
      remediation:
        'commit at least one .mp3 + entry in remotion/assets/music/index.json',
    });
  }

  // Attempt 0: initial seeded pick
  const seed0 = computeSeed(manifestHash, 0);
  const idx0 = seedToIndex(seed0, pool.length);
  const pick0 = pool[idx0]!;

  if (pick0.durationSec >= totalDurationSec) {
    return {
      track: pick0.file,
      durationSec: pick0.durationSec,
      strategy: 'trim-fade',
      reroll: 0,
    };
  }

  // Re-roll up to min(pool.length, MUSIC_REROLL_LIMIT) attempts
  const maxRolls = Math.min(pool.length, MUSIC_REROLL_LIMIT);
  for (let r = 1; r <= maxRolls; r++) {
    const seedR = computeSeed(manifestHash, r);
    const idxR = seedToIndex(seedR, pool.length);
    const pickR = pool[idxR]!;

    if (pickR.durationSec >= totalDurationSec) {
      return {
        track: pickR.file,
        durationSec: pickR.durationSec,
        strategy: 'reroll',
        reroll: r,
      };
    }
  }

  // Crossfade fallback: pick the longest track (file-asc tiebreak for determinism)
  const sorted = pool.slice().sort((a, b) => {
    if (b.durationSec !== a.durationSec) {
      return b.durationSec - a.durationSec; // descending by duration
    }
    return a.file.localeCompare(b.file); // ascending by file (tiebreak)
  });
  const longest = sorted[0]!;

  return {
    track: longest.file,
    durationSec: longest.durationSec,
    strategy: 'crossfade',
    reroll: maxRolls,
  };
}
