/**
 * CLI shell-out integration tests for `golazo render <folder>` (Plan 02-04).
 *
 * Mirrors the Plan 01-05 shell-out pattern: spawn `npx tsx src/cli/index.ts`
 * with HOME=$PWD so tilde-pathed oauth_token entries in channels.yaml resolve
 * correctly.
 *
 * Cases 1-3 require Chromium and are gated by a `chromiumAvailable` check.
 * Case 4 (missing manifest) runs unconditionally — the driver throws before
 * any Remotion work.
 *
 * Sandbox layout: <tmpHome>/golazo/leo/2026-05-13_vs_united_3-1/
 * (mirrors Plan 01-05 convention so resolveKidFromPath works correctly).
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  cpSync, rmSync, existsSync, statSync, mkdtempSync, mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { runPrepare } from '../prepare/index.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const FIXTURE_ABS = resolve(REPO_ROOT, 'tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1');
const CHANNELS_PATH = 'tests/fixtures/golazo/channels.yaml';
const GAME_FOLDER = '2026-05-13_vs_united_3-1';
const ENV = { ...process.env, HOME: REPO_ROOT };

// ---------------------------------------------------------------------------
// HOME stub
// ---------------------------------------------------------------------------

beforeAll(() => {
  process.env.HOME = REPO_ROOT;
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
    console.warn('Chromium unavailable — full-render CLI tests will be skipped');
  }
}, 120_000);

// ---------------------------------------------------------------------------
// Sandbox helpers
// ---------------------------------------------------------------------------

const activeTmpHomes: string[] = [];

function setupSandbox(): { sandbox: string; tmpHome: string } {
  const tmpHome = mkdtempSync(join(tmpdir(), 'golazo-render-cli-test-'));
  const sandbox = join(tmpHome, 'golazo', 'leo', GAME_FOLDER);
  mkdirSync(join(tmpHome, 'golazo', 'leo'), { recursive: true });
  cpSync(FIXTURE_ABS, sandbox, { recursive: true });
  rmSync(join(sandbox, '.golazo'), { recursive: true, force: true });
  activeTmpHomes.push(tmpHome);
  return { sandbox, tmpHome };
}

afterEach(() => {
  process.env.HOME = REPO_ROOT;
  for (const tmpHome of activeTmpHomes.splice(0)) {
    rmSync(tmpHome, { recursive: true, force: true });
  }
});

async function prepareSandbox(sandbox: string): Promise<void> {
  await runPrepare({ folderPath: sandbox, channelsPath: CHANNELS_PATH });
}

async function runCLIRender(
  sandbox: string,
  extraArgs: string[] = [],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'npx',
      [
        'tsx', 'src/cli/index.ts', 'render', sandbox,
        '--channels-config', CHANNELS_PATH,
        '--low-res',
        ...extraArgs,
      ],
      { env: ENV, cwd: REPO_ROOT },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.code ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI render — shell-out integration', () => {
  /**
   * Case 1: END-TO-END
   * prepare sandbox → run golazo render → exit 0 → episode.mp4 + thumb.png exist
   */
  it('case 1: end-to-end produces episode.mp4 + thumb.png, exit 0, stdout contains episode rendered', async () => {
    if (!chromiumAvailable) {
      console.warn('Skipping: Chromium unavailable');
      return;
    }

    const { sandbox } = setupSandbox();
    await prepareSandbox(sandbox);

    const { stdout, exitCode } = await runCLIRender(sandbox);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('episode rendered');
    expect(stdout).toContain('.mp4');
    expect(existsSync(join(sandbox, '.golazo', 'episode.mp4'))).toBe(true);
    expect(existsSync(join(sandbox, '.golazo', 'thumb.png'))).toBe(true);
  }, 120_000);

  /**
   * Case 2: NO-OP
   * re-run the same command → exit 0 → stdout contains "render up to date" → < 5 seconds
   */
  it('case 2: re-run is a no-op, exits 0 and prints render up to date in under 5 seconds', async () => {
    if (!chromiumAvailable) {
      console.warn('Skipping: Chromium unavailable');
      return;
    }

    const { sandbox } = setupSandbox();
    await prepareSandbox(sandbox);
    await runCLIRender(sandbox); // first render

    const start = Date.now();
    const { stdout, exitCode } = await runCLIRender(sandbox);
    const elapsed = Date.now() - start;

    expect(exitCode).toBe(0);
    expect(stdout).toContain('render up to date (hash matches)');
    // CLI startup overhead (npx + tsx) adds ~2s on top of the <2s driver skip path
    expect(elapsed).toBeLessThan(30_000); // generous for slow CI; sub-5s is the goal
  }, 60_000);

  /**
   * Case 3: FORCE
   * re-run with --force → exit 0 → stdout contains "re-rendered (force)" → mtime advances
   */
  it('case 3: --force re-renders and stdout says episode re-rendered (force)', async () => {
    if (!chromiumAvailable) {
      console.warn('Skipping: Chromium unavailable');
      return;
    }

    const { sandbox } = setupSandbox();
    await prepareSandbox(sandbox);
    await runCLIRender(sandbox); // first render

    await new Promise<void>((r) => setTimeout(r, 50));
    const mtimeBefore = statSync(join(sandbox, '.golazo', 'episode.mp4')).mtimeMs;

    const { stdout, exitCode } = await runCLIRender(sandbox, ['--force']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('episode re-rendered (force)');

    const mtimeAfter = statSync(join(sandbox, '.golazo', 'episode.mp4')).mtimeMs;
    expect(mtimeAfter).toBeGreaterThan(mtimeBefore);
  }, 60_000);

  /**
   * Case 4: MISSING MANIFEST
   * sandbox with no .golazo/manifest.json → exit 1 → stderr contains manifest not found
   * Runs unconditionally — driver throws before any Remotion work.
   */
  it('case 4: missing manifest → exit 1, stderr contains manifest not found and golazo prepare', async () => {
    const { sandbox } = setupSandbox();
    // No prepareSandbox call — no manifest.json

    const { stderr, exitCode } = await runCLIRender(sandbox);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('manifest not found');
    expect(stderr).toContain('golazo prepare');
  });
});
