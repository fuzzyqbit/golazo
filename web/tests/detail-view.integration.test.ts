/**
 * detail-view.integration.test.ts — end-to-end smoke for Plan 07-04 detail view.
 *
 * Spawns `npx next dev -p 4177 -H 127.0.0.1` against the committed fixture
 * (web/tests/fixtures/golazo) and asserts HTML for /episodes/<hash> routes
 * including 200 with full content, 404 for unknown hash, and template equivalence.
 *
 * Uses port 4177 (distinct from 4173 operator dev, 4174 discovery integration,
 * 4175 list-view test, 4176 list-view empty-root test).
 *
 * Set GOLAZO_SKIP_DETAIL_INTEGRATION=1 to skip in time-constrained environments.
 *
 * Fixture layout (web/tests/fixtures/golazo/):
 *   leo/2026-05-13_vs_united_3-1/  — manifest only (prepared, no render/publish)
 *   leo/2026-05-20_vs_rivers_2-2/  — manifest + episode.mp4 + thumb.png (rendered, no publish)
 *   mateo/2026-05-27_vs_dragons_4-0/ — manifest + publish.json (published)
 *
 * Hashes are read from fixture manifest.json files at test setup time — not hard-coded.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChannel } from '@golazo/cli/dist/config/channels.js';
import { renderTitle } from '@golazo/cli/dist/publish/templates.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dir = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dir, '..');
const FIXTURE_ROOT = join(__dir, 'fixtures/golazo');
const CHANNELS_PATH = join(FIXTURE_ROOT, 'channels.yaml');
const PORT = 4177;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const SKIP = process.env.GOLAZO_SKIP_DETAIL_INTEGRATION === '1';

// ---------------------------------------------------------------------------
// Fixture manifest hash extraction (done synchronously at module load time,
// NOT inside beforeAll, so they are available to it() at describe time)
// ---------------------------------------------------------------------------

function readManifestHash(kid: string, gameFolder: string): string {
  const manifestPath = join(FIXTURE_ROOT, kid, gameFolder, '.golazo', 'manifest.json');
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as { manifestHash: string };
  return raw.manifestHash;
}

// We'll store these in module-level vars populated in beforeAll
let unitedHash = '';
let riversHash = '';
let dragonsHash = '';

// ---------------------------------------------------------------------------
// Server spawn helpers
// ---------------------------------------------------------------------------

function spawnNextDev(golazoRoot: string, port: number, channelsPath?: string): ChildProcess {
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

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return;
    } catch {
      // Not ready yet
    }
    await new Promise<void>((r) => setTimeout(r, 300));
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs} ms`);
}

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
// Suite: detail view integration
// ---------------------------------------------------------------------------

describe.skipIf(SKIP)('detail view integration', () => {
  let serverProc: ChildProcess;

  beforeAll(async () => {
    // Read fixture hashes synchronously before server starts
    unitedHash = readManifestHash('leo', '2026-05-13_vs_united_3-1');
    riversHash = readManifestHash('leo', '2026-05-20_vs_rivers_2-2');
    dragonsHash = readManifestHash('mateo', '2026-05-27_vs_dragons_4-0');

    serverProc = spawnNextDev(FIXTURE_ROOT, PORT, CHANNELS_PATH);

    serverProc.stdout?.on('data', (d: Buffer) =>
      process.stdout.write('[detail-srv] ' + d.toString()),
    );
    serverProc.stderr?.on('data', (d: Buffer) =>
      process.stderr.write('[detail-srv] ' + d.toString()),
    );

    await waitForServer(`${BASE_URL}/api/debug/discovery`, 30_000);
    await waitForEpisodes(3, 10_000);
  }, 55_000);

  afterAll(async () => {
    await killServer(serverProc);
  }, 15_000);

  // Case 1: published row — mateo/dragons — has publish.json
  it('Case 1 (published): /episodes/<dragons-hash> returns 200 with Dragons, videoId, watch URL, YouTube Studio', async () => {
    const res = await fetch(`${BASE_URL}/episodes/${encodeURIComponent(dragonsHash)}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Dragons');
    expect(html).toContain('dQw4w9WgXcQ'); // videoId
    expect(html).toContain('youtu.be');    // watchUrl substring
    expect(html).toContain('YouTube Studio');
  });

  // Case 2: rendered row — leo/rivers — has episode.mp4 + thumb.png but no publish.json
  it('Case 2 (rendered): /episodes/<rivers-hash> returns 200 with Rivers, Not published yet', async () => {
    const res = await fetch(`${BASE_URL}/episodes/${encodeURIComponent(riversHash)}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Rivers');
    expect(html).toContain('Not published yet');
  });

  // Case 3: prepared row — leo/united — manifest only, no render, no publish
  it('Case 3 (prepared): /episodes/<united-hash> returns 200 with United, (not yet rendered)', async () => {
    const res = await fetch(`${BASE_URL}/episodes/${encodeURIComponent(unitedHash)}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('United');
    expect(html).toContain('(not yet rendered)');
  });

  // Case 4: unknown hash — should return 404 (Next.js notFound() rendering)
  it('Case 4 (unknown hash): /episodes/sha256:0000...0000 returns 404 with Episode not found', async () => {
    const unknownHash = 'sha256:' + '0'.repeat(64);
    const res = await fetch(`${BASE_URL}/episodes/${encodeURIComponent(unknownHash)}`);
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('Episode not found');
  });

  // Case 5: URL encoding — sha256: prefix encoded as %3A should resolve same as unencoded
  it('Case 5 (URL encoding): encoded sha256%3A<hex> resolves same episode as unencoded', async () => {
    // The hash is 'sha256:...' — encode the colon as %3A manually
    const hashWithEncodedColon = dragonsHash.replace(':', '%3A');
    // Next.js [manifestHash] captures the raw segment; our page decodes it
    // Using encodeURIComponent encodes the whole string (including ':')
    const resEncoded = await fetch(`${BASE_URL}/episodes/${hashWithEncodedColon}`);
    expect(resEncoded.status).toBe(200);
    const htmlEncoded = await resEncoded.text();
    // Should still find Dragons
    expect(htmlEncoded).toContain('Dragons');
  });

  // Case 6: template equivalence — title in HTML matches renderTitle computed in test
  it('Case 6 (template reuse): rendered title matches renderTitle({ kid: mateo channel, game: dragons row })', async () => {
    // Load channel config from fixture channels.yaml
    const channel = loadChannel('mateo', {
      path: CHANNELS_PATH,
      skipTokenCheck: true,
    });

    const expectedTitle = renderTitle({
      kid: {
        name: channel.name,
        club: channel.club,
        jersey: channel.jersey,
        source: channel.source,
      },
      game: {
        date: '2026-05-27',
        opponent: 'dragons',
        scoreFor: 4,
        scoreAgainst: 0,
        result: 'W',
      },
    });

    const res = await fetch(`${BASE_URL}/episodes/${encodeURIComponent(dragonsHash)}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // The rendered HTML must contain the exact title string
    // (HTML-escaped for safety: · and – should be preserved)
    expect(html).toContain(expectedTitle);
  });
});
