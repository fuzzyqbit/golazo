import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { runPrepare } from './index.js';
import { ClipDiscoveryError, FilenameError, ProbeError, KidPathError } from './errors.js';
import { UnknownKidError } from '../config/errors.js';
import { computeClipSha256 } from './hash.js';
import { readManifest, MANIFEST_FILE_NAME } from './manifest.js';

/**
 * Integration tests for the prepare orchestrator. Setup mirrors the
 * convention pinned in Plan 04: stub HOME to repo root so the fixture
 * channels.yaml's tilde-pathed oauth_token entries resolve to the
 * committed token files under tests/fixtures/golazo/.
 *
 * EVERY case clones the fixture into a per-test sandbox under
 * os.tmpdir(). Two reasons:
 *
 *   1. The committed fixture lives at
 *      `<repo>/tests/fixtures/golazo/leo/...`, and the repo itself is
 *      checked out under a directory named `golazo`
 *      (`/Users/.../code/golazo/...`). resolveKidFromPath finds the
 *      FIRST `golazo` segment in the absolute path, which on this
 *      machine is the repo root — so the segment after it is `tests`,
 *      not `leo`. Cloning into `<tmpHome>/golazo/leo/<game-folder>/`
 *      gives the resolver an unambiguous single `golazo` segment.
 *   2. The orchestrator writes `.golazo/manifest.json` into the folder
 *      it processes; sandboxing keeps the committed fixture pristine
 *      across test runs.
 */

const REPO_ROOT = process.cwd();
const FIXTURE_RELATIVE = 'tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1';
const FIXTURE_ABS = resolve(REPO_ROOT, FIXTURE_RELATIVE);
const CHANNELS_PATH = 'tests/fixtures/golazo/channels.yaml';

