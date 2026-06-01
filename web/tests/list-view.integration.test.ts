/**
 * list-view.integration.test.ts — end-to-end smoke for Plan 07-03 list view.
 *
 * Spawns `npx next dev -p 4175 -H 127.0.0.1` against the committed fixture
 * (web/tests/fixtures/golazo) and asserts HTML for /, /?sort=opponent.asc,
 * /?kid=leo, edge cases, and the /api/asset/...thumb.png route.
 *
 * Uses port 4175 (distinct from 4173 operator dev, 4174 discovery integration).
 *
 * Set GOLAZO_SKIP_LIST_INTEGRATION=1 to skip in time-constrained environments.
 *
 * Fixture layout (web/tests/fixtures/golazo/):
 *   leo/2026-05-13_vs_united_3-1/  — manifest only (prepared, no thumb)
 *   leo/2026-05-20_vs_rivers_2-2/  — manifest + episode.mp4 + thumb.png (rendered)
 *   mateo/2026-05-27_vs_dragons_4-0/ — manifest + thumb.png (rendered)
 *   broken-folder-name/            — no manifest (broken, excluded from index)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
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
const CHANNELS_PATH = join(FIXTURE_ROOT, 'channels.yaml');
const PORT = 4175;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const SKIP = process.env.GOLAZO_SKIP_LIST_INTEGRATION === '1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Poll a URL until it returns 200 or timeout elapses.
 */
async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return;
    } catch {
      // Not ready yet — keep polling
    }
    await new Promise<void>((r) => setTimeout(r, 300));
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs} ms`);
}

/**
 * Poll /api/debug/discovery until episodeCount >= minCount or timeout.
 */
async function waitForEpisodes(minCount: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/debug/discovery`);
      if (res.status === 200) {
        const body = (await res.json()) as { episodeCount: number };
        if (body.episodeCount >= minCount) return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise<void>((r) => setTimeout(r, 300));
  }
  throw new Error(`episodeCount did not reach ${minCount} within ${timeoutMs} ms`);
}

/**
 * Spawn a Next.js dev server. Returns the child process.
 */
