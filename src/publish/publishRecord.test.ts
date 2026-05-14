/**
 * Tests for publishRecord.ts — on-disk contract for .golazo/publish.json.
 *
 * Cases 1-11: publishRecordSchema, writePublishRecord, readPublishRecord.
 * Mirrors Plan 01-05's manifest.test.ts pattern.
 *
 * Case 6 is the HARD GATE for the project's unlisted-only constraint:
 * verifies the schema cannot accept a 'public' record even if the
 * uploader (Plan 03-03) somehow produced one.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { publishRecordSchema, writePublishRecord, readPublishRecord } from './publishRecord.js';
import { PublishError } from './errors.js';

// ---------------------------------------------------------------------------
// Sandbox management
// ---------------------------------------------------------------------------

let tmpFolder: string | null = null;

afterEach(() => {
  if (tmpFolder) {
    rmSync(tmpFolder, { recursive: true, force: true });
    tmpFolder = null;
  }
});

function makeTmpFolder(): string {
  tmpFolder = mkdtempSync(join(tmpdir(), 'golazo-pr-'));
  return tmpFolder;
}

// ---------------------------------------------------------------------------
// Fixture: a valid publish record
// ---------------------------------------------------------------------------

const VALID_RECORD = {
  videoId: 'abc123',
  watchUrl: 'https://youtu.be/abc123',
  uploadedAt: '2026-05-13T18:00:00.000Z',
  channelId: 'UC_TEST',
  privacyStatus: 'unlisted' as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('publishRecordSchema', () => {
  it('1. SCHEMA HAPPY: parses a valid record', () => {
    const result = publishRecordSchema.parse(VALID_RECORD);
    expect(result.videoId).toBe('abc123');
    expect(result.watchUrl).toBe('https://youtu.be/abc123');
    expect(result.uploadedAt).toBe('2026-05-13T18:00:00.000Z');
    expect(result.channelId).toBe('UC_TEST');
    expect(result.privacyStatus).toBe('unlisted');
  });

  it('2. SCHEMA REJECTS empty videoId', () => {
    expect(() =>
      publishRecordSchema.parse({ ...VALID_RECORD, videoId: '' }),
    ).toThrow();
  });

  it('3. SCHEMA REJECTS watchUrl not starting with https://youtu.be/', () => {
    expect(() =>
      publishRecordSchema.parse({
        ...VALID_RECORD,
        watchUrl: 'https://youtube.com/watch?v=abc123',
      }),
    ).toThrow();
  });

  it('4. SCHEMA REJECTS uploadedAt not ISO datetime', () => {
    expect(() =>
      publishRecordSchema.parse({ ...VALID_RECORD, uploadedAt: '2026-05-13 18:00' }),
    ).toThrow();
  });

  it('5. SCHEMA REJECTS channelId not starting with UC', () => {
    expect(() =>
      publishRecordSchema.parse({ ...VALID_RECORD, channelId: 'XC_NOTVALID' }),
    ).toThrow();
  });

  it('6. SCHEMA REJECTS privacyStatus other than "unlisted" — hard gate for unlisted-only constraint', () => {
    // This is the critical privacy gate: even if uploadEpisode somehow produced
    // a 'public' record, writePublishRecord's .parse() blocks it at the boundary.
    expect(() =>
      publishRecordSchema.parse({ ...VALID_RECORD, privacyStatus: 'public' }),
    ).toThrow();
  });
});

describe('writePublishRecord', () => {
  it('7. creates .golazo/ dir and writes pretty-printed JSON with trailing newline', () => {
    const folder = makeTmpFolder();
    writePublishRecord(folder, VALID_RECORD);
    const filePath = join(folder, '.golazo', 'publish.json');
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf8');
    // Must have trailing newline
    expect(content.endsWith('\n')).toBe(true);
    // Must have LF line endings (not CRLF)
    expect(content).not.toMatch(/\r\n/);
    // Must be 2-space indented
    expect(content).toContain('  "videoId"');
    // Round-trips
    const parsed = JSON.parse(content);
    expect(parsed).toMatchObject(VALID_RECORD);
  });
});

describe('readPublishRecord', () => {
  it('8. returns null when publish.json does not exist', () => {
    const folder = makeTmpFolder();
    const result = readPublishRecord(folder);
    expect(result).toBeNull();
  });

  it('9. throws PublishError on JSON parse failure', () => {
    const folder = makeTmpFolder();
    const golazoDir = join(folder, '.golazo');
    mkdirSync(golazoDir, { recursive: true });
    writeFileSync(join(golazoDir, 'publish.json'), 'not json', 'utf8');
    let caught: unknown;
    try {
      readPublishRecord(folder);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PublishError);
    const err = caught as PublishError;
    expect(err.field).toBe('(json)');
    expect(err.message).toContain("run 'golazo publish'");
  });

  it('10. throws PublishError on schema failure (e.g., empty videoId)', () => {
    const folder = makeTmpFolder();
    const golazoDir = join(folder, '.golazo');
    mkdirSync(golazoDir, { recursive: true });
    writeFileSync(
      join(golazoDir, 'publish.json'),
      JSON.stringify({ ...VALID_RECORD, videoId: '', watchUrl: 'bad' }),
      'utf8',
    );
    let caught: unknown;
    try {
      readPublishRecord(folder);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PublishError);
    const err = caught as PublishError;
    expect(err.field).toBeTruthy();
    expect(err.message).toContain("run 'golazo publish'");
  });

  it('11. round-trip: writePublishRecord → readPublishRecord → deep-equal', () => {
    const folder = makeTmpFolder();
    writePublishRecord(folder, VALID_RECORD);
    const result = readPublishRecord(folder);
    expect(result).toEqual(VALID_RECORD);
  });
});