/** Remove every artefact under `path` recursively. */
function cleanup(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

describe('runPrepare', () => {
  const originalHome = process.env.HOME;

  beforeAll(() => {
    process.env.HOME = REPO_ROOT;
  });

  afterAll(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  describe('against a sandboxed clone of the committed fixture', () => {
    let tmpHomeShared: string | null = null;
    let sandboxShared = '';

    beforeEach(() => {
      tmpHomeShared = mkdtempSync(join(tmpdir(), 'golazo-prepare-fixture-'));
      sandboxShared = join(
        tmpHomeShared,
        'golazo',
        'leo',
        '2026-05-13_vs_united_3-1',
      );
      cpSync(FIXTURE_ABS, sandboxShared, { recursive: true });
    });

    afterEach(() => {
      if (tmpHomeShared !== null) {
        cleanup(tmpHomeShared);
        tmpHomeShared = null;
      }
    });

    it('case 1: FIRST RUN writes a Manifest with correct shape', async () => {
      const result = await runPrepare({
        folderPath: sandboxShared,
        channelsPath: CHANNELS_PATH,
      });

      expect(result.skipped).toBe(false);
      expect(result.reason).toBe('first-run');

      const onDisk = readManifest(sandboxShared);
      expect(onDisk).not.toBeNull();
      const m = onDisk!;
      expect(m.version).toBe(1);
      expect(m.kid).toBe('leo');
      expect(m.game.date).toBe('2026-05-13');
      expect(m.game.opponent).toBe('united');
      expect(m.game.scoreFor).toBe(3);
      expect(m.game.scoreAgainst).toBe(1);
      expect(m.game.result).toBe('W');
      expect(m.clips).toHaveLength(3);
      expect(m.clips[0]?.file).toBe('01-clip.mp4');
      expect(m.clips[1]?.file).toBe('02-clip.mp4');
      expect(m.clips[2]?.file).toBe('03-clip.mp4');
      for (const c of m.clips) {
        expect(c.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(c.durationSec).toBeGreaterThan(0);
      }
      // Three ~2s fixture clips → ~6s total (with some tolerance).
      expect(m.totalDurationSec).toBeGreaterThan(5);
      expect(m.totalDurationSec).toBeLessThan(7);
      expect(m.manifestHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it('case 2: SECOND RUN is a no-op (mtime unchanged, skipped/hash-match)', async () => {
      await runPrepare({ folderPath: sandboxShared, channelsPath: CHANNELS_PATH });
      const manifestPath = join(sandboxShared, MANIFEST_FILE_NAME);
      const baselineMtimeNs = statSync(manifestPath).mtimeMs;

      // Wait a tick so a mistaken rewrite would advance mtime detectably on
      // filesystems with coarse mtime resolution.
      await new Promise((res) => setTimeout(res, 20));

      const second = await runPrepare({
        folderPath: sandboxShared,
        channelsPath: CHANNELS_PATH,
      });
      expect(second.skipped).toBe(true);
      expect(second.reason).toBe('hash-match');
      const newMtimeNs = statSync(manifestPath).mtimeMs;
      expect(newMtimeNs).toBe(baselineMtimeNs);
    });

    it('case 3: FORCED RUN rewrites even when hash matches', async () => {
      await runPrepare({ folderPath: sandboxShared, channelsPath: CHANNELS_PATH });
      const manifestPath = join(sandboxShared, MANIFEST_FILE_NAME);
      const baselineMtimeNs = statSync(manifestPath).mtimeMs;

      await new Promise((res) => setTimeout(res, 20));

      const forced = await runPrepare({
        folderPath: sandboxShared,
        channelsPath: CHANNELS_PATH,
        force: true,
      });
      expect(forced.skipped).toBe(false);
      expect(forced.reason).toBe('force');
      const newMtimeNs = statSync(manifestPath).mtimeMs;
      expect(newMtimeNs).toBeGreaterThan(baselineMtimeNs);
    });
  });

  describe('mutating sandboxes (cloned out of os.tmpdir())', () => {
    let tmpHome: string | null = null;

    beforeEach(() => {
      tmpHome = null;
    });

    afterEach(() => {
      if (tmpHome !== null) {
        cleanup(tmpHome);
        tmpHome = null;
      }
    });

    it('case 4: CHANGED CONTENT (valid mp4 different bytes) takes the hash-changed branch', async () => {
      // DEVIATION FROM PLAN: the plan suggested overwriting 02-clip with
      // the BYTES of 03-clip via cpSync, on the assumption that the three
      // committed fixture clips have different sha256 values. They don't —
      // Plan 04 committed three byte-identical clips
      // (sha256 ec9adf11...). So `cpSync(03 → 02)` produces no hash change
      // and the hash-changed branch is unreachable via that recipe.
      //
      // Equivalent recipe that preserves case 4's intent (a VALID mp4 with
      // DIFFERENT bytes from the original 02-clip): append a small byte
      // string to 02-clip. mp4 parsers tolerate trailing data after the
      // MOOV atom, so ffprobe still extracts a positive duration → probe
      // step succeeds → orchestrator advances to the hash compare with a
      // new clip sha256, exactly the branch we want to exercise. Case 6
      // (raw garbage bytes) still owns the ProbeError path; the two cases
      // remain orthogonal.
      tmpHome = mkdtempSync(join(tmpdir(), 'golazo-prepare-case4-'));
      const sandbox = join(tmpHome, 'golazo', 'leo', '2026-05-13_vs_united_3-1');
      cpSync(FIXTURE_ABS, sandbox, { recursive: true });

      // Baseline: first run writes a manifest with the original hash.
      const baseline = await runPrepare({
        folderPath: sandbox,
        channelsPath: CHANNELS_PATH,
      });
      expect(baseline.skipped).toBe(false);
      expect(baseline.reason).toBe('first-run');
      const baselineHash = baseline.manifest.manifestHash;
      const baselineClip2Sha = baseline.manifest.clips[1]?.sha256;
      const baselineMtimeNs = statSync(
        join(sandbox, MANIFEST_FILE_NAME),
      ).mtimeMs;

      // Append a small byte string to 02-clip. The MOOV atom is still
      // intact, so ffprobe reads the duration correctly. computeClipSha256
      // sees the new (longer) bytes → different sha256.
      appendFileSync(join(sandbox, '02-clip.mp4'), 'EXTRA-TRAILING-BYTES');
      const expectedClip2Sha = await computeClipSha256(
        join(sandbox, '02-clip.mp4'),
      );
      expect(expectedClip2Sha).not.toBe(baselineClip2Sha);

      await new Promise((res) => setTimeout(res, 20));

      const result = await runPrepare({
        folderPath: sandbox,
        channelsPath: CHANNELS_PATH,
      });
      expect(result.skipped).toBe(false);
      expect(result.reason).toBe('hash-changed');
      expect(result.manifest.manifestHash).not.toBe(baselineHash);
      expect(result.manifest.clips[1]?.sha256).toBe(expectedClip2Sha);
      const newMtimeNs = statSync(join(sandbox, MANIFEST_FILE_NAME)).mtimeMs;
      expect(newMtimeNs).toBeGreaterThan(baselineMtimeNs);
    });

    it('case 5: DETERMINISM — two clones with identical content + identical folder name produce identical manifestHash', async () => {
      tmpHome = mkdtempSync(join(tmpdir(), 'golazo-prepare-case5-'));
      const sandboxA = join(tmpHome, 'a', 'golazo', 'leo', '2026-05-13_vs_united_3-1');
      const sandboxB = join(tmpHome, 'b', 'golazo', 'leo', '2026-05-13_vs_united_3-1');
      cpSync(FIXTURE_ABS, sandboxA, { recursive: true });
      cpSync(FIXTURE_ABS, sandboxB, { recursive: true });

      const a = await runPrepare({ folderPath: sandboxA, channelsPath: CHANNELS_PATH });
      const b = await runPrepare({ folderPath: sandboxB, channelsPath: CHANNELS_PATH });
      expect(a.manifest.manifestHash).toBe(b.manifest.manifestHash);
    });

    it('case 6: CORRUPT CLIP (raw bytes -> ProbeError, distinct from case 4)', async () => {
      tmpHome = mkdtempSync(join(tmpdir(), 'golazo-prepare-case6-'));
      const sandbox = join(tmpHome, 'golazo', 'leo', '2026-05-13_vs_united_3-1');
      cpSync(FIXTURE_ABS, sandbox, { recursive: true });

      writeFileSync(join(sandbox, '02-clip.mp4'), 'this is not a valid mp4', 'utf8');

      await expect(
        runPrepare({ folderPath: sandbox, channelsPath: CHANNELS_PATH }),
      ).rejects.toBeInstanceOf(ProbeError);

      try {
        await runPrepare({ folderPath: sandbox, channelsPath: CHANNELS_PATH });
      } catch (err) {
        expect((err as Error).message).toContain('02-clip.mp4');
      }
    });

    it('case 7: EMPTY FOLDER throws ClipDiscoveryError', async () => {
      tmpHome = mkdtempSync(join(tmpdir(), 'golazo-prepare-case7-'));
      const sandbox = join(tmpHome, 'golazo', 'leo', '2026-05-13_vs_united_3-1');
      mkdirSync(sandbox, { recursive: true });

      await expect(
        runPrepare({ folderPath: sandbox, channelsPath: CHANNELS_PATH }),
      ).rejects.toBeInstanceOf(ClipDiscoveryError);
    });

    it('case 8: BAD FOLDER NAME throws FilenameError', async () => {
      tmpHome = mkdtempSync(join(tmpdir(), 'golazo-prepare-case8-'));
      const sandbox = join(tmpHome, 'golazo', 'leo', 'badname');
      mkdirSync(sandbox, { recursive: true });

      await expect(
        runPrepare({ folderPath: sandbox, channelsPath: CHANNELS_PATH }),
      ).rejects.toBeInstanceOf(FilenameError);
    });

    it('case 9: UNKNOWN KID throws UnknownKidError', async () => {
      tmpHome = mkdtempSync(join(tmpdir(), 'golazo-prepare-case9-'));
      const sandbox = join(tmpHome, 'golazo', 'alice', '2026-05-13_vs_united_3-1');
      mkdirSync(sandbox, { recursive: true });

      await expect(
        runPrepare({ folderPath: sandbox, channelsPath: CHANNELS_PATH }),
      ).rejects.toBeInstanceOf(UnknownKidError);
    });

    it('case 10: NO GOLAZO SEGMENT throws KidPathError', async () => {
      tmpHome = mkdtempSync(join(tmpdir(), 'golazo-prepare-case10-'));
      const sandbox = join(tmpHome, 'badpath', '2026-05-13_vs_united_3-1');
      mkdirSync(sandbox, { recursive: true });

      await expect(
        runPrepare({ folderPath: sandbox, channelsPath: CHANNELS_PATH }),
      ).rejects.toBeInstanceOf(KidPathError);
    });
  });
});

// The `cli prepare integration` block (cases 11-13) lives at the bottom of
// this file but is appended in Task 3 when the CLI handler is swapped from
// the Plan 01 stub to the real runPrepare-calling implementation. Adding
// the spawn-based cases together with the handler swap keeps every commit
// in a green state — appending them now would RED the suite until Task 3
// lands. (Documented as a deviation in 01-05-SUMMARY.md; the resulting
// test file still covers all 13 cases by the end of Task 3.)
