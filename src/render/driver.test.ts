/**
 * Integration tests for `runRender` (Plan 02-04).
 *
 * These tests exercise the full render pipeline against the committed Phase 1
 * fixture at low resolution (`lowRes: true`). Each test that triggers Remotion
 * rendering is guarded by a `chromiumAvailable` check — if Chromium cannot be
 * downloaded, those tests are skipped with a clear warning.
 *
 * Sandbox layout convention (mirrors Plan 01-05):
 *   <tmpHome>/golazo/leo/2026-05-13_vs_united_3-1/
 *
 * This gives `resolveKidFromPath` an unambiguous single `golazo` segment so
 * it correctly resolves `kid = 'leo'`.
 *
 * Remotion's first-time Chromium download (~150 MB) is handled in a
 * 120-second `beforeAll`. Subsequent tests reuse the cached binary.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  cpSync, rmSync, existsSync, appendFileSync, statSync, readFileSync,
  mkdtempSync, mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { runRender } from './driver.js';
import { runPrepare } from '../prepare/index.js';
import { readManifest } from '../prepare/manifest.js';
import { RenderError } from '../prepare/errors.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Fixture paths
// ---------------------------------------------------------------------------

const FIXTURE_ABS = resolve('tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1');
const CHANNELS_PATH = 'tests/fixtures/golazo/channels.yaml';
const GAME_FOLDER = '2026-05-13_vs_united_3-1';

// ---------------------------------------------------------------------------
// HOME stub (mirrors Plan 01-05)
// ---------------------------------------------------------------------------

const originalHome = process.env.HOME;

beforeAll(() => {
  process.env.HOME = process.cwd();
});

// ---------------------------------------------------------------------------
// Chromium availability guard
// ---------------------------------------------------------------------------

let chromiumAvailable = false;

beforeAll(async () => {
  try {
    const { ensureBrowser } = await import('@remotion/renderer');
    await ensureBrowser();
    chromiumAvailable = true;
  } catch {
    console.warn('Chromium unavailable — full-render tests will be skipped');
  }
}, 120_000);

// ---------------------------------------------------------------------------
// Sandbox helpers
// ---------------------------------------------------------------------------

/**
 * Each active tmpHome tracks all dirs created so afterEach can clean them up.
 * Using tmpHome (not just the game folder) so rmSync is a single root call.
 */
const activeTmpHomes: string[] = [];

/**
 * Create a per-test sandbox:
 *   <tmpHome>/golazo/leo/2026-05-13_vs_united_3-1/
 *
 * Returns the absolute path to the game folder.
 */
function setupSandbox(): { sandbox: string; tmpHome: string } {
  const tmpHome = mkdtempSync(join(tmpdir(), 'golazo-driver-test-'));
  const sandbox = join(tmpHome, 'golazo', 'leo', GAME_FOLDER);
  mkdirSync(join(tmpHome, 'golazo', 'leo'), { recursive: true });
  cpSync(FIXTURE_ABS, sandbox, { recursive: true });
  // Strip any leftover .golazo state from the fixture copy
  rmSync(join(sandbox, '.golazo'), { recursive: true, force: true });
  activeTmpHomes.push(tmpHome);
  return { sandbox, tmpHome };
}

afterEach(() => {
  // Restore HOME after each test
  process.env.HOME = process.cwd();
  // Clean up all sandboxes created in this test
  for (const tmpHome of activeTmpHomes.splice(0)) {
    rmSync(tmpHome, { recursive: true, force: true });
  }
});

async function prepareSandbox(sandbox: string): Promise<void> {
  await runPrepare({ folderPath: sandbox, channelsPath: CHANNELS_PATH });
}

function getEpisodeMtime(sandbox: string): number {
  const episodePath = join(sandbox, '.golazo', 'episode.mp4');
  if (!existsSync(episodePath)) return 0;
  return statSync(episodePath).mtimeMs;
}

