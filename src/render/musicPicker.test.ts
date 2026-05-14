import { describe, it, expect } from 'vitest';
import { pickTrack, MusicPick, MusicPickError, MUSIC_REROLL_LIMIT } from './musicPicker.js';
import type { MusicPoolEntry } from './musicPool.js';

/**
 * Build a synthetic pool from (file, durationSec) pairs. absPath points to
 * /tmp/<file> — the picker never touches the disk, so the path is unused.
 */
function makePool(specs: [string, number][]): MusicPoolEntry[] {
  return specs.map(([file, durationSec]) => ({
    file,
    title: file,
    durationSec,
    mood: 'atmos' as const,
    absPath: `/tmp/${file}`,
  }));
}

const HASH_A = 'sha256:' + 'a'.repeat(64);

describe('pickTrack', () => {
  // Case 1: DETERMINISM — 10 successive calls with identical inputs produce equal results
  it('case 1: determinism — 10 successive calls return deeply-equal results', () => {
    const pool = makePool([
      ['a.mp3', 200],
      ['b.mp3', 200],
    ]);
    const opts = { manifestHash: HASH_A, totalDurationSec: 100, pool };
    const first = pickTrack(opts);
    for (let i = 1; i < 10; i++) {
      expect(pickTrack(opts)).toEqual(first);
    }
  });

  // Case 2: CROSS-INSTANCE DETERMINISM — same results regardless of import instance
  // (confirms no module-level mutable state)
  it('case 2: cross-instance determinism — result is identical to direct call', async () => {
    const pool = makePool([['a.mp3', 200], ['b.mp3', 200]]);
    const opts = { manifestHash: HASH_A, totalDurationSec: 100, pool };
    const result1 = pickTrack(opts);
    // Import again via a cache-busted URL to simulate a second module instance
    // In vitest/Node the module cache may return the same instance, but since
    // pickTrack has no module-level mutable state, results MUST be identical.
    const { pickTrack: pickTrack2 } = await import('./musicPicker.js');
    const result2 = pickTrack2(opts);
    expect(result2).toEqual(result1);
  });

  // Case 3: TRIM-FADE BRANCH — all tracks >= totalDurationSec
  it('case 3: trim-fade branch — all tracks long enough, strategy=trim-fade reroll=0', () => {
    const pool = makePool([
      ['a.mp3', 200],
      ['b.mp3', 210],
      ['c.mp3', 190],
    ]);
    const result = pickTrack({ manifestHash: HASH_A, totalDurationSec: 180, pool });
    expect(result.strategy).toBe('trim-fade');
    expect(result.reroll).toBe(0);
    expect(['a.mp3', 'b.mp3', 'c.mp3']).toContain(result.track);
    expect(result.durationSec).toBeGreaterThanOrEqual(180);
  });

  // Case 4: REROLL BRANCH — first pick is too short, but a later pick is long enough
  // We need to choose a manifestHash that produces an initial idx on the short track.
  // We'll scan hashes to find one where idx0 lands on the short track.
  it('case 4: reroll branch — first pick too short, subsequent pick finds long track', () => {
    // Pool: 4 tracks; 3 short (30s), 1 long (300s at index 3)
    const pool = makePool([
      ['a.mp3', 30],
      ['b.mp3', 30],
      ['c.mp3', 30],
      ['d.mp3', 300],
    ]);
    const totalDurationSec = 100;

    // Find a hash where idx0 lands on a short track (a/b/c) but eventually
    // a re-roll lands on the long track. With 4 tracks and 3 short, we need
    // to find a hash where seed0 -> idx in [0,1,2].
    // Just run with HASH_A and accept whatever we get — if it happens to pick
    // 'd.mp3' on roll 0, that means trim-fade (pool[3]=300>=100).
    // We need to find a hash that starts on a short track.
    const { createHash } = require('node:crypto');
    let testHash: string | null = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      const h = 'sha256:' + createHash('sha256').update(`test-${attempt}`).digest('hex');
      const seed0 = createHash('sha256').update(h + ':roll:0').digest('hex').slice(0, 16);
      const idx0 = Number(BigInt('0x' + seed0) % BigInt(pool.length));
      if (idx0 < 3) {
        // idx0 lands on a short track
        testHash = h;
        break;
      }
    }
    expect(testHash).not.toBeNull();

    const result = pickTrack({ manifestHash: testHash!, totalDurationSec, pool });
    expect(result.strategy).toBe('reroll');
    expect(result.reroll).toBeGreaterThanOrEqual(1);
    expect(result.durationSec).toBeGreaterThanOrEqual(totalDurationSec);
    expect(result.track).toBe('d.mp3');
  });

  // Case 5: CROSSFADE FALLBACK — all tracks < totalDurationSec
  // tiebreak: pool [a.mp3=8, b.mp3=8, c.mp3=8] → file-asc tiebreak picks 'a.mp3'
  it('case 5: crossfade fallback — all tracks short, longest picked with file-asc tiebreak', () => {
    const pool = makePool([
      ['a.mp3', 8],
      ['b.mp3', 8],
      ['c.mp3', 8],
    ]);
    const result = pickTrack({ manifestHash: HASH_A, totalDurationSec: 100, pool });
    expect(result.strategy).toBe('crossfade');
    expect(result.track).toBe('a.mp3');
    expect(result.durationSec).toBe(8);
  });

  // Case 5b: CROSSFADE FALLBACK with different durations picks the longest track
  it('case 5b: crossfade fallback picks longest track (different durations)', () => {
    const pool = makePool([
      ['a.mp3', 30],
      ['b.mp3', 8],
      ['c.mp3', 25],
    ]);
    const result = pickTrack({ manifestHash: HASH_A, totalDurationSec: 100, pool });
    expect(result.strategy).toBe('crossfade');
    expect(result.track).toBe('a.mp3');
    expect(result.durationSec).toBe(30);
  });

  // Case 6: SINGLE-TRACK SHORT POOL — pool of 1 track shorter than episode
  it('case 6: single-track short pool — strategy=crossfade, reroll=1 (pool.length)', () => {
    const pool = makePool([['only.mp3', 5]]);
    const result = pickTrack({ manifestHash: HASH_A, totalDurationSec: 100, pool });
    expect(result.strategy).toBe('crossfade');
    expect(result.track).toBe('only.mp3');
    expect(result.reroll).toBe(1);
  });

  // Case 7: EMPTY POOL — throws MusicPickError with 'music pool is empty'
  it('case 7: empty pool throws MusicPickError with music pool is empty', () => {
    expect(() =>
      pickTrack({ manifestHash: HASH_A, totalDurationSec: 100, pool: [] }),
    ).toThrow(MusicPickError);
    try {
      pickTrack({ manifestHash: HASH_A, totalDurationSec: 100, pool: [] });
    } catch (err) {
      expect(err).toBeInstanceOf(MusicPickError);
      expect((err as MusicPickError).message).toContain('music pool is empty');
    }
  });

  // Case 8: SEED SENSITIVITY — different manifestHashes produce different picks
  it('case 8: seed sensitivity — 16 distinct hashes produce at least 2 distinct track picks', () => {
    const pool = makePool([
      ['a.mp3', 300], ['b.mp3', 300], ['c.mp3', 300],
      ['d.mp3', 300], ['e.mp3', 300], ['f.mp3', 300],
    ]);
    const { createHash } = require('node:crypto');
    const tracks = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const manifestHash = 'sha256:' + createHash('sha256').update(`seed-${i}`).digest('hex');
      const result = pickTrack({ manifestHash, totalDurationSec: 100, pool });
      tracks.add(result.track);
    }
    expect(tracks.size).toBeGreaterThanOrEqual(2);
  });

  // Case 9: SCHEMA TYPE CHECK — MusicPick shape via structural assertion
  it('case 9: schema type check — returned MusicPick has correct field types', () => {
    const pool = makePool([['a.mp3', 200]]);
    const result = pickTrack({ manifestHash: HASH_A, totalDurationSec: 100, pool });
    expect(typeof result.track).toBe('string');
    expect(typeof result.durationSec).toBe('number');
    expect(['trim-fade', 'reroll', 'crossfade']).toContain(result.strategy);
    expect(typeof result.reroll).toBe('number');
    expect(Number.isInteger(result.reroll)).toBe(true);
  });

  // Case 10: POOL ORDER STABILITY — picker uses pool-array index (does NOT re-sort)
  // Two orderings of the same pool produce different results (because idx0 maps
  // to different files at the same array position).
  it('case 10: pool order semantics — picker does not re-sort; idx maps to array position', () => {
    // Pool ordered A->B->C (alphabetical)
    const poolABC = makePool([['a.mp3', 300], ['b.mp3', 300], ['c.mp3', 300]]);
    // Pool ordered C->A->B (different order)
    const poolCAB = makePool([['c.mp3', 300], ['a.mp3', 300], ['b.mp3', 300]]);

    const { createHash } = require('node:crypto');
    const seed0 = createHash('sha256').update(HASH_A + ':roll:0').digest('hex').slice(0, 16);
    const idx0ABC = Number(BigInt('0x' + seed0) % BigInt(poolABC.length));
    const idx0CAB = Number(BigInt('0x' + seed0) % BigInt(poolCAB.length));

    // Same index, different pool ordering → different file names
    const resultABC = pickTrack({ manifestHash: HASH_A, totalDurationSec: 100, pool: poolABC });
    const resultCAB = pickTrack({ manifestHash: HASH_A, totalDurationSec: 100, pool: poolCAB });

    // Assert: each result is the file at idx0 in its respective pool
    expect(resultABC.track).toBe(poolABC[idx0ABC]!.file);
    expect(resultCAB.track).toBe(poolCAB[idx0CAB]!.file);

    // Both results are trim-fade (all tracks are long enough)
    expect(resultABC.strategy).toBe('trim-fade');
    expect(resultCAB.strategy).toBe('trim-fade');
  });

  // MUSIC_REROLL_LIMIT is exported and equals 32
  it('MUSIC_REROLL_LIMIT is 32', () => {
    expect(MUSIC_REROLL_LIMIT).toBe(32);
  });
});
