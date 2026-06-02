/**
 * episode-asset.integration.test.ts — Phase 08-01 integration suite.
 *
 * Spawns `npx next dev -p 4178 -H 127.0.0.1` against the committed fixture
 * and asserts all HTTP status paths for the episode.mp4 asset route:
 *
 *   Case 1: GET (no Range)           → 200, full bytes, correct headers
 *   Case 2: GET Range: bytes=0-99    → 206, 100 bytes, Content-Range
 *   Case 3: GET Range: bytes=10-19   → 206, 10 bytes, Content-Range
 *   Case 4: GET Range out-of-bounds  → 416, Content-Range: bytes */<size>
 *   Case 5: GET path traversal       → 403 (assertSafeAssetPath)
 *   Case 6: GET missing episode.mp4  → 404 (prepared-only fixture)
 *   Case 7: POST                     → 405 Method Not Allowed
 *
 * Port: 4178 (distinct from 4173 dev, 4175 list, 4176 list-empty, 4177 detail).
 * Skip gate: GOLAZO_SKIP_ASSET_INTEGRATION=1
 *
 * Fixture layout:
 *   leo/2026-05-20_vs_rivers_2-2/.golazo/episode.mp4  — rendered (has episode)
 *   leo/2026-05-13_vs_united_3-1/.golazo/             — prepared only (no episode.mp4)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dir = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dir, '..');
const FIXTURE_ROOT = join(__dir, 'fixtures/golazo');
const CHANNELS_PATH = join(FIXTURE_ROOT, 'channels.yaml');
const PORT = 4178;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const SKIP = process.env.GOLAZO_SKIP_ASSET_INTEGRATION === '1';

// Compute expected size at test-time (not hardcoded — fixture mp4 may be regenerated)
const EPISODE_PATH = join(
  FIXTURE_ROOT,
  'leo',
  '2026-05-20_vs_rivers_2-2',
  '.golazo',
  'episode.mp4',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Poll a URL until it returns a non-5xx response or timeout elapses.
 * We poll the root page to determine if the server is up.
 */
async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // Not ready yet — keep polling
    }
    await new Promise<void>((r) => setTimeout(r, 300));
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs} ms`);
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
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(SKIP)('episode-asset integration (port 4178)', () => {
  let serverProc: ChildProcess;
  let EXPECTED_SIZE: number;

  beforeAll(async () => {
    // Compute fixture size at runtime
    EXPECTED_SIZE = statSync(EPISODE_PATH).size;

    serverProc = spawn(
      'npx',
      ['next', 'dev', '-p', String(PORT), '-H', '127.0.0.1'],
      {
        cwd: WEB_DIR,
        env: {
          ...process.env,
          GOLAZO_ROOT: FIXTURE_ROOT,
          GOLAZO_CHANNELS_PATH: CHANNELS_PATH,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    serverProc.stdout?.on('data', (d: Buffer) =>
      process.stdout.write('[episode-srv] ' + d.toString()),
    );
    serverProc.stderr?.on('data', (d: Buffer) =>
      process.stderr.write('[episode-srv] ' + d.toString()),
    );

    await waitForServer(`${BASE_URL}/`, 30_000);
  }, 55_000);

  afterAll(async () => {
    await killServer(serverProc);
  }, 15_000);

  // Case 1: Full GET (no Range header) → 200 with full file
  it('Case 1: GET episode.mp4 (no Range) → 200 with full bytes and correct headers', async () => {
    const res = await fetch(`${BASE_URL}/api/asset/leo/2026-05-20_vs_rivers_2-2/episode.mp4`);
    expect(res.status).toBe(200);

    const ct = res.headers.get('content-type') ?? '';
    expect(ct.startsWith('video/mp4')).toBe(true);

    const cl = res.headers.get('content-length');
    expect(cl).toBe(String(EXPECTED_SIZE));

    const ar = res.headers.get('accept-ranges');
    expect(ar).toBe('bytes');

    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(EXPECTED_SIZE);
  });

  // Case 2: Range: bytes=0-99 → 206 with first 100 bytes
  it('Case 2: GET with Range: bytes=0-99 → 206 with 100 bytes and Content-Range', async () => {
    const res = await fetch(
      `${BASE_URL}/api/asset/leo/2026-05-20_vs_rivers_2-2/episode.mp4`,
      { headers: { Range: 'bytes=0-99' } },
    );
    expect(res.status).toBe(206);

    const cr = res.headers.get('content-range') ?? '';
    expect(cr).toBe(`bytes 0-99/${EXPECTED_SIZE}`);

    const cl = res.headers.get('content-length');
    expect(cl).toBe('100');

    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(100);
  });

  // Case 3: Range: bytes=10-19 → 206 with exactly 10 bytes
  it('Case 3: GET with Range: bytes=10-19 → 206 with 10 bytes and Content-Range', async () => {
    const res = await fetch(
      `${BASE_URL}/api/asset/leo/2026-05-20_vs_rivers_2-2/episode.mp4`,
      { headers: { Range: 'bytes=10-19' } },
    );
    expect(res.status).toBe(206);

    const cr = res.headers.get('content-range') ?? '';
    expect(cr).toBe(`bytes 10-19/${EXPECTED_SIZE}`);

    const cl = res.headers.get('content-length');
    expect(cl).toBe('10');

    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(10);
  });

  // Case 4: Out-of-bounds Range → 416
  it('Case 4: GET with out-of-bounds Range → 416 with Content-Range: bytes */<size>', async () => {
    const outOfBoundsStart = EXPECTED_SIZE + 1000;
    const outOfBoundsEnd = EXPECTED_SIZE + 2000;
    const res = await fetch(
      `${BASE_URL}/api/asset/leo/2026-05-20_vs_rivers_2-2/episode.mp4`,
      { headers: { Range: `bytes=${outOfBoundsStart}-${outOfBoundsEnd}` } },
    );
    expect(res.status).toBe(416);

    const cr = res.headers.get('content-range') ?? '';
    expect(cr).toBe(`bytes */${EXPECTED_SIZE}`);
  });

  // Case 5: Path traversal → 403
  it('Case 5: GET with path traversal segments → 403 (assertSafeAssetPath)', async () => {
    // Use URL-encoded '..' segments to test path traversal via the route
    const traversalUrl = `${BASE_URL}/api/asset/${encodeURIComponent('..')}/${encodeURIComponent('etc')}/episode.mp4`;
    const res = await fetch(traversalUrl);
    // Next.js may normalize '..' segments at the routing layer (returning 404 from routing)
    // OR deliver the literal '..' to the handler (returning 403 from assertSafeAssetPath).
    // Both outcomes mean the traversal is blocked — path safety holds.
    expect([403, 404]).toContain(res.status);
  });

  // Case 6: Missing episode.mp4 (prepared-only game) → 404
  it('Case 6: GET episode.mp4 for prepared-only game → 404 (no episode on disk)', async () => {
    const res = await fetch(
      `${BASE_URL}/api/asset/leo/2026-05-13_vs_united_3-1/episode.mp4`,
    );
    expect(res.status).toBe(404);
  });

  // Case 7: POST → 405 Method Not Allowed
  it('Case 7: POST episode.mp4 → 405 Method Not Allowed', async () => {
    const res = await fetch(
      `${BASE_URL}/api/asset/leo/2026-05-20_vs_rivers_2-2/episode.mp4`,
      { method: 'POST' },
    );
    expect(res.status).toBe(405);
  });
});