function isPng(buffer: Buffer): boolean {
  // PNG magic bytes: 89 50 4E 47
  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

async function ffprobeDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    filePath,
  ]);
  const info = JSON.parse(stdout) as { streams: Array<{ duration?: string; codec_type?: string }> };
  const videoStream = info.streams.find((s) => s.codec_type === 'video');
  return videoStream?.duration ? parseFloat(videoStream.duration) : 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runRender — integration', () => {
  /**
   * Case 1: FIRST RENDER
   * Full episode.mp4 + thumb.png are produced; manifest render block is populated;
   * top-level manifestHash is UNCHANGED from the Phase 1 baseline.
   */
  it('case 1: first render produces episode.mp4, thumb.png, and populates manifest.render', async () => {
    if (!chromiumAvailable) {
      console.warn('Skipping: Chromium unavailable');
      return;
    }

    const { sandbox } = setupSandbox();
    await prepareSandbox(sandbox);
    const preManifest = readManifest(sandbox);
    expect(preManifest).not.toBeNull();

    const result = await runRender({ folderPath: sandbox, channelsPath: CHANNELS_PATH, lowRes: true });

    // Output files exist
    const episodePath = join(sandbox, '.golazo', 'episode.mp4');
    const thumbPath = join(sandbox, '.golazo', 'thumb.png');
    expect(existsSync(episodePath)).toBe(true);
    expect(statSync(episodePath).size).toBeGreaterThan(1024);
    expect(existsSync(thumbPath)).toBe(true);

    // PNG magic bytes
    const thumbBytes = readFileSync(thumbPath);
    expect(isPng(thumbBytes)).toBe(true);

    // ffprobe confirms video stream + positive duration
    const duration = await ffprobeDuration(episodePath);
    expect(duration).toBeGreaterThan(0);

    // Manifest render block populated
    const postManifest = readManifest(sandbox);
    expect(postManifest?.render).toBeDefined();
    expect(postManifest?.render?.episodePath).toBe('.golazo/episode.mp4');
    expect(postManifest?.render?.thumbnailPath).toBe('.golazo/thumb.png');
    expect(postManifest?.render?.renderedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(postManifest?.render?.durationSec).toBeGreaterThan(0);
    expect(postManifest?.render?.manifestHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    // manifestHash is unchanged from Phase 1 baseline (PREP-07)
    expect(postManifest?.manifestHash).toBe(preManifest!.manifestHash);

    // Render block's manifestHash matches top-level
    expect(postManifest?.render?.manifestHash).toBe(postManifest?.manifestHash);

    // music block populated
    expect(postManifest?.music).toBeDefined();
    expect(postManifest?.music?.track).toMatch(/\.mp3$/);

    // result fields
    expect(result.reason).toBe('first-render');
    expect(result.skipped).toBe(false);
  }, 60_000);

  /**
   * Case 2: SECOND RENDER (no-op)
   * Re-running with the same manifest skips Remotion entirely in < 2s.
   */
  it('case 2: hash-match skips rendering in under 2 seconds', async () => {
    if (!chromiumAvailable) {
      console.warn('Skipping: Chromium unavailable');
      return;
    }

    const { sandbox } = setupSandbox();
    await prepareSandbox(sandbox);
    await runRender({ folderPath: sandbox, channelsPath: CHANNELS_PATH, lowRes: true });

    // Record mtime before re-run
    const mtimeBefore = getEpisodeMtime(sandbox);

    const start = Date.now();
    const result = await runRender({ folderPath: sandbox, channelsPath: CHANNELS_PATH, lowRes: true });
    const elapsed = Date.now() - start;

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('hash-match');
    expect(elapsed).toBeLessThan(2000);

    // episode.mp4 mtime unchanged
    const mtimeAfter = getEpisodeMtime(sandbox);
    expect(mtimeAfter).toBe(mtimeBefore);
  }, 60_000);

  /**
   * Case 3: FORCE RENDER
   * --force re-renders even when hashes match; episode.mp4 mtime advances.
   */
  it('case 3: --force re-renders when hash matches and advances episode.mp4 mtime', async () => {
    if (!chromiumAvailable) {
      console.warn('Skipping: Chromium unavailable');
      return;
    }

    const { sandbox } = setupSandbox();
    await prepareSandbox(sandbox);
    await runRender({ folderPath: sandbox, channelsPath: CHANNELS_PATH, lowRes: true });

    // Wait 50ms to ensure mtime difference is observable
    await new Promise<void>((r) => setTimeout(r, 50));
    const mtimeBefore = getEpisodeMtime(sandbox);

    const result = await runRender({
      folderPath: sandbox, channelsPath: CHANNELS_PATH, lowRes: true, force: true,
    });

    expect(result.skipped).toBe(false);
    expect(result.reason).toBe('force');

    const mtimeAfter = getEpisodeMtime(sandbox);
    expect(mtimeAfter).toBeGreaterThan(mtimeBefore);
  }, 60_000);

  /**
   * Case 4: MISSING MANIFEST
   * A folder without .golazo/manifest.json throws RenderError with correct message.
   * Runs unconditionally — driver throws before any Remotion work.
   */
  it('case 4: missing manifest throws RenderError with manifest not found message', async () => {
    const { sandbox } = setupSandbox();
    // Do NOT run prepareSandbox — no manifest.json

    await expect(
      runRender({ folderPath: sandbox, channelsPath: CHANNELS_PATH }),
    ).rejects.toThrow(RenderError);

    try {
      await runRender({ folderPath: sandbox, channelsPath: CHANNELS_PATH });
    } catch (err) {
      expect(err).toBeInstanceOf(RenderError);
      const e = err as RenderError;
      expect(e.message).toContain('manifest not found');
      expect(e.message).toContain('golazo prepare');
    }
  });

  /**
   * Case 5: CONTENT CHANGED → hash-changed path
   * After modifying a clip, runPrepare produces a new manifestHash; re-running
   * render detects the change and re-renders.
   */
  it('case 5: hash-changed re-renders when content changes', async () => {
    if (!chromiumAvailable) {
      console.warn('Skipping: Chromium unavailable');
      return;
    }

    const { sandbox } = setupSandbox();
    await prepareSandbox(sandbox);
    await runRender({ folderPath: sandbox, channelsPath: CHANNELS_PATH, lowRes: true });

    const mtimeBefore = getEpisodeMtime(sandbox);

    // Mutate a clip to change its sha256 (mirrors Plan 01-05 case 4)
    appendFileSync(join(sandbox, '02-clip.mp4'), 'EXTRA-BYTES');

    // Re-prepare → produces new manifestHash
    await runPrepare({ folderPath: sandbox, channelsPath: CHANNELS_PATH });

    const result = await runRender({ folderPath: sandbox, channelsPath: CHANNELS_PATH, lowRes: true });

    expect(result.reason).toBe('hash-changed');
    expect(result.skipped).toBe(false);

    // Manifest's render.manifestHash matches new top-level hash
    const manifest = readManifest(sandbox);
    expect(manifest?.render?.manifestHash).toBe(manifest?.manifestHash);

    // episode.mp4 mtime advances
    const mtimeAfter = getEpisodeMtime(sandbox);
    expect(mtimeAfter).toBeGreaterThan(mtimeBefore);
  }, 120_000);

  /**
   * Case 6: DETERMINISTIC MUSIC PICK
   * Two separate sandboxes with identical content produce identical manifest.music blocks.
   */
  it('case 6: identical fixtures produce identical manifest.music blocks (deterministic pick)', async () => {
    if (!chromiumAvailable) {
      console.warn('Skipping: Chromium unavailable');
      return;
    }

    const { sandbox: sandbox1 } = setupSandbox();
    const { sandbox: sandbox2 } = setupSandbox();

    await prepareSandbox(sandbox1);
    await prepareSandbox(sandbox2);

    await runRender({ folderPath: sandbox1, channelsPath: CHANNELS_PATH, lowRes: true });
    await runRender({ folderPath: sandbox2, channelsPath: CHANNELS_PATH, lowRes: true });

    const m1 = readManifest(sandbox1);
    const m2 = readManifest(sandbox2);

    // Same top-level hash (Phase 1 guarantee, re-confirmed)
    expect(m1?.manifestHash).toBe(m2?.manifestHash);

    // Identical music picks
    expect(m1?.music).toEqual(m2?.music);
  }, 120_000);

  /**
   * Case 7: INVARIANT — render.manifestHash === top-level manifestHash
   */
  it('case 7: manifest.render.manifestHash equals top-level manifestHash after first render', async () => {
    if (!chromiumAvailable) {
      console.warn('Skipping: Chromium unavailable');
      return;
    }

    const { sandbox } = setupSandbox();
    await prepareSandbox(sandbox);
    await runRender({ folderPath: sandbox, channelsPath: CHANNELS_PATH, lowRes: true });

    const manifest = readManifest(sandbox);
    expect(manifest?.render?.manifestHash).toBe(manifest?.manifestHash);
  }, 60_000);
});
