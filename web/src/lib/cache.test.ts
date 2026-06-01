/**
 * Cache wrapper tests — Plan 06-02 Task 2.
 *
 * Each test uses a fresh tmpdir sqlite db to avoid test pollution.
 * The fixture root at web/tests/fixtures/golazo is used for round-trip tests.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import {
  openCache,
  closeCache,
  upsertEpisode,
  deleteEpisode,
  queryAllEpisodes,
  queryEpisodeByHash,
  rebuildFromScan,
} from './cache';
import type { Cache } from './cache';
import type { EpisodeIndex } from './episodeIndex';
import { scanGolazoRoot } from './scanner';

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

function makeTmpDbPath(): string {
  return join(tmpdir(), `golazo-cache-${randomUUID()}.db`);
}

function makeRow(overrides: Partial<EpisodeIndex> = {}): EpisodeIndex {
  const base: EpisodeIndex = {
    manifestHash: 'sha256:' + 'a'.repeat(64),
    kid: 'leo',
    gameFolder: '2026-05-13_vs_united_3-1',
    absFolderPath: '/tmp/fixture/leo/2026-05-13_vs_united_3-1',
    date: '2026-05-13',
    opponent: 'united',
    scoreFor: 3,
    scoreAgainst: 1,
    result: 'W',
    status: 'prepared',
    thumbAbsPath: null,
    episodeAbsPath: null,
    publishVideoId: null,
    publishWatchUrl: null,
    clipCount: 3,
    scannedAtMs: 1700000000000,
  };
  return { ...base, ...overrides };
}

// Fixture root: resolve from repo root (vitest runs with cwd = repo root)
const FIXTURE_ROOT = resolve('web/tests/fixtures/golazo');

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('cache', () => {
  const openCaches: Cache[] = [];

  afterEach(() => {
    // Close all caches opened during the test
    for (const cache of openCaches) {
      try { closeCache(cache); } catch { /* ignore */ }
    }
    openCaches.length = 0;
  });

  function open(dbPath?: string): Cache {
    const cache = openCache({ dbPath: dbPath ?? makeTmpDbPath() });
    openCaches.push(cache);
    return cache;
  }

  // 1. OPEN EMPTY: creates file, sets WAL mode, creates episodes table
  it('OPEN EMPTY: creates db file with WAL mode and episodes table', () => {
    const dbPath = makeTmpDbPath();
    const cache = open(dbPath);

    // File exists and has content
    expect(existsSync(dbPath)).toBe(true);
    expect(statSync(dbPath).size).toBeGreaterThan(0);

    // WAL mode is set
    const pragmaResult = cache.db.pragma('journal_mode') as { journal_mode: string }[];
    expect(pragmaResult[0]?.journal_mode).toBe('wal');

    // episodes table exists
    const table = cache.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='episodes'")
      .get() as { name: string } | undefined;
    expect(table?.name).toBe('episodes');
  });

  // 2. SCHEMA APPLIED: 16 columns matching EpisodeIndex field set
  it('SCHEMA APPLIED: episodes table has 16 columns matching EpisodeIndex', () => {
    const cache = open();
    const columns = cache.db.prepare('SELECT * FROM episodes LIMIT 0').columns();
    expect(columns).toHaveLength(16);

    const names = columns.map((c) => c.name);
    expect(names).toContain('manifest_hash');
    expect(names).toContain('kid');
    expect(names).toContain('game_folder');
    expect(names).toContain('abs_folder_path');
    expect(names).toContain('date');
    expect(names).toContain('opponent');
    expect(names).toContain('score_for');
    expect(names).toContain('score_against');
    expect(names).toContain('result');
    expect(names).toContain('status');
    expect(names).toContain('thumb_abs_path');
    expect(names).toContain('episode_abs_path');
    expect(names).toContain('publish_video_id');
    expect(names).toContain('publish_watch_url');
    expect(names).toContain('clip_count');
    expect(names).toContain('scanned_at_ms');
  });

  // 3. UPSERT NEW ROW: inserts one row; queryAllEpisodes returns it deep-equal
  it('UPSERT NEW ROW: inserts a row and queryAllEpisodes returns it', () => {
    const cache = open();
    const row = makeRow();

    upsertEpisode(cache, row);

    const results = queryAllEpisodes(cache);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(row);
  });

  // 4. UPSERT OVERWRITE: same manifestHash with different status → single row with new status
  it('UPSERT OVERWRITE: upserting same hash updates row without duplicate', () => {
    const cache = open();
    const row = makeRow({ status: 'prepared' });

    upsertEpisode(cache, row);
    upsertEpisode(cache, { ...row, status: 'rendered' });

    const results = queryAllEpisodes(cache);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('rendered');
  });

  // 5. DELETE: insert two rows, delete one, verify
  it('DELETE: removes exactly the specified row by manifestHash', () => {
    const cache = open();
    const rowA = makeRow({ manifestHash: 'sha256:' + 'a'.repeat(64), gameFolder: '2026-05-13_vs_united_3-1' });
    const rowB = makeRow({
      manifestHash: 'sha256:' + 'b'.repeat(64),
      gameFolder: '2026-05-20_vs_rivers_2-2',
      date: '2026-05-20',
      opponent: 'rivers',
      scoreFor: 2,
      scoreAgainst: 2,
      result: 'D',
    });

    upsertEpisode(cache, rowA);
    upsertEpisode(cache, rowB);
    deleteEpisode(cache, rowA.manifestHash);

    const results = queryAllEpisodes(cache);
    expect(results).toHaveLength(1);
    expect(results[0]?.manifestHash).toBe(rowB.manifestHash);

    expect(queryEpisodeByHash(cache, rowA.manifestHash)).toBeNull();
  });

  // 6. QUERY ORDER: kid ASC, date DESC, game_folder ASC
  it('QUERY ORDER: returns episodes in kid ASC, date DESC, gameFolder ASC order', () => {
    const cache = open();

    // Two kids: leo and mateo; three dates for leo, two for mateo
    const rows: EpisodeIndex[] = [
      makeRow({ manifestHash: 'sha256:' + '1'.repeat(64), kid: 'mateo', gameFolder: '2026-05-10_vs_alpha_1-0', date: '2026-05-10', opponent: 'alpha', scoreFor: 1, scoreAgainst: 0, result: 'W' }),
      makeRow({ manifestHash: 'sha256:' + '2'.repeat(64), kid: 'leo', gameFolder: '2026-05-01_vs_beta_2-1', date: '2026-05-01', opponent: 'beta', scoreFor: 2, scoreAgainst: 1, result: 'W' }),
      makeRow({ manifestHash: 'sha256:' + '3'.repeat(64), kid: 'leo', gameFolder: '2026-05-20_vs_gamma_0-0', date: '2026-05-20', opponent: 'gamma', scoreFor: 0, scoreAgainst: 0, result: 'D' }),
      makeRow({ manifestHash: 'sha256:' + '4'.repeat(64), kid: 'mateo', gameFolder: '2026-05-25_vs_delta_3-2', date: '2026-05-25', opponent: 'delta', scoreFor: 3, scoreAgainst: 2, result: 'W' }),
      makeRow({ manifestHash: 'sha256:' + '5'.repeat(64), kid: 'leo', gameFolder: '2026-05-10_vs_epsilon_1-2', date: '2026-05-10', opponent: 'epsilon', scoreFor: 1, scoreAgainst: 2, result: 'L' }),
    ];

    for (const row of rows) {
      upsertEpisode(cache, row);
    }

    const results = queryAllEpisodes(cache);
    expect(results).toHaveLength(5);

    // leo comes before mateo (kid ASC)
    // leo episodes: 2026-05-20 first, then 2026-05-10, then 2026-05-01 (date DESC)
    // mateo episodes: 2026-05-25 first, then 2026-05-10 (date DESC)
    const hashes = results.map((r) => r.manifestHash);
    expect(hashes[0]).toBe('sha256:' + '3'.repeat(64)); // leo, 2026-05-20
    expect(hashes[1]).toBe('sha256:' + '5'.repeat(64)); // leo, 2026-05-10
    expect(hashes[2]).toBe('sha256:' + '2'.repeat(64)); // leo, 2026-05-01
    expect(hashes[3]).toBe('sha256:' + '4'.repeat(64)); // mateo, 2026-05-25
    expect(hashes[4]).toBe('sha256:' + '1'.repeat(64)); // mateo, 2026-05-10
  });

  // 7. QUERYBYHASH ROUND-TRIP: insert then retrieve by hash
  it('QUERYBYHASH ROUND-TRIP: returns deep-equal EpisodeIndex', () => {
    const cache = open();
    const row = makeRow({
      thumbAbsPath: '/tmp/thumb.png',
      episodeAbsPath: '/tmp/episode.mp4',
      publishVideoId: 'dQw4w9WgXcQ',
      publishWatchUrl: 'https://youtu.be/dQw4w9WgXcQ',
      status: 'published',
    });

    upsertEpisode(cache, row);

    const result = queryEpisodeByHash(cache, row.manifestHash);
    expect(result).not.toBeNull();
    expect(result).toEqual(row);
  });

  // 8. QUERYBYHASH MISS: returns null for non-existent hash
  it('QUERYBYHASH MISS: returns null for unknown hash', () => {
    const cache = open();
    const result = queryEpisodeByHash(cache, 'sha256:' + 'f'.repeat(64));
    expect(result).toBeNull();
  });

  // 9. REBUILDFROMSCAN ATOMIC: replaces all rows with fixture scan result
  it('REBUILDFROMSCAN ATOMIC: clears old rows and replaces with scan output', () => {
    const cache = open();

    // Pre-insert 3 "stale" rows that should be replaced
    const staleHashes = ['sha256:' + 'x'.repeat(64), 'sha256:' + 'y'.repeat(64), 'sha256:' + 'z'.repeat(64)];
    for (const hash of staleHashes) {
      upsertEpisode(cache, makeRow({ manifestHash: hash }));
    }
    expect(queryAllEpisodes(cache)).toHaveLength(3);

    // Rebuild from the 3-game fixture
    const scanResult = scanGolazoRoot(FIXTURE_ROOT);
    expect(scanResult.episodes).toHaveLength(3); // Verify fixture has 3 valid episodes

    rebuildFromScan(cache, scanResult);

    const results = queryAllEpisodes(cache);
    expect(results).toHaveLength(3);

    // Stale rows are gone
    for (const hash of staleHashes) {
      expect(queryEpisodeByHash(cache, hash)).toBeNull();
    }

    // New rows match fixture hashes
    const resultHashes = new Set(results.map((r) => r.manifestHash));
    for (const episode of scanResult.episodes) {
      expect(resultHashes.has(episode.manifestHash)).toBe(true);
    }
  });

  // 10. REBUILDFROMSCAN ROLLS BACK ON ERROR: partial failure rolls back
  it('REBUILDFROMSCAN ROLLS BACK ON ERROR: original rows intact after failed rebuild', () => {
    const cache = open();

    // Insert 3 known rows
    const originalRows = [
      makeRow({ manifestHash: 'sha256:' + 'a'.repeat(64), gameFolder: '2026-05-13_vs_a_3-1' }),
      makeRow({ manifestHash: 'sha256:' + 'b'.repeat(64), gameFolder: '2026-05-20_vs_b_2-2', date: '2026-05-20', opponent: 'b', scoreFor: 2, scoreAgainst: 2, result: 'D' }),
      makeRow({ manifestHash: 'sha256:' + 'c'.repeat(64), gameFolder: '2026-05-27_vs_c_4-0', date: '2026-05-27', opponent: 'c', scoreFor: 4, scoreAgainst: 0 }),
    ];
    for (const row of originalRows) {
      upsertEpisode(cache, row);
    }

    // Create a scan result with one invalid row that violates CHECK constraint
    // (result 'X' is not in ('W','L','D') — violates sql CHECK constraint)
    const badRow = makeRow({
      manifestHash: 'sha256:' + 'd'.repeat(64),
      result: 'X' as 'W', // deliberately invalid
    });

    const badScanResult = {
      episodes: [badRow],
      warnings: { brokenFolders: [], invalidManifests: [], invalidPublishRecords: [] },
    };

    // rebuildFromScan should throw (db enforces CHECK constraint)
    expect(() => rebuildFromScan(cache, badScanResult)).toThrow();

    // Transaction rolled back — original rows are intact
    const results = queryAllEpisodes(cache);
    expect(results).toHaveLength(3);
    const resultHashes = new Set(results.map((r) => r.manifestHash));
    for (const row of originalRows) {
      expect(resultHashes.has(row.manifestHash)).toBe(true);
    }
  });

  // 11. CLOSECACHE IDEMPOTENT: second close does not throw
  it('CLOSECACHE IDEMPOTENT: closing twice does not throw', () => {
    const dbPath = makeTmpDbPath();
    const cache = openCache({ dbPath });

    closeCache(cache);
    expect(() => closeCache(cache)).not.toThrow();
  });

  // 12. ROUND-TRIP EQUALITY WITH SCANNER: scanGolazoRoot + rebuildFromScan + queryAllEpisodes
  it('ROUND-TRIP EQUALITY: queryAllEpisodes matches scanGolazoRoot output (modulo scannedAtMs)', () => {
    const cache = open();
    const scanResult = scanGolazoRoot(FIXTURE_ROOT);

    rebuildFromScan(cache, scanResult);

    const results = queryAllEpisodes(cache);
    expect(results).toHaveLength(scanResult.episodes.length);

    // Verify each field except scannedAtMs (which is Date.now() at scan time)
    for (let i = 0; i < scanResult.episodes.length; i++) {
      const expected = scanResult.episodes[i]!;
      const actual = results[i]!;
      expect(actual.manifestHash).toBe(expected.manifestHash);
      expect(actual.kid).toBe(expected.kid);
      expect(actual.gameFolder).toBe(expected.gameFolder);
      expect(actual.absFolderPath).toBe(expected.absFolderPath);
      expect(actual.date).toBe(expected.date);
      expect(actual.opponent).toBe(expected.opponent);
      expect(actual.scoreFor).toBe(expected.scoreFor);
      expect(actual.scoreAgainst).toBe(expected.scoreAgainst);
      expect(actual.result).toBe(expected.result);
      expect(actual.status).toBe(expected.status);
      expect(actual.thumbAbsPath).toBe(expected.thumbAbsPath);
      expect(actual.episodeAbsPath).toBe(expected.episodeAbsPath);
      expect(actual.publishVideoId).toBe(expected.publishVideoId);
      expect(actual.publishWatchUrl).toBe(expected.publishWatchUrl);
      expect(actual.clipCount).toBe(expected.clipCount);
      // scannedAtMs: verify it's within 1 second of original
      expect(Math.abs(actual.scannedAtMs - expected.scannedAtMs)).toBeLessThan(1000);
    }
  });
});
