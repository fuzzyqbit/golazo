/**
 * publishRead.test.ts — unit tests for readPublishFromRow helper.
 *
 * Tests: happy path against committed fixture, missing publish.json returns null,
 * corrupt publish.json returns null (never throws).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { readPublishFromRow } from './publishRead';
import type { EpisodeIndex } from '../episodeIndex';

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(__dir, '../../../tests/fixtures/golazo');

// ---------------------------------------------------------------------------
// Build a minimal EpisodeIndex row for testing
// ---------------------------------------------------------------------------

function makeRow(absFolderPath: string, kid = 'mateo'): EpisodeIndex {
  return {
    manifestHash: 'sha256:' + 'b'.repeat(64),
    kid,
    gameFolder: '2026-05-27_vs_dragons_4-0',
    absFolderPath,
    date: '2026-05-27',
    opponent: 'dragons',
    scoreFor: 4,
    scoreAgainst: 0,
    result: 'W',
    status: 'published',
    thumbAbsPath: null,
    episodeAbsPath: null,
    publishVideoId: 'dQw4w9WgXcQ',
    publishWatchUrl: 'https://youtu.be/dQw4w9WgXcQ',
    clipCount: 1,
    scannedAtMs: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('readPublishFromRow', () => {
  // Case 1: happy path — committed mateo/dragons fixture (has publish.json)
  it('Case 1: returns parsed publish record for fixture with publish.json', () => {
    const absFolderPath = join(FIXTURE_ROOT, 'mateo', '2026-05-27_vs_dragons_4-0');
    const row = makeRow(absFolderPath);

    const result = readPublishFromRow(row);

    expect(result).not.toBeNull();
    expect(result!.videoId).toBe('dQw4w9WgXcQ');
    expect(result!.watchUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(result!.uploadedAt).toBe('2026-05-28T10:30:00.000Z');
    expect(result!.channelId).toBe('UCfixturefixturefixture99');
    expect(result!.privacyStatus).toBe('unlisted');
  });

  // Case 2: no publish.json — returns null (NOT a throw)
  it('Case 2: returns null when publish.json does not exist', () => {
    // leo/united has no publish.json
    const absFolderPath = join(FIXTURE_ROOT, 'leo', '2026-05-13_vs_united_3-1');
    const row = makeRow(absFolderPath, 'leo');

    const result = readPublishFromRow(row);

    expect(result).toBeNull();
  });

  // Case 3: corrupt JSON in publish.json — returns null (never throws), logs to stderr
  it('Case 3: returns null when publish.json has corrupt JSON (no throw)', () => {
    const tmpDir = join(tmpdir(), `publishRead-test-${randomUUID()}`);
    const golazoDir = join(tmpDir, '.golazo');
    mkdirSync(golazoDir, { recursive: true });
    writeFileSync(join(golazoDir, 'publish.json'), '{ corrupt json }', 'utf8');

    const row = makeRow(tmpDir);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const result = readPublishFromRow(row);
      expect(result).toBeNull();
      // Should have logged to stderr
      expect(consoleSpy).toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Case 4: valid JSON but fails schema — returns null
  it('Case 4: returns null when publish.json has invalid schema (not unlisted)', () => {
    const tmpDir = join(tmpdir(), `publishRead-schema-${randomUUID()}`);
    const golazoDir = join(tmpDir, '.golazo');
    mkdirSync(golazoDir, { recursive: true });
    const badRecord = {
      videoId: 'someId',
      watchUrl: 'https://youtu.be/someId',
      uploadedAt: '2026-05-01T00:00:00.000Z',
      channelId: 'UCsomeChannelId',
      privacyStatus: 'public', // invalid — must be 'unlisted'
    };
    writeFileSync(join(golazoDir, 'publish.json'), JSON.stringify(badRecord), 'utf8');

    const row = makeRow(tmpDir);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const result = readPublishFromRow(row);
      expect(result).toBeNull();
    } finally {
      consoleSpy.mockRestore();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
