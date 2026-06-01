/**
 * Table-driven tests for scanGolazoRoot (Phase 6 Plan 01 — DISC-01, DISC-02, DISC-05).
 *
 * The committed fixture under web/tests/fixtures/golazo/ covers all three statuses
 * plus the broken-folder-name DISC-05 case. Sandbox helpers (cpSync + tmpdir) are
 * used for destructive cases (overwriting manifests, adding folders) so the fixture
 * tree stays unchanged across runs.
 *
 * Test count: 13 scanner cases + 3 warningBag cases (separate file) = 16 Phase 6 Plan 01 tests.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scanGolazoRoot } from './scanner';

// Resolve the committed fixture root relative to this test file.
// This file lives at web/src/lib/scanner.test.ts.
// Two levels up (../.. ) reaches web/, then we go to tests/fixtures/golazo/.
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_ROOT = join(__dirname, '../..', 'tests/fixtures/golazo');

// ---------------------------------------------------------------------------
// Sandbox helpers
// ---------------------------------------------------------------------------

const sandboxes: string[] = [];

function makeSandbox(): string {
  const dir = join(tmpdir(), 'golazo-scan-test-' + randomUUID());
  mkdirSync(dir, { recursive: true });
  cpSync(FIXTURE_ROOT, dir, { recursive: true });
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('scanGolazoRoot', () => {
  /**
   * Case 1: HAPPY PATH — 3 valid games + 1 broken folder.
   * Uses the committed fixture directly (read-only).
   */
  it('returns 3 episodes and 1 broken-folder warning from the committed fixture', () => {
    // Act
    const result = scanGolazoRoot(FIXTURE_ROOT);

    // Assert
    expect(result.episodes).toHaveLength(3);
    expect(result.warnings.brokenFolders).toHaveLength(1);
    expect(result.warnings.invalidManifests).toHaveLength(0);
    expect(result.warnings.invalidPublishRecords).toHaveLength(0);
  });

  /**
   * Case 2: STATUS = 'prepared' — leo/2026-05-13_vs_united_3-1 has manifest only.
   */
  it("leo/2026-05-13 row has status 'prepared' with null episode/thumb/publish fields", () => {
    // Act
    const result = scanGolazoRoot(FIXTURE_ROOT);
    const row = result.episodes.find(
      (e) => e.gameFolder === '2026-05-13_vs_united_3-1' && e.kid === 'leo',
    );

    // Assert
    expect(row).toBeDefined();
    expect(row!.status).toBe('prepared');
    expect(row!.episodeAbsPath).toBeNull();
    expect(row!.thumbAbsPath).toBeNull();
    expect(row!.publishVideoId).toBeNull();
    expect(row!.publishWatchUrl).toBeNull();
    expect(row!.clipCount).toBe(3);
    expect(row!.kid).toBe('leo');
    expect(row!.date).toBe('2026-05-13');
    expect(row!.opponent).toBe('united');
    expect(row!.scoreFor).toBe(3);
    expect(row!.scoreAgainst).toBe(1);
    expect(row!.result).toBe('W');
  });

  /**
   * Case 3: STATUS = 'rendered' — leo/2026-05-20_vs_rivers_2-2 has manifest + episode + thumb.
   */
  it("leo/2026-05-20 row has status 'rendered' with episode+thumb paths but null publish fields", () => {
    // Act
    const result = scanGolazoRoot(FIXTURE_ROOT);
    const row = result.episodes.find(
      (e) => e.gameFolder === '2026-05-20_vs_rivers_2-2' && e.kid === 'leo',
    );

    // Assert
    expect(row).toBeDefined();
    expect(row!.status).toBe('rendered');
    expect(row!.episodeAbsPath).toMatch(/\/\.golazo\/episode\.mp4$/);
    expect(row!.thumbAbsPath).toMatch(/\/\.golazo\/thumb\.png$/);
    expect(row!.publishVideoId).toBeNull();
    expect(row!.publishWatchUrl).toBeNull();
    expect(row!.date).toBe('2026-05-20');
    expect(row!.opponent).toBe('rivers');
    expect(row!.scoreFor).toBe(2);
    expect(row!.scoreAgainst).toBe(2);
    expect(row!.result).toBe('D');
  });

  /**
   * Case 4: STATUS = 'published' — mateo/2026-05-27_vs_dragons_4-0 has all four artifacts.
   */
  it("mateo/2026-05-27 row has status 'published' with all fields populated", () => {
    // Act
    const result = scanGolazoRoot(FIXTURE_ROOT);
    const row = result.episodes.find(
      (e) => e.gameFolder === '2026-05-27_vs_dragons_4-0' && e.kid === 'mateo',
    );

    // Assert
    expect(row).toBeDefined();
    expect(row!.status).toBe('published');
    expect(row!.publishVideoId).toBe('dQw4w9WgXcQ');
    expect(row!.publishWatchUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(row!.episodeAbsPath).toMatch(/\/\.golazo\/episode\.mp4$/);
    expect(row!.thumbAbsPath).toMatch(/\/\.golazo\/thumb\.png$/);
    expect(row!.date).toBe('2026-05-27');
    expect(row!.opponent).toBe('dragons');
    expect(row!.scoreFor).toBe(4);
    expect(row!.scoreAgainst).toBe(0);
    expect(row!.result).toBe('W');
  });

  /**
   * Case 5: BROKEN FOLDER NAME — mateo/broken-folder-name appears in brokenFolders.
   */
  it('broken-folder-name appears in brokenFolders with the FilenameError message', () => {
    // Act
    const result = scanGolazoRoot(FIXTURE_ROOT);

    // Assert
    expect(result.warnings.brokenFolders).toHaveLength(1);
    const warning = result.warnings.brokenFolders[0]!;
    expect(warning.absPath).toMatch(/\/mateo\/broken-folder-name$/);
    expect(warning.reason).toMatch(/does not match required pattern/i);

    // Ensure it does not appear in episodes
    const found = result.episodes.find(
      (e) => e.gameFolder === 'broken-folder-name',
    );
    expect(found).toBeUndefined();
  });

  /**
   * Case 6: INVALID MANIFEST (JSON parse failure) — game excluded, warning added.
   */
  it('invalid JSON in manifest.json excludes the game and adds invalidManifests warning', () => {
    // Arrange
    const sandbox = makeSandbox();
    const manifestPath = join(
      sandbox,
      'leo/2026-05-13_vs_united_3-1/.golazo/manifest.json',
    );
    writeFileSync(manifestPath, '{not valid json', 'utf8');

    // Act
    const result = scanGolazoRoot(sandbox);

    // Assert
    const found = result.episodes.find(
      (e) => e.gameFolder === '2026-05-13_vs_united_3-1' && e.kid === 'leo',
    );
    expect(found).toBeUndefined();
    expect(result.warnings.invalidManifests).toHaveLength(1);
    expect(result.warnings.invalidManifests[0]!.absPath).toMatch(
      /\/leo\/2026-05-13_vs_united_3-1$/,
    );
    expect(result.warnings.invalidManifests[0]!.reason).toMatch(/json/i);
  });

  /**
   * Case 7: INVALID MANIFEST (schema failure) — game excluded, zod issue surfaced in warning.
   */
  it('manifest.json that parses but fails schema excludes the game with a zod-reason warning', () => {
    // Arrange
    const sandbox = makeSandbox();
    const manifestPath = join(
      sandbox,
      'leo/2026-05-13_vs_united_3-1/.golazo/manifest.json',
    );
    writeFileSync(manifestPath, '{"version": 99}', 'utf8');

    // Act
    const result = scanGolazoRoot(sandbox);

    // Assert
    const found = result.episodes.find(
      (e) => e.gameFolder === '2026-05-13_vs_united_3-1' && e.kid === 'leo',
    );
    expect(found).toBeUndefined();
    expect(result.warnings.invalidManifests).toHaveLength(1);
    // Zod should report a version-literal or schema issue
    const reason = result.warnings.invalidManifests[0]!.reason;
    expect(reason.length).toBeGreaterThan(0);
  });

  /**
   * Case 8: INVALID PUBLISH.JSON falls back to 'rendered'.
   * Row still appears in episodes with status 'rendered'; warning added.
   */
  it("invalid publish.json falls back to status 'rendered' and adds invalidPublishRecords warning", () => {
    // Arrange
    const sandbox = makeSandbox();
    const publishPath = join(
      sandbox,
      'mateo/2026-05-27_vs_dragons_4-0/.golazo/publish.json',
    );
    writeFileSync(publishPath, '{"videoId":""}', 'utf8'); // fails schema (empty videoId)

    // Act
    const result = scanGolazoRoot(sandbox);

    // Assert
    const row = result.episodes.find(
      (e) => e.gameFolder === '2026-05-27_vs_dragons_4-0' && e.kid === 'mateo',
    );
    expect(row).toBeDefined();
    expect(row!.status).toBe('rendered'); // fell back from published
    expect(row!.publishVideoId).toBeNull();
    expect(row!.episodeAbsPath).toMatch(/\/\.golazo\/episode\.mp4$/);
    expect(result.warnings.invalidPublishRecords).toHaveLength(1);
  });

  /**
   * Case 9: DETERMINISTIC ORDERING — kid asc, date desc, gameFolder asc.
   */
  it('episodes are sorted kid-asc, date-desc, gameFolder-asc deterministically', () => {
    // Act
    const result = scanGolazoRoot(FIXTURE_ROOT);

    // Assert pinned order: leo (newest first: 2026-05-20, then 2026-05-13), then mateo (2026-05-27)
    const folders = result.episodes.map((e) => e.gameFolder);
    expect(folders).toEqual([
      '2026-05-20_vs_rivers_2-2',
      '2026-05-13_vs_united_3-1',
      '2026-05-27_vs_dragons_4-0',
    ]);
  });

  /**
   * Case 10: MISSING MANIFEST = SILENT SKIP.
   * A valid folder name without .golazo/manifest.json yields nothing (not a warning).
   */
  it('folder with valid name but no manifest.json is silently skipped (not a warning)', () => {
    // Arrange
    const sandbox = makeSandbox();
    const newFolder = join(sandbox, 'leo/2026-06-15_vs_eagles_1-0');
    mkdirSync(newFolder, { recursive: true });
    // No .golazo/ dir, no manifest.json

    // Act
    const result = scanGolazoRoot(sandbox);

    // Assert — episode count unchanged (3), no new warnings for this folder
    expect(result.episodes).toHaveLength(3);
    expect(result.warnings.brokenFolders).toHaveLength(1); // only the original broken one
    const found = result.episodes.find((e) => e.gameFolder === '2026-06-15_vs_eagles_1-0');
    expect(found).toBeUndefined();
  });

  /**
   * Case 11: DEEPER SUBDIRS IGNORED — only two levels deep (kid/game).
   */
  it('folders deeper than two levels are ignored', () => {
    // Arrange
    const sandbox = makeSandbox();
    const deeperDir = join(
      sandbox,
      'leo/2026-05-13_vs_united_3-1/subdir/deeper-thing/.golazo',
    );
    mkdirSync(deeperDir, { recursive: true });
    writeFileSync(
      join(deeperDir, 'manifest.json'),
      '{"version":1}',
      'utf8',
    );

    // Act
    const result = scanGolazoRoot(sandbox);

    // Assert — the leo/2026-05-13 row is still present, deeper folder ignored
    expect(result.episodes).toHaveLength(3);
    const leo13 = result.episodes.find(
      (e) => e.gameFolder === '2026-05-13_vs_united_3-1' && e.kid === 'leo',
    );
    expect(leo13).toBeDefined();
  });

  /**
   * Case 12: SCANNED-AT-MS IS RECENT — every row within 5000ms of Date.now().
   */
  it('every EpisodeIndex.scannedAtMs is within 5000ms of Date.now()', () => {
    // Act
    const before = Date.now();
    const result = scanGolazoRoot(FIXTURE_ROOT);
    const after = Date.now();

    // Assert
    for (const ep of result.episodes) {
      expect(ep.scannedAtMs).toBeGreaterThanOrEqual(before - 100);
      expect(ep.scannedAtMs).toBeLessThanOrEqual(after + 100);
    }
  });

  /**
   * Case 13: DETERMINISM ACROSS RUNS — two consecutive scans produce deeply-equal episodes
   * (modulo scannedAtMs which differs by design).
   */
  it('two consecutive scans of unchanged fixture produce deeply-equal episodes (modulo scannedAtMs)', () => {
    // Act
    const result1 = scanGolazoRoot(FIXTURE_ROOT);
    const result2 = scanGolazoRoot(FIXTURE_ROOT);

    // Strip scannedAtMs for comparison
    const strip = (episodes: typeof result1.episodes) =>
      episodes.map(({ scannedAtMs: _, ...rest }) => rest);

    // Assert
    expect(strip(result1.episodes)).toEqual(strip(result2.episodes));
  });
});
