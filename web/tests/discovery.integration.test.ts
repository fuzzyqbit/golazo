/**
 * discovery.integration.test.ts — end-to-end smoke for Plan 04.
 *
 * Spawns `npx --prefix web next dev -p 4174 -H 127.0.0.1` with a per-test
 * sandbox as GOLAZO_ROOT, then polls /api/debug/discovery to verify:
 *   1. Initial scan: 3 episodes + 1 broken folder warning
 *   2. Add game folder: episodeCount increments from 3→4 within 3 s (DISC-04)
 *   3. Delete game folder: episodeCount decrements from 4→3 within 3 s
 *
 * Test wall-clock budget: 30 s setup + 15 s test body = 45 s total ceiling.
 * Set GOLAZO_SKIP_DISCOVERY_INTEGRATION=1 to skip in time-constrained environments.
 *
 * Ties together every DISC-* requirement:
 *   DISC-01: episodeCount reflects scanned EpisodeIndex rows
 *   DISC-02: status derivation via rebuildFromScan
 *   DISC-03: queryAllEpisodes from sqlite (Plan 02)
 *   DISC-04: episodeCount increments mid-run via watcher within < 3 s
 *   DISC-05: warnings.brokenFolders === 1 (broken-folder-name fixture)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dir = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dir, '..');
const FIXTURE_ROOT = join(__dir, 'fixtures/golazo');
const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const SKIP = process.env.GOLAZO_SKIP_DISCOVERY_INTEGRATION === '1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return;
    } catch {
      // Not ready yet
    }
    await new Promise<void>((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs} ms`);
}

interface DiscoveryStatus {
  episodeCount: number;
  warnings: { brokenFolders: number; invalidManifests: number; invalidPublishRecords: number };
  watcherReady: boolean;
  rootMissing: boolean;
  rootPath: string;
  dbPath: string;
}

async function fetchStatus(): Promise<DiscoveryStatus> {
  const res = await fetch(`${BASE_URL}/api/debug/discovery`);
  if (!res.ok) throw new Error(`/api/debug/discovery returned ${res.status}`);
  return (await res.json()) as DiscoveryStatus;
}

/**
 * Poll until episodeCount equals target or timeoutMs elapses.
 * Returns elapsed milliseconds. Throws on timeout.
 */
async function pollEpisodeCount(target: number, timeoutMs: number): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const status = await fetchStatus();
    if (status.episodeCount === target) {
      return Date.now() - t0;
    }
    await new Promise<void>((r) => setTimeout(r, 200));
  }
  const last = await fetchStatus();
  throw new Error(
    `episodeCount never reached ${target} within ${timeoutMs} ms. Last value: ${last.episodeCount}`,
  );
}

/**
 * Write a valid manifestSchema-conforming manifest.json.
 * The manifestHash is syntactically valid but not cryptographically derived from
 * clips — the read-path (scanner) only validates the regex, not the hash value.
 */
function writeSyntheticManifest(
  gameFolder: string,
  opts: {
    kid: string;
    date: string;
    opponent: string;
    scoreFor: number;
    scoreAgainst: number;
    result: 'W' | 'L' | 'D';
    manifestHashHex: string;
  },
): void {
  const manifest = {
    version: 1,
    kid: opts.kid,
    game: {
      date: opts.date,
      opponent: opts.opponent,
      scoreFor: opts.scoreFor,
      scoreAgainst: opts.scoreAgainst,
      result: opts.result,
    },
    clips: [
      {
        file: '01-clip.mp4',
        durationSec: 2.0,
        sha256: 'a'.repeat(64),
      },
    ],
    totalDurationSec: 2.0,
    manifestHash: `sha256:${opts.manifestHashHex}`,
  };
  const golazoDir = join(gameFolder, '.golazo');
  mkdirSync(golazoDir, { recursive: true });
  writeFileSync(join(golazoDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(SKIP)('discovery integration', () => {
  const sandbox = join(tmpdir(), `golazo-disc-int-${randomUUID()}`);
  let serverProc: ChildProcess;
  const serverOut: string[] = [];

  beforeAll(async () => {
    // Clone fixture tree into a per-test sandbox
    mkdirSync(sandbox, { recursive: true });
    cpSync(FIXTURE_ROOT, sandbox, { recursive: true });

    // Spawn the Next.js dev server from web/ directory so the app directory is found.
    // Use `npx next dev` so the test has full control over port + host without
    // being bound by web/package.json's hardcoded -p 4173 script value.
    serverProc = spawn(
      'npx',
      ['next', 'dev', '-p', String(PORT), '-H', '127.0.0.1'],
      {
        cwd: WEB_DIR,
        env: {
          ...process.env,
          HOST: '127.0.0.1',
          GOLAZO_ROOT: sandbox,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    serverProc.stdout?.on('data', (d: Buffer) => {
      const s = d.toString();
      serverOut.push(s);
      process.stdout.write('[server] ' + s);
    });
    serverProc.stderr?.on('data', (d: Buffer) => {
      const s = d.toString();
      serverOut.push(s);
      process.stderr.write('[server] ' + s);
    });

    // Wait for the debug route to return 200 (proves server + discovery runtime are up)
    await waitForServer(`${BASE_URL}/api/debug/discovery`, 25_000);
  }, 45_000);

  afterAll(async () => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill('SIGTERM');
    }
    // Grace period for clean shutdown
    await new Promise<void>((r) => setTimeout(r, 2000));
    if (serverProc && !serverProc.killed) {
      serverProc.kill('SIGKILL');
    }
    // Wait for exit
    await new Promise<void>((r) => {
      serverProc.on('exit', r);
      setTimeout(r, 3000);
    });
    rmSync(sandbox, { recursive: true, force: true });
  }, 15_000);

  it('DISC-01/02/03/05: initial scan returns 3 episodes + 1 broken folder warning', async () => {
    const status = await fetchStatus();
    expect(status.episodeCount).toBe(3);
    expect(status.warnings.brokenFolders).toBe(1);
    expect(status.warnings.invalidManifests).toBe(0);
    expect(status.warnings.invalidPublishRecords).toBe(0);
    expect(status.watcherReady).toBe(true);
    expect(status.rootMissing).toBe(false);
    expect(status.rootPath).toContain('golazo-disc-int-');
  });

  it('DISC-04: added game folder increments episodeCount 3→4 within 3 s', async () => {
    const newFolder = join(sandbox, 'leo', '2026-06-15_vs_panthers_1-0');
    mkdirSync(newFolder, { recursive: true });
    // Copy a real clip file so the folder has content
    copyFileSync(
      join(FIXTURE_ROOT, 'leo', '2026-05-13_vs_united_3-1', '01-clip.mp4'),
      join(newFolder, '01-clip.mp4'),
    );
    // Write a valid manifest
    writeSyntheticManifest(newFolder, {
      kid: 'leo',
      date: '2026-06-15',
      opponent: 'panthers',
      scoreFor: 1,
      scoreAgainst: 0,
      result: 'W',
      manifestHashHex: 'c'.repeat(64),
    });

    const elapsed = await pollEpisodeCount(4, 3000);
    expect(elapsed).toBeLessThan(3000);
  }, 10_000);

  it('DISC-04: deleted game folder decrements episodeCount 4→3 within 3 s', async () => {
    rmSync(join(sandbox, 'leo', '2026-06-15_vs_panthers_1-0'), {
      recursive: true,
      force: true,
    });

    const elapsed = await pollEpisodeCount(3, 3000);
    expect(elapsed).toBeLessThan(3000);
  }, 10_000);
});
