/**
 * detail-player.integration.test.ts — Plan 08-02 integration test for the HTML5
 * video player wired into the EpisodeDetail component.
 *
 * Spawns `npx next dev -p 4179 -H 127.0.0.1` against the committed fixture
 * (web/tests/fixtures/golazo) and asserts:
 *   Case 1 — rendered row (leo/rivers): HTML contains <video> + correct src + poster URLs
 *   Case 2 — published row (mateo/dragons): HTML contains <video> + correct src + YouTube Studio link
 *   Case 3 — prepared row (leo/united): HTML does NOT contain <video> + shows hint text
 *   Case 4 — URL helper agreement: src attribute in Case 1 HTML equals episodeUrlFor computed in-test
 *
 * Uses port 4179 (distinct from 4177 detail-view, 4175 list-view, 4176 list-view-empty, etc.).
 *
 * Set GOLAZO_SKIP_DETAIL_PLAYER_INTEGRATION=1 to skip in time-constrained environments.
 *
 * Fixture layout (web/tests/fixtures/golazo/):
 *   leo/2026-05-13_vs_united_3-1/  — manifest only (prepared, no render/publish) → NO <video>
 *   leo/2026-05-20_vs_rivers_2-2/  — manifest + episode.mp4 + thumb.png (rendered) → <video>
 *   mateo/2026-05-27_vs_dragons_4-0/ — manifest + episode.mp4 + publish.json + thumb.png (published) → <video>
 *
 * Hashes are read from fixture manifest.json files at test setup time — not hard-coded.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { episodeUrlFor } from '../src/lib/ui/episodeUrl.js';
import { thumbUrlFor } from '../src/lib/ui/thumbUrl.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dir = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dir, '..');
const FIXTURE_ROOT = join(__dir, 'fixtures/golazo');
const CHANNELS_PATH = join(FIXTURE_ROOT, 'channels.yaml');
const PORT = 4179;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const SKIP = process.env.GOLAZO_SKIP_DETAIL_PLAYER_INTEGRATION === '1';

// ---------------------------------------------------------------------------
// Fixture rows (known at compile time — must match fixture filenames)
// ---------------------------------------------------------------------------

const RIVERS_ROW = { kid: 'leo', gameFolder: '2026-05-20_vs_rivers_2-2' };
const DRAGONS_ROW = { kid: 'mateo', gameFolder: '2026-05-27_vs_dragons_4-0' };
const UNITED_ROW = { kid: 'leo', gameFolder: '2026-05-13_vs_united_3-1' };

// ---------------------------------------------------------------------------
// Fixture manifest hash extraction
// ---------------------------------------------------------------------------

function readManifestHash(kid: string, gameFolder: string): string {
  const manifestPath = join(FIXTURE_ROOT, kid, gameFolder, '.golazo', 'manifest.json');
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as { manifestHash: string };
  return raw.manifestHash;
}

let riversHash = '';
let dragonsHash = '';
let unitedHash = '';

// ---------------------------------------------------------------------------
// Server spawn helpers (mirrors detail-view.integration.test.ts)
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
// Suite: detail player integration
// ---------------------------------------------------------------------------

describe.skipIf(SKIP)('detail player integration (port 4179)', () => {
  let serverProc: ChildProcess;

  beforeAll(async () => {
    // Read fixture hashes synchronously before server starts
    riversHash = readManifestHash(RIVERS_ROW.kid, RIVERS_ROW.gameFolder);
    dragonsHash = readManifestHash(DRAGONS_ROW.kid, DRAGONS_ROW.gameFolder);
    unitedHash = readManifestHash(UNITED_ROW.kid, UNITED_ROW.gameFolder);

    serverProc = spawnNextDev(FIXTURE_ROOT, PORT, CHANNELS_PATH);

    serverProc.stdout?.on('data', (d: Buffer) =>
      process.stdout.write('[player-srv] ' + d.toString()),
    );
    serverProc.stderr?.on('data', (d: Buffer) =>
      process.stderr.write('[player-srv] ' + d.toString()),
    );

    await waitForServer(`${BASE_URL}/api/debug/discovery`, 30_000);
    await waitForEpisodes(3, 10_000);
  }, 55_000);

  afterAll(async () => {
    await killServer(serverProc);
  }, 15_000);

  // Case 1: rendered row — leo/rivers — has episode.mp4 + thumb.png, no publish.json
  it('Case 1 (rendered): detail page contains <video> with correct src and poster URLs', async () => {
    const res = await fetch(`${BASE_URL}/episodes/${encodeURIComponent(riversHash)}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // Must contain the <video element
    expect(html).toContain('<video');

    // src must match the episode URL for leo/rivers
    const expectedSrc = episodeUrlFor(RIVERS_ROW);
    expect(html).toContain(expectedSrc);

    // poster must match the thumb URL for leo/rivers
    const expectedPoster = thumbUrlFor(RIVERS_ROW);
    expect(html).toContain(expectedPoster);

    // Must have controls attribute
    expect(html).toContain('controls');

    // Must have preload="metadata"
    expect(html).toContain('preload="metadata"');
  });

  // Case 2: published row — mateo/dragons — has episode.mp4 + publish.json
  it('Case 2 (published): detail page contains <video> + correct src + YouTube Studio link (Phase 7 regression guard)', async () => {
    const res = await fetch(`${BASE_URL}/episodes/${encodeURIComponent(dragonsHash)}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // Must contain the <video element
    expect(html).toContain('<video');

    // src must match the episode URL for mateo/dragons
    const expectedSrc = episodeUrlFor(DRAGONS_ROW);
    expect(html).toContain(expectedSrc);

    // poster must match the thumb URL for mateo/dragons
    const expectedPoster = thumbUrlFor(DRAGONS_ROW);
    expect(html).toContain(expectedPoster);

    // Phase 7 regression guard: YouTube Studio link must still be present
    expect(html).toContain('YouTube Studio');
    // videoId from fixture publish.json
    expect(html).toContain('dQw4w9WgXcQ');
  });

  // Case 3: prepared row — leo/united — manifest only, no episode.mp4
  it('Case 3 (prepared): detail page does NOT contain <video>, shows render hint', async () => {
    const res = await fetch(`${BASE_URL}/episodes/${encodeURIComponent(unitedHash)}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // Must NOT contain a <video element
    expect(html).not.toContain('<video');

    // Must contain the prepared hint text
    expect(html).toContain('Render this episode to enable playback');
  });

  // Case 4: URL helper agreement — src attribute in Case 1 HTML equals episodeUrlFor result
  it('Case 4 (URL helper agreement): src attribute from rendered HTML equals episodeUrlFor({ kid: leo, gameFolder: rivers })', async () => {
    const res = await fetch(`${BASE_URL}/episodes/${encodeURIComponent(riversHash)}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // Extract src attribute value from the <video> tag via regex
    // Matches src="..." or src='...' patterns
    const srcMatch = html.match(/src="([^"]*episode\.mp4[^"]*)"/);
    expect(srcMatch).not.toBeNull();

    const srcFromHtml = srcMatch![1];

    // HTML-decode the value (Next.js may encode & as &amp; in attribute values)
    // For URL paths, only & is likely encoded; use a simple replace
    const decodedSrc = srcFromHtml.replace(/&amp;/g, '&');

    // Assert it strictly equals episodeUrlFor (single source of truth gate)
    const expectedSrc = episodeUrlFor(RIVERS_ROW);
    expect(decodedSrc).toBe(expectedSrc);
  });
});
