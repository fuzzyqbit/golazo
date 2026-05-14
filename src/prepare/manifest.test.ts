import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import {
  buildManifest,
  readManifest,
  writeManifest,
  manifestSchema,
  MANIFEST_SCHEMA_VERSION,
  MANIFEST_FILE_NAME,
  type Manifest,
} from './manifest.js';
import { ManifestError } from './errors.js';
import type { GameMeta } from './types.js';

/**
 * Stable canonical inputs reused across cases. Three clips with distinct
 * sha256 values so manifest-hash reproducibility is genuinely exercised.
 */
const FOLDER_NAME = '2026-05-13_vs_united_3-1';
const GAME_META: GameMeta = {
  date: '2026-05-13',
  opponent: 'united',
  scoreFor: 3,
  scoreAgainst: 1,
  result: 'W',
};
const KID = 'leo';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const CLIPS = [
  { file: '01-clip.mp4', durationSec: 2.0, sha256: SHA_A },
  { file: '02-clip.mp4', durationSec: 2.0, sha256: SHA_B },
  { file: '03-clip.mp4', durationSec: 2.0, sha256: SHA_C },
];

/**
 * Independently recompute the expected manifestHash using the canonical
 * input contract pinned in Plan 04 (see src/prepare/hash.ts JSDoc): the
 * input is `folderName + '\n' + sorted "file:sha256" lines`, prefixed with
 * `sha256:`. This duplicates the contract on the assertion side so any
 * accidental mutation of the formula in `buildManifest` surfaces here too.
 */
function recomputeManifestHash(
  folderName: string,
  pairs: { file: string; sha256: string }[],
): string {
  const sorted = pairs.slice().sort((a, b) => a.file.localeCompare(b.file));
  const lines = sorted.map((p) => `${p.file}:${p.sha256}`);
  const canonical = `${folderName}\n${lines.join('\n')}`;
  const hex = createHash('sha256').update(canonical).digest('hex');
  return `sha256:${hex}`;
}

