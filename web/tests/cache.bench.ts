/**
 * cache.bench.ts — Vitest benchmark for queryAllEpisodes at 100-row scale.
 *
 * Plan 06-02 Task 3. Implements DISC-03's < 50 ms list-query target.
 *
 * Two sections:
 *   1. `bench(...)` block — interactive timing when running `npx vitest bench`
 *   2. `it('p95 < 100ms gate')` — assert-style gate under `npx vitest run` (CI)
 *
 * The p95 gate uses wall-clock measurements via performance.now() over 10 manual
 * iterations. At N=10 samples, p95 = samples[9] (the max), making this effectively
 * a p100 gate — stricter than stated, but safe for the CI tolerance of < 100 ms.
 */
import { bench, describe, beforeAll, afterAll, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { openCache, closeCache, upsertEpisode, queryAllEpisodes } from '../src/lib/cache';
import type { Cache } from '../src/lib/cache';
import type { EpisodeIndex } from '../src/lib/episodeIndex';

// ---------------------------------------------------------------------------
// Shared setup: 100-row cache opened once for all bench/test blocks
// ---------------------------------------------------------------------------

let cache: Cache;

function buildBenchCache(): Cache {
  const dbPath = join(tmpdir(), `golazo-cache-bench-${randomUUID()}.db`);
  mkdirSync(dirname(dbPath), { recursive: true });
  const c = openCache({ dbPath });

  for (let i = 0; i < 100; i++) {
    const kid = ['leo', 'mateo', 'alice', 'bob'][i % 4]!;
    const month = String((i % 12) + 1).padStart(2, '0');
    const day = String((i % 28) + 1).padStart(2, '0');
    const date = `2026-${month}-${day}`;
    // Pad hash with the index representation to create unique hashes
    const hashSuffix = String(i).padStart(64, 'a');
    const row: EpisodeIndex = {
      manifestHash: `sha256:${hashSuffix}`,
      kid,
      gameFolder: `${date}_vs_team${i}_2-1`,
      absFolderPath: `/tmp/${kid}/${date}_vs_team${i}_2-1`,
      date,
      opponent: `team${i}`,
      scoreFor: 2,
      scoreAgainst: 1,
      result: 'W',
      status: 'rendered',
      thumbAbsPath: '/tmp/thumb.png',
      episodeAbsPath: '/tmp/episode.mp4',
      publishVideoId: null,
      publishWatchUrl: null,
      clipCount: 4,
      scannedAtMs: 1700000000000 + i,
    };
    upsertEpisode(c, row);
  }

  return c;
}

// ---------------------------------------------------------------------------
// Interactive bench block (vitest bench only — skipped in vitest run)
// ---------------------------------------------------------------------------
// bench() throws when not in benchmark mode. This file is designed to be run
// via both `vitest bench` (for interactive timing) and `vitest run` (for the
// p95 it() gate below). The bench describe is only registered when vitest is
// running in benchmark mode.
//
// When running `vitest run`, the `bench()` call throws "only available in
// benchmark mode" and is caught here — the describe block is skipped entirely.
// The second describe block (p95 gate) uses only `it()` and always runs.

let isBenchMode = false;
try {
  // Probe whether bench mode is active — will throw in run mode
  bench('_probe', () => {}, { iterations: 1, time: 0 });
  isBenchMode = true;
} catch {
  isBenchMode = false;
}

if (isBenchMode) {
  describe('cache benchmarks', () => {
    beforeAll(() => {
      cache = buildBenchCache();
    });

    afterAll(() => {
      closeCache(cache);
    });

    bench(
      'queryAllEpisodes 100 rows',
      () => {
        const rows = queryAllEpisodes(cache);
        if (rows.length !== 100) {
          throw new Error(`expected 100 rows, got ${rows.length}`);
        }
      },
      { iterations: 10, time: 0 },
    );
  });
}

// ---------------------------------------------------------------------------
// p95 assert gate (vitest run — CI enforcement)
// ---------------------------------------------------------------------------

describe('cache benchmark gate', () => {
  let gateCache: Cache;

  beforeAll(() => {
    gateCache = buildBenchCache();
  });

  afterAll(() => {
    closeCache(gateCache);
  });

  it('queryAllEpisodes p95 < 100ms over 10 samples (target: < 50ms locally)', () => {
    const samples: number[] = [];

    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      const rows = queryAllEpisodes(gateCache);
      const t1 = performance.now();
      expect(rows.length).toBe(100);
      samples.push(t1 - t0);
    }

    samples.sort((a, b) => a - b);
    // At N=10, index 9 is the max (effectively p100 — stricter than stated p95)
    const p95 = samples[Math.floor(samples.length * 0.95)];
    expect(p95).toBeLessThan(100);
  });
});
