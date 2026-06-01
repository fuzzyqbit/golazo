/**
 * cacheInvalidation tests — Plan 06-02 Task 3.
 *
 * Tests for peekManifestHashFromFile, trackedFileMtimes, and isRowStale.
 * Each test uses a fresh tmpdir to avoid collisions.
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  peekManifestHashFromFile,
  trackedFileMtimes,
  isRowStale,
  TRACKED_FILES,
} from './cacheInvalidation';
import type { EpisodeIndex } from './episodeIndex';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpFolder(): string {
  return mkdtempSync(join(tmpdir(), 'golazo-inv-'));
}

function makeGameFolder(base: string): { folder: string; golazoDir: string } {
  const folder = join(base, 'test-game-folder');
  const golazoDir = join(folder, '.golazo');
  mkdirSync(golazoDir, { recursive: true });
  return { folder, golazoDir };
}

function makeBaseRow(overrides: Partial<EpisodeIndex> = {}): EpisodeIndex {
  return {
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cacheInvalidation', () => {
  // 1. PEEK HAPPY PATH: valid manifest with manifestHash
  it('peekManifestHashFromFile: returns hash from valid manifest.json', () => {
    const base = makeTmpFolder();
    const { folder, golazoDir } = makeGameFolder(base);
    const hash = 'sha256:' + 'a'.repeat(64);

    writeFileSync(join(golazoDir, 'manifest.json'), JSON.stringify({ manifestHash: hash }), 'utf8');

    const result = peekManifestHashFromFile(folder);
    expect(result).toBe(hash);
  });

  // 1b. PEEK HAPPY PATH with whitespace: "manifestHash" : "sha256:..."
  it('peekManifestHashFromFile: handles whitespace around colon', () => {
    const base = makeTmpFolder();
    const { folder, golazoDir } = makeGameFolder(base);
    const hash = 'sha256:' + 'b'.repeat(64);

    writeFileSync(
      join(golazoDir, 'manifest.json'),
      `{\n  "manifestHash" : "${hash}"\n}`,
      'utf8',
    );

    const result = peekManifestHashFromFile(folder);
    expect(result).toBe(hash);
  });

  // 2. PEEK ABSENT FILE: returns null without throwing
  it('peekManifestHashFromFile: returns null for non-existent folder', () => {
    const result = peekManifestHashFromFile('/nonexistent/path/that/does/not/exist');
    expect(result).toBeNull();
  });

  // 3. PEEK NO MATCH: JSON file without manifestHash key
  it('peekManifestHashFromFile: returns null when manifestHash key is absent', () => {
    const base = makeTmpFolder();
    const { folder, golazoDir } = makeGameFolder(base);

    writeFileSync(join(golazoDir, 'manifest.json'), JSON.stringify({ version: 1 }), 'utf8');

    const result = peekManifestHashFromFile(folder);
    expect(result).toBeNull();
  });

  // 4. PEEK PARTIAL HEX: uppercase or too short — regex pins to lowercase 64 hex chars
  it('peekManifestHashFromFile: returns null for invalid hash format (uppercase, short)', () => {
    const base = makeTmpFolder();
    const { folder, golazoDir } = makeGameFolder(base);

    writeFileSync(
      join(golazoDir, 'manifest.json'),
      JSON.stringify({ manifestHash: 'sha256:ABCD' }),
      'utf8',
    );

    const result = peekManifestHashFromFile(folder);
    expect(result).toBeNull();
  });

  // 5. TRACKEDMTIMES MISSING FILES: all 4 values are 0
  it('trackedFileMtimes: returns 0 for all files when folder is empty', () => {
    const base = makeTmpFolder();
    const { folder, golazoDir } = makeGameFolder(base);
    void golazoDir; // directory exists but no tracked files

    const mtimes = trackedFileMtimes(folder);
    expect(mtimes).toHaveLength(TRACKED_FILES.length);
    for (const entry of mtimes) {
      expect(entry.mtimeMs).toBe(0);
    }
  });

  // 6. TRACKEDMTIMES PRESENT FILES: existing files have mtimeMs > 0
  it('trackedFileMtimes: returns mtimeMs > 0 for present files', () => {
    const base = makeTmpFolder();
    const { folder, golazoDir } = makeGameFolder(base);

    // Create manifest.json, episode.mp4, thumb.png (not publish.json)
    writeFileSync(join(golazoDir, 'manifest.json'), '{}', 'utf8');
    writeFileSync(join(golazoDir, 'episode.mp4'), Buffer.alloc(4), 'binary');
    writeFileSync(join(golazoDir, 'thumb.png'), Buffer.alloc(4), 'binary');

    const mtimes = trackedFileMtimes(folder);
    expect(mtimes).toHaveLength(TRACKED_FILES.length);

    // manifest, episode, thumb should have mtimeMs > 0
    const manifestEntry = mtimes.find((m) => m.path.includes('manifest.json'));
    const episodeEntry = mtimes.find((m) => m.path.includes('episode.mp4'));
    const thumbEntry = mtimes.find((m) => m.path.includes('thumb.png'));
    const publishEntry = mtimes.find((m) => m.path.includes('publish.json'));

    expect(manifestEntry?.mtimeMs).toBeGreaterThan(0);
    expect(episodeEntry?.mtimeMs).toBeGreaterThan(0);
    expect(thumbEntry?.mtimeMs).toBeGreaterThan(0);
    expect(publishEntry?.mtimeMs).toBe(0); // absent
  });

  // 7. ISROWSTALE BY HASH: hash mismatch → stale
  it('isRowStale: returns true when disk hash differs from cached hash', () => {
    const cachedRow = makeBaseRow({
      manifestHash: 'sha256:' + 'a'.repeat(64),
      scannedAtMs: 1700000000000,
    });
    const diskManifestHash = 'sha256:' + 'b'.repeat(64); // different
    const trackedMtimes = TRACKED_FILES.map(() => ({ mtimeMs: 1699999999999 })); // all older

    expect(isRowStale({ cachedRow, diskManifestHash, trackedMtimes })).toBe(true);
  });

  // 8. ISROWSTALE BY MTIME: hash matches but one tracked file is newer → stale
  it('isRowStale: returns true when a tracked file is newer than scannedAtMs', () => {
    const cachedRow = makeBaseRow({
      manifestHash: 'sha256:' + 'a'.repeat(64),
      scannedAtMs: 1700000000000,
    });
    const diskManifestHash = 'sha256:' + 'a'.repeat(64); // matches

    // manifest.json is newer by 1ms
    const trackedMtimes = [
      { mtimeMs: 1700000000001 }, // manifest.json — newer than scannedAtMs
      { mtimeMs: 0 },             // episode.mp4
      { mtimeMs: 0 },             // thumb.png
      { mtimeMs: 0 },             // publish.json
    ];

    expect(isRowStale({ cachedRow, diskManifestHash, trackedMtimes })).toBe(true);
  });

  // 9. FRESH ROW: hash matches + all mtimes older → not stale
  it('isRowStale: returns false when hash matches and all mtimes are older', () => {
    const cachedRow = makeBaseRow({
      manifestHash: 'sha256:' + 'a'.repeat(64),
      scannedAtMs: 1700000000000,
    });
    const diskManifestHash = 'sha256:' + 'a'.repeat(64);
    const trackedMtimes = [
      { mtimeMs: 1699999999999 },
      { mtimeMs: 0 },
      { mtimeMs: 0 },
      { mtimeMs: 0 },
    ];

    expect(isRowStale({ cachedRow, diskManifestHash, trackedMtimes })).toBe(false);
  });

  // 10. NULL DISK HASH PROVOKES STALE: null peek → pessimistically stale
  it('isRowStale: returns true when diskManifestHash is null (peek failure)', () => {
    const cachedRow = makeBaseRow({
      manifestHash: 'sha256:' + 'a'.repeat(64),
      scannedAtMs: 1700000000000,
    });
    const trackedMtimes = [
      { mtimeMs: 0 },
      { mtimeMs: 0 },
      { mtimeMs: 0 },
      { mtimeMs: 0 },
    ];

    expect(isRowStale({ cachedRow, diskManifestHash: null, trackedMtimes })).toBe(true);
  });
});