describe('manifest — buildManifest', () => {
  it('case 1: happy path returns a Manifest with v1, summed totalDurationSec, and the canonical manifestHash', () => {
    const m = buildManifest({
      folderName: FOLDER_NAME,
      kid: KID,
      gameMeta: GAME_META,
      clips: CLIPS,
    });

    expect(m.version).toBe(1);
    expect(m.kid).toBe(KID);
    expect(m.game).toEqual(GAME_META);
    expect(m.clips).toHaveLength(3);
    expect(m.totalDurationSec).toBeCloseTo(6.0, 3);
    expect(m.manifestHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const expectedHash = recomputeManifestHash(
      FOLDER_NAME,
      CLIPS.map((c) => ({ file: c.file, sha256: c.sha256 })),
    );
    expect(m.manifestHash).toBe(expectedHash);
  });

  it('case 2: empty clips array throws ManifestError before zod', () => {
    expect(() =>
      buildManifest({
        folderName: FOLDER_NAME,
        kid: KID,
        gameMeta: GAME_META,
        clips: [],
      }),
    ).toThrow(ManifestError);
    try {
      buildManifest({
        folderName: FOLDER_NAME,
        kid: KID,
        gameMeta: GAME_META,
        clips: [],
      });
    } catch (err) {
      const e = err as ManifestError;
      expect(e.field).toBe('clips');
      expect(e.reason).toMatch(/at least one clip/i);
      expect(e.remediation).toMatch(/NN-\*\.mp4/);
    }
  });
});

describe('manifest — write / read round-trip', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'golazo-manifest-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('case 3: writeManifest creates .golazo/ and the file round-trips via readManifest', () => {
    const m = buildManifest({
      folderName: FOLDER_NAME,
      kid: KID,
      gameMeta: GAME_META,
      clips: CLIPS,
    });

    writeManifest(tmp, m);

    const dirPath = join(tmp, '.golazo');
    const filePath = join(tmp, MANIFEST_FILE_NAME);
    expect(existsSync(dirPath)).toBe(true);
    expect(existsSync(filePath)).toBe(true);

    const round = readManifest(tmp);
    expect(round).not.toBeNull();
    // Deep equality (JSON survives round-trip with no precision loss for our
    // 3-decimal fixed durations).
    expect(round).toEqual(m);
  });

  it('case 4: writeManifest emits 2-space indentation and a trailing newline', () => {
    const m = buildManifest({
      folderName: FOLDER_NAME,
      kid: KID,
      gameMeta: GAME_META,
      clips: CLIPS,
    });
    writeManifest(tmp, m);

    const raw = readFileSync(join(tmp, MANIFEST_FILE_NAME), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    // 2-space indent: the second line of JSON.stringify(..., 2) starts with
    // exactly 2 spaces. (First line is `{`.)
    const lines = raw.split('\n');
    expect(lines[1]?.startsWith('  ')).toBe(true);
    expect(lines[1]?.startsWith('   ')).toBe(false);
  });

  it('case 5: readManifest returns null when the file does not exist', () => {
    const result = readManifest(tmp);
    expect(result).toBeNull();
  });

  it('case 6: readManifest throws ManifestError on malformed JSON, message names the file path with remediation', () => {
    const dir = join(tmp, '.golazo');
    mkdirSync(dir, { recursive: true });
    const file = join(tmp, MANIFEST_FILE_NAME);
    writeFileSync(file, '{not valid json', 'utf8');

    expect(() => readManifest(tmp)).toThrow(ManifestError);
    try {
      readManifest(tmp);
    } catch (err) {
      const e = err as ManifestError;
      expect(e.message).toContain('manifest.json');
      expect(e.remediation).toContain("rerun 'golazo prepare'");
    }
  });

  it('case 6b: readManifest throws ManifestError on a JSON file that fails zod validation', () => {
    const dir = join(tmp, '.golazo');
    mkdirSync(dir, { recursive: true });
    const file = join(tmp, MANIFEST_FILE_NAME);
    // Valid JSON, invalid schema (missing required fields).
    writeFileSync(file, JSON.stringify({ version: 1, kid: 'leo' }), 'utf8');

    expect(() => readManifest(tmp)).toThrow(ManifestError);
    try {
      readManifest(tmp);
    } catch (err) {
      const e = err as ManifestError;
      expect(e.field.length).toBeGreaterThan(0);
      expect(e.remediation).toContain("rerun 'golazo prepare'");
    }
  });

  it('case 7: round-trip preserves manifestHash (build → write → read → rebuild → same hash)', () => {
    const m1 = buildManifest({
      folderName: FOLDER_NAME,
      kid: KID,
      gameMeta: GAME_META,
      clips: CLIPS,
    });
    writeManifest(tmp, m1);
    const onDisk = readManifest(tmp);
    expect(onDisk).not.toBeNull();

    const m2 = buildManifest({
      folderName: FOLDER_NAME,
      kid: KID,
      gameMeta: GAME_META,
      clips: CLIPS,
    });
    expect(m2.manifestHash).toBe(m1.manifestHash);
    expect((onDisk as Manifest).manifestHash).toBe(m1.manifestHash);
  });
});

describe('manifest — schema rejection cases', () => {
  it('case 8: schema rejects version: 2', () => {
    const bad = {
      version: 2,
      kid: KID,
      game: GAME_META,
      clips: CLIPS,
      totalDurationSec: 6,
      manifestHash: `sha256:${'0'.repeat(64)}`,
    };
    expect(manifestSchema.safeParse(bad).success).toBe(false);
  });

  it('case 9: schema rejects clip entry with non-hex sha256', () => {
    const bad = {
      version: 1,
      kid: KID,
      game: GAME_META,
      clips: [{ file: '01-clip.mp4', durationSec: 2, sha256: 'not-hex' }],
      totalDurationSec: 2,
      manifestHash: `sha256:${'0'.repeat(64)}`,
    };
    expect(manifestSchema.safeParse(bad).success).toBe(false);
  });

  it('case 10: schema rejects negative scoreFor', () => {
    const bad = {
      version: 1,
      kid: KID,
      game: { ...GAME_META, scoreFor: -1 },
      clips: CLIPS,
      totalDurationSec: 6,
      manifestHash: `sha256:${'0'.repeat(64)}`,
    };
    expect(manifestSchema.safeParse(bad).success).toBe(false);
  });
});

describe('manifest — exported constants', () => {
  it('MANIFEST_SCHEMA_VERSION === 1', () => {
    expect(MANIFEST_SCHEMA_VERSION).toBe(1);
  });

  it("MANIFEST_FILE_NAME === '.golazo/manifest.json'", () => {
    expect(MANIFEST_FILE_NAME).toBe('.golazo/manifest.json');
  });
});
