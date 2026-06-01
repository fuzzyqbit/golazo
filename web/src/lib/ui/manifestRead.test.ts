/**
 * manifestRead.test.ts — unit tests for readManifestFromRow helper.
 *
 * Tests: happy path against committed fixture, missing folder throws, corrupt JSON throws.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { readManifestFromRow, ManifestReadError } from './manifestRead';
import type { EpisodeIndex } from '../episodeIndex';

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(__dir, '../../../tests/fixtures/golazo');

// ---------------------------------------------------------------------------
// Build a minimal EpisodeIndex row for testing
// ---------------------------------------------------------------------------

function makeRow(absFolderPath: string): EpisodeIndex {
  return {
    manifestHash: 'sha256:' + 'a'.repeat(64),
    kid: 'leo',
    gameFolder: '2026-05-13_vs_united_3-1',
    absFolderPath,
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
    scannedAtMs: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('readManifestFromRow', () => {
  // Case 1: happy path — committed leo/united fixture
  it('Case 1: returns parsed manifest for a valid fixture row', () => {
    const absFolderPath = join(FIXTURE_ROOT, 'leo', '2026-05-13_vs_united_3-1');
    const row = makeRow(absFolderPath);

    const manifest = readManifestFromRow(row);

    expect(manifest.manifestHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(manifest.kid).toBe('leo');
    expect(manifest.clips.length).toBe(3);
    expect(manifest.clips[0]).toMatchObject({
      file: '01-clip.mp4',
      durationSec: 2,
    });
    expect(manifest.game.opponent).toBe('united');
  });

  // Case 2: missing folder — throws ManifestReadError
  it('Case 2: throws ManifestReadError when folder does not exist', () => {
    const absFolderPath = join(FIXTURE_ROOT, 'leo', 'nonexistent-game-folder');
    const row = makeRow(absFolderPath);

    expect(() => readManifestFromRow(row)).toThrow(ManifestReadError);
  });

  // Case 3: corrupt JSON — throws ManifestReadError
  it('Case 3: throws ManifestReadError when manifest.json has corrupt JSON', () => {
    const tmpDir = join(tmpdir(), `manifestRead-test-${randomUUID()}`);
    const golazoDir = join(tmpDir, '.golazo');
    mkdirSync(golazoDir, { recursive: true });
    writeFileSync(join(golazoDir, 'manifest.json'), '{ this is not valid json }', 'utf8');

    const row = makeRow(tmpDir);

    try {
      expect(() => readManifestFromRow(row)).toThrow(ManifestReadError);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Case 4: invalid schema (valid JSON but fails zod) — throws ManifestReadError
  it('Case 4: throws ManifestReadError when manifest.json fails schema validation', () => {
    const tmpDir = join(tmpdir(), `manifestRead-schema-${randomUUID()}`);
    const golazoDir = join(tmpDir, '.golazo');
    mkdirSync(golazoDir, { recursive: true });
    writeFileSync(join(golazoDir, 'manifest.json'), JSON.stringify({ version: 999, bad: true }), 'utf8');

    const row = makeRow(tmpDir);

    try {
      expect(() => readManifestFromRow(row)).toThrow(ManifestReadError);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