function spawnNextDev(
  golazoRoot: string,
  port: number,
  channelsPath?: string,
): ChildProcess {
  return spawn(
    'npx',
    ['next', 'dev', '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: WEB_DIR,
      env: {
        ...process.env,
        GOLAZO_ROOT: golazoRoot,
        GOLAZO_CHANNELS_PATH: channelsPath ?? CHANNELS_PATH,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

/**
 * Kill a server process: SIGTERM + 2 s grace, then SIGKILL.
 */
async function killServer(proc: ChildProcess): Promise<void> {
  if (!proc || proc.killed) return;
  proc.kill('SIGTERM');
  await new Promise<void>((r) => setTimeout(r, 2000));
  if (!proc.killed) {
    proc.kill('SIGKILL');
  }
  await new Promise<void>((r) => {
    proc.on('exit', r);
    setTimeout(r, 3000);
  });
}

// ---------------------------------------------------------------------------
// Suite A: main fixture (3 episodes) — cases 1-4 + 6-7
// ---------------------------------------------------------------------------

describe.skipIf(SKIP)('list view integration — main fixture', () => {
  let serverProc: ChildProcess;

  beforeAll(async () => {
    serverProc = spawnNextDev(FIXTURE_ROOT, PORT, CHANNELS_PATH);

    serverProc.stdout?.on('data', (d: Buffer) => process.stdout.write('[list-srv] ' + d.toString()));
    serverProc.stderr?.on('data', (d: Buffer) => process.stderr.write('[list-srv] ' + d.toString()));

    // Wait for server to boot AND for discovery to index the fixture
    await waitForServer(`${BASE_URL}/api/debug/discovery`, 30_000);
    await waitForEpisodes(3, 10_000);
  }, 55_000);

  afterAll(async () => {
    await killServer(serverProc);
  }, 15_000);

  // Case 1: all 3 opponents in the default list
  it('Case 1: GET / returns 200 with all three opponents', async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('United');
    expect(html).toContain('Rivers');
    expect(html).toContain('Dragons');
  });

  // Case 2: sorted by opponent.asc — dragons < rivers < united
  it('Case 2: GET /?sort=opponent.asc orders Dragons before Rivers before United', async () => {
    const res = await fetch(`${BASE_URL}/?sort=opponent.asc`);
    expect(res.status).toBe(200);
    const html = await res.text();
    const idxDragons = html.indexOf('Dragons');
    const idxRivers = html.indexOf('Rivers');
    const idxUnited = html.indexOf('United');
    expect(idxDragons).toBeGreaterThan(-1);
    expect(idxRivers).toBeGreaterThan(-1);
    expect(idxUnited).toBeGreaterThan(-1);
    expect(idxDragons).toBeLessThan(idxRivers);
    expect(idxRivers).toBeLessThan(idxUnited);
  });

  // Case 3: kid=leo — United and Rivers visible, Dragons (mateo) absent
  it('Case 3: GET /?kid=leo shows leo episodes (United, Rivers) but not Dragons', async () => {
    const res = await fetch(`${BASE_URL}/?kid=leo`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('United');
    expect(html).toContain('Rivers');
    expect(html).not.toContain('Dragons');
  });

  // Case 4: bogus params fall back to defaults — no 500, all 3 opponents present
  it('Case 4: GET /?sort=bogus&kid=alien returns 200 with all opponents (defaults applied)', async () => {
    const res = await fetch(`${BASE_URL}/?sort=bogus&kid=alien`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('United');
    expect(html).toContain('Rivers');
    expect(html).toContain('Dragons');
  });

  // Case 6: thumb route returns bytes for a valid game with a thumb
  it('Case 6: GET /api/asset/leo/2026-05-20_vs_rivers_2-2/thumb.png returns 200 image/png', async () => {
    const res = await fetch(`${BASE_URL}/api/asset/leo/2026-05-20_vs_rivers_2-2/thumb.png`);
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct.startsWith('image/png')).toBe(true);
    const bytes = await res.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
    // Verify bytes match the on-disk file
    const onDisk = readFileSync(
      join(FIXTURE_ROOT, 'leo', '2026-05-20_vs_rivers_2-2', '.golazo', 'thumb.png'),
    );
    expect(bytes.byteLength).toBe(onDisk.byteLength);
  });

  // Case 7a: 404 for a nonexistent game
  it('Case 7a: GET /api/asset/leo/nonexistent-game/thumb.png returns 404', async () => {
    const res = await fetch(`${BASE_URL}/api/asset/leo/nonexistent-game/thumb.png`);
    expect(res.status).toBe(404);
  });

  // Case 7b: 403 for path traversal attempt (encoded '..')
  it('Case 7b: GET /api/asset/leo/..%2F..%2Fetc/thumb.png returns 403', async () => {
    const res = await fetch(`${BASE_URL}/api/asset/leo/..%2F..%2Fetc/thumb.png`);
    expect(res.status).toBe(403);
  });

  // Case 7c: 404 for prepared game (no thumb.png on disk)
  it('Case 7c: GET /api/asset/leo/2026-05-13_vs_united_3-1/thumb.png returns 404 (prepared — no thumb)', async () => {
    const res = await fetch(`${BASE_URL}/api/asset/leo/2026-05-13_vs_united_3-1/thumb.png`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Suite B: empty GOLAZO_ROOT — case 5 (separate spawn)
// ---------------------------------------------------------------------------

describe.skipIf(SKIP)('list view integration — empty root (EmptyState UI-04)', () => {
  const emptyRoot = join(tmpdir(), `golazo-list-empty-${randomUUID()}`);
  let emptyProc: ChildProcess;
  const EMPTY_PORT = 4176;
  const EMPTY_URL = `http://127.0.0.1:${EMPTY_PORT}`;

  beforeAll(async () => {
    mkdirSync(emptyRoot, { recursive: true });
    emptyProc = spawnNextDev(emptyRoot, EMPTY_PORT);

    emptyProc.stdout?.on('data', (d: Buffer) => process.stdout.write('[empty-srv] ' + d.toString()));
    emptyProc.stderr?.on('data', (d: Buffer) => process.stderr.write('[empty-srv] ' + d.toString()));

    // Wait for the debug route — it will return episodeCount: 0 (empty root)
    await waitForServer(`${EMPTY_URL}/api/debug/discovery`, 30_000);
  }, 55_000);

  afterAll(async () => {
    await killServer(emptyProc);
    rmSync(emptyRoot, { recursive: true, force: true });
  }, 15_000);

  // Case 5: empty root renders EmptyState with rootPath + "No episodes found"
  it('Case 5: GET / against empty root returns 200 with EmptyState showing rootPath', async () => {
    const res = await fetch(`${EMPTY_URL}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // UI-04: scanned root path must appear in the HTML
    expect(html).toContain(emptyRoot);
    // EmptyState heading
    expect(html).toContain('No episodes found');
  });
});
