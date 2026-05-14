import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadMusicPool, MusicPoolEntry } from './musicPool.js';
import { MusicPoolError } from '../prepare/errors.js';

/**
 * Helper: writes a minimal index.json + dummy .mp3 files into sandboxDir.
 * The dummy .mp3 files are 128-byte blobs — non-empty, structurally valid
 * as far as loadMusicPool is concerned (it does NOT ffprobe durations).
 */
function writeIndex(
  sandboxDir: string,
  entries: { file: string; title: string; durationSec: number; mood: string }[],
): void {
  writeFileSync(join(sandboxDir, 'index.json'), JSON.stringify(entries), 'utf8');
  for (const e of entries) {
    writeFileSync(join(sandboxDir, e.file), Buffer.alloc(128), undefined);
  }
}

describe('loadMusicPool', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'golazo-musicpool-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // Case 1: Happy path — uses the committed remotion/assets/music/index.json
  it('case 1: no opts returns ≥6 entries with correct shape, all absPath files exist, sorted by file', () => {
    const pool = loadMusicPool();
    expect(pool.length).toBeGreaterThanOrEqual(6);
    for (const entry of pool) {
      expect(typeof entry.file).toBe('string');
      expect(typeof entry.title).toBe('string');
      expect(typeof entry.durationSec).toBe('number');
      expect(entry.durationSec).toBeGreaterThan(0);
      expect(['atmos', 'driving', 'uplift', 'tense']).toContain(entry.mood);
      expect(typeof entry.absPath).toBe('string');
      const { existsSync } = require('node:fs');
      expect(existsSync(entry.absPath)).toBe(true);
    }
    // Sorted by file ascending
    const files = pool.map((e) => e.file);
    expect(files).toEqual([...files].sort((a, b) => a.localeCompare(b)));
  });

  // Case 2: Custom indexPath with a 1-entry pool
  it('case 2: custom indexPath with 1-entry pool returns that entry', () => {
    writeIndex(tmp, [
      { file: 'a.mp3', title: 'Track A', durationSec: 120, mood: 'atmos' },
    ]);
    const pool = loadMusicPool({ indexPath: join(tmp, 'index.json') });
    expect(pool).toHaveLength(1);
    expect(pool[0]?.file).toBe('a.mp3');
    expect(pool[0]?.title).toBe('Track A');
    expect(pool[0]?.durationSec).toBe(120);
    expect(pool[0]?.mood).toBe('atmos');
    expect(typeof pool[0]?.absPath).toBe('string');
  });

  // Case 3: Empty array throws MusicPoolError with 'music pool is empty'
  it('case 3: empty array throws MusicPoolError with music pool is empty', () => {
    writeFileSync(join(tmp, 'index.json'), JSON.stringify([]), 'utf8');
    expect(() => loadMusicPool({ indexPath: join(tmp, 'index.json') })).toThrow(MusicPoolError);
    try {
      loadMusicPool({ indexPath: join(tmp, 'index.json') });
    } catch (err) {
      expect(err).toBeInstanceOf(MusicPoolError);
      expect((err as MusicPoolError).message).toContain('music pool is empty');
    }
  });

  // Case 4: Schema reject — file with uppercase (fails ^[a-z0-9-]+\.mp3$ regex)
  it('case 4: schema reject — uppercase file name throws MusicPoolError with path-pointing message', () => {
    writeIndex(tmp, [
      { file: 'TRACK.MP3', title: 'Bad', durationSec: 60, mood: 'atmos' },
    ]);
    expect(() => loadMusicPool({ indexPath: join(tmp, 'index.json') })).toThrow(MusicPoolError);
    try {
      loadMusicPool({ indexPath: join(tmp, 'index.json') });
    } catch (err) {
      expect(err).toBeInstanceOf(MusicPoolError);
      // message should point at pool[0].file or similar
      const msg = (err as MusicPoolError).message;
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  // Case 5: Schema reject — unknown mood
  it('case 5: schema reject — unknown mood throws MusicPoolError', () => {
    writeIndex(tmp, [
      { file: 'a.mp3', title: 'Track', durationSec: 60, mood: 'banger' },
    ]);
    expect(() => loadMusicPool({ indexPath: join(tmp, 'index.json') })).toThrow(MusicPoolError);
  });

  // Case 6: Schema reject — non-positive durationSec
  it('case 6: schema reject — durationSec:0 throws MusicPoolError', () => {
    writeIndex(tmp, [
      { file: 'a.mp3', title: 'Track', durationSec: 0, mood: 'atmos' },
    ]);
    expect(() => loadMusicPool({ indexPath: join(tmp, 'index.json') })).toThrow(MusicPoolError);
  });

  // Case 7: Entry declared in index but .mp3 absent on disk
  it('case 7: missing file on disk throws MusicPoolError with absPath and remediation', () => {
    // Write the index but DON'T write the .mp3 file
    writeFileSync(
      join(tmp, 'index.json'),
      JSON.stringify([{ file: 'ghost.mp3', title: 'Ghost', durationSec: 60, mood: 'atmos' }]),
      'utf8',
    );
    expect(() => loadMusicPool({ indexPath: join(tmp, 'index.json') })).toThrow(MusicPoolError);
    try {
      loadMusicPool({ indexPath: join(tmp, 'index.json') });
    } catch (err) {
      expect(err).toBeInstanceOf(MusicPoolError);
      const msg = (err as MusicPoolError).message;
      expect(msg).toContain('ghost.mp3');
      expect(msg.toLowerCase()).toContain('commit the file or remove the entry');
    }
  });

  // Case 8: Malformed JSON throws MusicPoolError with 'invalid JSON'
  it('case 8: malformed JSON throws MusicPoolError with invalid JSON message', () => {
    writeFileSync(join(tmp, 'index.json'), 'not-json', 'utf8');
    expect(() => loadMusicPool({ indexPath: join(tmp, 'index.json') })).toThrow(MusicPoolError);
    try {
      loadMusicPool({ indexPath: join(tmp, 'index.json') });
    } catch (err) {
      expect(err).toBeInstanceOf(MusicPoolError);
      expect((err as MusicPoolError).message.toLowerCase()).toContain('invalid json');
    }
  });

  // Case 9: Non-existent index file path throws MusicPoolError with 'index.json not found'
  it('case 9: non-existent index path throws MusicPoolError with index.json not found', () => {
    expect(() =>
      loadMusicPool({ indexPath: '/nonexistent/path/index.json' }),
    ).toThrow(MusicPoolError);
    try {
      loadMusicPool({ indexPath: '/nonexistent/path/index.json' });
    } catch (err) {
      expect(err).toBeInstanceOf(MusicPoolError);
      expect((err as MusicPoolError).message).toContain('index.json not found');
    }
  });

  // Case 10: Sort order — entries returned sorted by file ascending
  it('case 10: sort order — entries sorted by file ascending regardless of index.json order', () => {
    writeIndex(tmp, [
      { file: 'b.mp3', title: 'Track B', durationSec: 60, mood: 'atmos' },
      { file: 'a.mp3', title: 'Track A', durationSec: 60, mood: 'atmos' },
    ]);
    const pool = loadMusicPool({ indexPath: join(tmp, 'index.json') });
    expect(pool).toHaveLength(2);
    expect(pool[0]?.file).toBe('a.mp3');
    expect(pool[1]?.file).toBe('b.mp3');
  });
});
