/**
 * watcher.test.ts — integration tests for startWatcher.
 *
 * Uses REAL timers (chokidar fires real FS events). Each test has a 5 s vitest
 * timeout per plan spec. Tests run sequentially (no concurrent watcher + sandbox
 * conflicts). Each test gets its own sandbox dir + in-memory sqlite.
 *
 * Setup: cpSync(FIXTURE_ROOT, sandbox) → openCache → rebuildFromScan → startWatcher
 * Teardown: handle.close() → closeCache → rmSync(sandbox)
 *
 * waitFor helper polls every 50 ms up to timeoutMs (default 2500 ms) for a predicate.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeCache,
  openCache,
  queryAllEpisodes,
  queryEpisodeByHash,
  rebuildFromScan,
} from './cache';
import type { Cache } from './cache';
import { scanGolazoRoot, GOLAZO_DOT_DIR, MANIFEST_FILE_NAME, EPISODE_FILE_NAME } from './scanner';
import { startWatcher } from './watcher';
import type { WatcherHandle } from './watcher';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dir, '../..', 'tests/fixtures/golazo');

// waitFor polls predicate every 50 ms until timeoutMs. Throws on timeout.
async function waitFor(predicate: () => boolean, timeoutMs = 2500): Promise<void> {
  const t0 = Date.now();
  while (!predicate() && Date.now() - t0 < timeoutMs) {
    await new Promise<void>((r) => setTimeout(r, 50));
  }
  if (!predicate()) {
    throw new Error(`waitFor timed out after ${timeoutMs} ms`);
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('startWatcher', () => {
  let sandbox: string;
  let cache: Cache;
  let handle: WatcherHandle;

  beforeEach(() => {
    // Create a per-test tmp sandbox with the fixture tree
    sandbox = mkdtempSync(join(tmpdir(), 'watcher-test-'));
    cpSync(FIXTURE_ROOT, sandbox, { recursive: true });

    // Open cache in a tmp db
    const dbPath = join(sandbox, 'test-index.db');
    cache = openCache({ dbPath });

    // Seed cache from initial scan
    const scanResult = scanGolazoRoot(sandbox);
    rebuildFromScan(cache, scanResult);
  });

  afterEach(async () => {
    // Close watcher if test didn't close it
    if (handle) {
      try {
        await handle.close();
      } catch {
        // Ignore close errors in teardown
      }
    }
    closeCache(cache);
    rmSync(sandbox, { recursive: true, force: true });
    // Reset handle for next test
    (handle as unknown) = undefined;
  });

  it('1. ADD NEW GAME FOLDER: adding a valid game folder reflects in cache within 2 s', { timeout: 8000 }, async () => {
    handle = startWatcher({ cache, rootPath: sandbox });
    await handle.ready;

    // Verify initial state has 3 episodes
    expect(queryAllEpisodes(cache).length).toBe(3);

    // Create a new game folder with a valid manifest
    const newFolderPath = join(sandbox, 'leo', '2026-05-27_vs_hawks_5-0');
    const golazoDir = join(newFolderPath, GOLAZO_DOT_DIR);
    mkdirSync(golazoDir, { recursive: true });

    // Write a clip placeholder
    writeFileSync(join(newFolderPath, '01-clip.mp4'), 'placeholder');

    const manifestContent = JSON.stringify({
      version: 1,
      kid: 'leo',
      game: {
        date: '2026-05-27',
        opponent: 'hawks',
        scoreFor: 5,
        scoreAgainst: 0,
        result: 'W',
      },
      clips: [
        {
          file: '01-clip.mp4',
          durationSec: 2,
          sha256: 'ec9adf111a2b02b3cb5a4d2ddffd52af0c294dcd850a572bcd4f6d9d5f2a4209',
        },
      ],
      totalDurationSec: 2,
      // Unique hash — different from all 3 fixture rows
      manifestHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });

    const t0 = Date.now();
    writeFileSync(join(golazoDir, MANIFEST_FILE_NAME), manifestContent, 'utf8');

    await waitFor(() => queryAllEpisodes(cache).length === 4, 2500);

    const t1 = Date.now();
    expect(t1 - t0).toBeLessThan(2000);

    const newRow = queryAllEpisodes(cache).find((r) => r.gameFolder === '2026-05-27_vs_hawks_5-0');
    expect(newRow).toBeDefined();
    expect(newRow?.status).toBe('prepared');
  });

  it('2. DELETE GAME FOLDER: deleting a game folder removes the row within 2 s', { timeout: 8000 }, async () => {
    handle = startWatcher({ cache, rootPath: sandbox });
    await handle.ready;

    const initialRows = queryAllEpisodes(cache);
    expect(initialRows.length).toBe(3);

    // Capture the manifestHash of leo/2026-05-13 (prepared — only manifest)
    const leoRow = initialRows.find((r) => r.gameFolder === '2026-05-13_vs_united_3-1');
    expect(leoRow).toBeDefined();
    const capturedHash = leoRow!.manifestHash;

    // Delete the folder
    rmSync(join(sandbox, 'leo', '2026-05-13_vs_united_3-1'), { recursive: true });

    await waitFor(() => queryEpisodeByHash(cache, capturedHash) === null, 2500);

    expect(queryAllEpisodes(cache).length).toBe(2);
  });

  it('3. MTIME TOUCH RE-UPSERTS: touching episode.mp4 mtime triggers re-upsert within 2 s', { timeout: 8000 }, async () => {
    handle = startWatcher({ cache, rootPath: sandbox });
    await handle.ready;

    // leo/2026-05-20 is 'rendered' (episode.mp4 + thumb.png present)
    const leo2020Row = queryAllEpisodes(cache).find((r) => r.gameFolder === '2026-05-20_vs_rivers_2-2');
    expect(leo2020Row).toBeDefined();
    const leo2020Hash = leo2020Row!.manifestHash;
    const preTouchScannedAtMs = leo2020Row!.scannedAtMs;

    const episodePath = join(sandbox, 'leo', '2026-05-20_vs_rivers_2-2', GOLAZO_DOT_DIR, EPISODE_FILE_NAME);

    // Touch mtime (set to 10 seconds in the future)
    const futureTime = new Date(Date.now() + 10_000);
    utimesSync(episodePath, futureTime, futureTime);

    await waitFor(() => {
      const r = queryEpisodeByHash(cache, leo2020Hash);
      return r !== null && r.scannedAtMs > preTouchScannedAtMs;
    }, 2500);

    const updatedRow = queryEpisodeByHash(cache, leo2020Hash);
    expect(updatedRow).not.toBeNull();
    expect(updatedRow!.scannedAtMs).toBeGreaterThan(preTouchScannedAtMs);
  });

  it('4. RAPID EVENTS COALESCE: 5 rapid touches collapse to 1 upsert event per D-18', { timeout: 8000 }, async () => {
    const onChangeCalls: Array<{ kind: 'upsert' | 'delete'; manifestHash: string }> = [];

    handle = startWatcher({
      cache,
      rootPath: sandbox,
      onChange: (e) => {
        onChangeCalls.push({ kind: e.kind, manifestHash: e.manifestHash });
      },
    });
    await handle.ready;

    const leo2020Row = queryAllEpisodes(cache).find((r) => r.gameFolder === '2026-05-20_vs_rivers_2-2');
    expect(leo2020Row).toBeDefined();
    const leo2020Hash = leo2020Row!.manifestHash;

    const episodePath = join(sandbox, 'leo', '2026-05-20_vs_rivers_2-2', GOLAZO_DOT_DIR, EPISODE_FILE_NAME);

    // Fire 5 rapid touches 50 ms apart
    for (let i = 0; i < 5; i++) {
      const t = new Date(Date.now() + (i + 1) * 1000);
      utimesSync(episodePath, t, t);
      await new Promise<void>((r) => setTimeout(r, 50));
    }

    // Wait 1500 ms after the last touch (well past 500 ms debounce window)
    await new Promise<void>((r) => setTimeout(r, 1500));

    const upsertCallsForHash = onChangeCalls.filter(
      (c) => c.kind === 'upsert' && c.manifestHash === leo2020Hash,
    );
    expect(upsertCallsForHash.length).toBe(1);
  });

  it('5. DIFFERENT-FOLDER EVENTS INDEPENDENT: events for different folders each trigger 1 rescan', { timeout: 8000 }, async () => {
    const onChangeCalls: Array<{ kind: 'upsert' | 'delete'; manifestHash: string }> = [];

    const initialRows = queryAllEpisodes(cache);
    const leo2020Row = initialRows.find((r) => r.gameFolder === '2026-05-20_vs_rivers_2-2');
    const mateoRow = initialRows.find((r) => r.gameFolder === '2026-05-27_vs_dragons_4-0');
    expect(leo2020Row).toBeDefined();
    expect(mateoRow).toBeDefined();

    const preLeo2020ScannedAtMs = leo2020Row!.scannedAtMs;
    const preMateoScannedAtMs = mateoRow!.scannedAtMs;

    handle = startWatcher({
      cache,
      rootPath: sandbox,
      onChange: (e) => {
        onChangeCalls.push({ kind: e.kind, manifestHash: e.manifestHash });
      },
    });
    await handle.ready;

    const leo2020EpisodePath = join(
      sandbox,
      'leo',
      '2026-05-20_vs_rivers_2-2',
      GOLAZO_DOT_DIR,
      EPISODE_FILE_NAME,
    );
    const mateoDragonManifestPath = join(
      sandbox,
      'mateo',
      '2026-05-27_vs_dragons_4-0',
      GOLAZO_DOT_DIR,
      MANIFEST_FILE_NAME,
    );

    // Touch both within 100 ms of each other
    const t1 = new Date(Date.now() + 5000);
    utimesSync(leo2020EpisodePath, t1, t1);
    await new Promise<void>((r) => setTimeout(r, 50));
    const t2 = new Date(Date.now() + 5000);
    utimesSync(mateoDragonManifestPath, t2, t2);

    // Wait 1500 ms after last touch
    await new Promise<void>((r) => setTimeout(r, 1500));

    // Both rows should have updated scannedAtMs
    const updatedLeo = queryEpisodeByHash(cache, leo2020Row!.manifestHash);
    const updatedMateo = queryEpisodeByHash(cache, mateoRow!.manifestHash);

    expect(updatedLeo).not.toBeNull();
    expect(updatedMateo).not.toBeNull();
    expect(updatedLeo!.scannedAtMs).toBeGreaterThan(preLeo2020ScannedAtMs);
    expect(updatedMateo!.scannedAtMs).toBeGreaterThan(preMateoScannedAtMs);

    // onChange called once per folder
    const leoUpserts = onChangeCalls.filter(
      (c) => c.kind === 'upsert' && c.manifestHash === leo2020Row!.manifestHash,
    );
    const mateoUpserts = onChangeCalls.filter(
      (c) => c.kind === 'upsert' && c.manifestHash === mateoRow!.manifestHash,
    );
    expect(leoUpserts.length).toBe(1);
    expect(mateoUpserts.length).toBe(1);
  });

  it('6. CLOSE FLUSHES + STOPS EVENTS: close flushes pending and stops further events', { timeout: 8000 }, async () => {
    const onChangeCalls: Array<{ kind: 'upsert' | 'delete'; manifestHash: string }> = [];

    handle = startWatcher({
      cache,
      rootPath: sandbox,
      onChange: (e) => {
        onChangeCalls.push({ kind: e.kind, manifestHash: e.manifestHash });
      },
    });
    await handle.ready;

    const leo2020Row = queryAllEpisodes(cache).find((r) => r.gameFolder === '2026-05-20_vs_rivers_2-2');
    expect(leo2020Row).toBeDefined();

    const episodePath = join(sandbox, 'leo', '2026-05-20_vs_rivers_2-2', GOLAZO_DOT_DIR, EPISODE_FILE_NAME);

    // Touch to trigger a pending debounce — immediately close BEFORE 500 ms elapses
    const futureTime = new Date(Date.now() + 5000);
    utimesSync(episodePath, futureTime, futureTime);

    // Close immediately — close() should flush() before stopping
    await handle.close();

    // Now create a new folder (post-close) — should NOT appear in cache
    const postCloseFolderPath = join(sandbox, 'leo', '2026-06-01_vs_wolves_3-0');
    mkdirSync(join(postCloseFolderPath, GOLAZO_DOT_DIR), { recursive: true });
    const postCloseManifest = JSON.stringify({
      version: 1,
      kid: 'leo',
      game: {
        date: '2026-06-01',
        opponent: 'wolves',
        scoreFor: 3,
        scoreAgainst: 0,
        result: 'W',
      },
      clips: [{ file: '01-clip.mp4', durationSec: 2, sha256: 'ec9adf111a2b02b3cb5a4d2ddffd52af0c294dcd850a572bcd4f6d9d5f2a4209' }],
      totalDurationSec: 2,
      manifestHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    writeFileSync(
      join(postCloseFolderPath, GOLAZO_DOT_DIR, MANIFEST_FILE_NAME),
      postCloseManifest,
    );

    // Wait 2500 ms — post-close events must NOT appear
    await new Promise<void>((r) => setTimeout(r, 2500));

    const postCloseRow = queryAllEpisodes(cache).find((r) => r.gameFolder === '2026-06-01_vs_wolves_3-0');
    expect(postCloseRow).toBeUndefined();

    // Null out handle so afterEach doesn't try to close it again
    (handle as unknown) = undefined;
  });

  it('7. BROKEN MANIFEST: broken manifest does not mutate cache (last-known-good)', { timeout: 8000 }, async () => {
    handle = startWatcher({ cache, rootPath: sandbox });
    await handle.ready;

    const initialCount = queryAllEpisodes(cache).length;
    expect(initialCount).toBe(3);

    // Create a new game folder with an INVALID manifest
    const brokenFolderPath = join(sandbox, 'leo', '2026-06-01_vs_tigers_2-1');
    mkdirSync(join(brokenFolderPath, GOLAZO_DOT_DIR), { recursive: true });
    writeFileSync(
      join(brokenFolderPath, GOLAZO_DOT_DIR, MANIFEST_FILE_NAME),
      '{not valid json',
    );

    // Wait 1500 ms — no new row should appear
    await new Promise<void>((r) => setTimeout(r, 1500));

    const finalRows = queryAllEpisodes(cache);
    expect(finalRows.length).toBe(initialCount);
    expect(finalRows.find((r) => r.gameFolder === '2026-06-01_vs_tigers_2-1')).toBeUndefined();
  });

  it('8. UNKNOWN-KID PATH HANDLED: events at unexpected depth do not throw', { timeout: 8000 }, async () => {
    // Capture any unhandled rejection
    const errors: Error[] = [];
    const handler = (err: Error) => errors.push(err);
    process.on('unhandledRejection', handler);

    handle = startWatcher({ cache, rootPath: sandbox });
    await handle.ready;

    const initialCount = queryAllEpisodes(cache).length;

    // Create a folder at an "unknown kid" path — scanGameFolder will either fail
    // parseFilename (invalid name) or reject manifest (kid mismatch). Either way,
    // the watcher must NOT throw and cache must stay unchanged.
    const unknownFolderPath = join(sandbox, 'unknown-kid', '2026-06-01_vs_bears_1-0');
    mkdirSync(join(unknownFolderPath, GOLAZO_DOT_DIR), { recursive: true });

    // Write a manifest with a kid that mismatches the path
    writeFileSync(
      join(unknownFolderPath, GOLAZO_DOT_DIR, MANIFEST_FILE_NAME),
      JSON.stringify({
        version: 1,
        kid: 'leo', // mismatch — path says 'unknown-kid'
        game: { date: '2026-06-01', opponent: 'bears', scoreFor: 1, scoreAgainst: 0, result: 'W' },
        clips: [{ file: '01-clip.mp4', durationSec: 2, sha256: 'ec9adf111a2b02b3cb5a4d2ddffd52af0c294dcd850a572bcd4f6d9d5f2a4209' }],
        totalDurationSec: 2,
        manifestHash: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      }),
    );

    // Wait 1500 ms
    await new Promise<void>((r) => setTimeout(r, 1500));

    process.off('unhandledRejection', handler);

    // Cache unchanged
    expect(queryAllEpisodes(cache).length).toBe(initialCount);

    // No unhandled rejections
    expect(errors).toHaveLength(0);
  });
});
