/**
 * Tests for `discoverClips` (PREP-03). Synthetic folder layouts built per
 * test in `os.tmpdir()` — no real video bytes are needed since discovery
 * only checks filenames, not file contents. Cleanup runs in `afterEach`
 * so the suite leaves no scratch directories behind.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CLIP_FILENAME_REGEX, discoverClips } from './clips.js';
import { ClipDiscoveryError } from './errors.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'golazo-clips-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Helper: create empty placeholder files for a structural-only test. */
function touch(...files: string[]): void {
  for (const f of files) {
    writeFileSync(join(tmpDir, f), '');
  }
}

describe('CLIP_FILENAME_REGEX', () => {
  it('matches NN-<name>.mp4', () => {
    expect(CLIP_FILENAME_REGEX.test('01-clip.mp4')).toBe(true);
    expect(CLIP_FILENAME_REGEX.test('10-clip.mp4')).toBe(true);
    expect(CLIP_FILENAME_REGEX.test('001-anything-with-dashes.mp4')).toBe(true);
  });

  it('rejects names that do not start with digits', () => {
    expect(CLIP_FILENAME_REGEX.test('clip-01.mp4')).toBe(false);
    expect(CLIP_FILENAME_REGEX.test('notes.txt')).toBe(false);
    expect(CLIP_FILENAME_REGEX.test('cover.jpg')).toBe(false);
    expect(CLIP_FILENAME_REGEX.test('-01-clip.mp4')).toBe(false);
  });

  it('rejects names without the dash separator after the prefix', () => {
    expect(CLIP_FILENAME_REGEX.test('01clip.mp4')).toBe(false);
  });

  it('rejects non-.mp4 extensions', () => {
    expect(CLIP_FILENAME_REGEX.test('01-clip.mov')).toBe(false);
    expect(CLIP_FILENAME_REGEX.test('01-clip.MP4')).toBe(false);
  });
});

describe('discoverClips: VALID cases', () => {
  it('case 1: folder with 01/02/03 returns three entries in numeric order', () => {
    touch('01-clip.mp4', '02-clip.mp4', '03-clip.mp4');
    const out = discoverClips(tmpDir);
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.file)).toEqual(['01-clip.mp4', '02-clip.mp4', '03-clip.mp4']);
    for (const entry of out) {
      expect(entry.absPath).toBe(join(tmpDir, entry.file));
    }
  });

  it('case 2: mixed-order input sorts by numeric prefix (01, 02, 10 — NOT lex)', () => {
    touch('10-clip.mp4', '02-clip.mp4', '01-clip.mp4');
    const out = discoverClips(tmpDir);
    expect(out.map((c) => c.file)).toEqual(['01-clip.mp4', '02-clip.mp4', '10-clip.mp4']);
  });

  it('case 3: skipped files (notes.txt, cover.jpg) are filtered out when at least one clip matches', () => {
    touch('01-clip.mp4', 'notes.txt', 'cover.jpg');
    const out = discoverClips(tmpDir);
    expect(out).toHaveLength(1);
    expect(out[0]?.file).toBe('01-clip.mp4');
  });

  it('case 4: two clips at the same numeric prefix are sorted by full filename (stable)', () => {
    touch('01-other.mp4', '01-clip.mp4');
    const out = discoverClips(tmpDir);
    expect(out.map((c) => c.file)).toEqual(['01-clip.mp4', '01-other.mp4']);
  });
});

describe('discoverClips: ERROR cases', () => {
  it('case 5: empty folder throws ClipDiscoveryError with "(none)" skipped list', () => {
    expect(() => discoverClips(tmpDir)).toThrow(ClipDiscoveryError);
    try {
      discoverClips(tmpDir);
    } catch (err) {
      expect(err).toBeInstanceOf(ClipDiscoveryError);
      expect((err as Error).message).toContain('Skipped non-matching files: (none)');
      expect((err as Error).message).toContain('no files match NN-*.mp4');
    }
  });

  it('case 6: folder with only non-matching files throws with both names listed', () => {
    touch('notes.txt', 'cover.jpg');
    try {
      discoverClips(tmpDir);
      throw new Error('expected discoverClips to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ClipDiscoveryError);
      const msg = (err as Error).message;
      expect(msg).toContain('notes.txt');
      expect(msg).toContain('cover.jpg');
      expect(msg).toContain('Expected files matching ^NN-<name>.mp4');
    }
  });

  it('case 7: folder does not exist throws with "folder does not exist" reason', () => {
    const missing = join(tmpDir, 'does-not-exist');
    try {
      discoverClips(missing);
      throw new Error('expected discoverClips to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ClipDiscoveryError);
      const msg = (err as Error).message;
      expect(msg).toContain('folder does not exist');
      expect(msg).toContain(missing);
    }
  });

  it('case 8: path is a file (not a directory) throws ClipDiscoveryError', () => {
    const fileNotDir = join(tmpDir, '01-clip.mp4');
    writeFileSync(fileNotDir, '');
    try {
      discoverClips(fileNotDir);
      throw new Error('expected discoverClips to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ClipDiscoveryError);
      const msg = (err as Error).message;
      expect(msg).toContain('not a directory');
      // The supplied path itself appears in the skipped list so the operator
      // sees what they pointed at.
      expect(msg).toContain('01-clip.mp4');
    }
  });

  it('ClipDiscoveryError.toJSON() exposes structured fields', () => {
    touch('a.txt', 'b.png');
    try {
      discoverClips(tmpDir);
    } catch (err) {
      expect(err).toBeInstanceOf(ClipDiscoveryError);
      const json = (err as ClipDiscoveryError).toJSON();
      expect(json.name).toBe('ClipDiscoveryError');
      expect(json.folderPath).toBe(tmpDir);
      expect(json.skippedFiles.slice().sort()).toEqual(['a.txt', 'b.png']);
      expect(json.reason).toBe('no files match NN-*.mp4');
    }
  });

  it('folder containing only nested directories (no files) throws', () => {
    mkdirSync(join(tmpDir, 'subdir'));
    try {
      discoverClips(tmpDir);
      throw new Error('expected discoverClips to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ClipDiscoveryError);
      // Subdirectory should appear in the skipped list since readdir returns it
      expect((err as Error).message).toContain('subdir');
    }
  });
});
