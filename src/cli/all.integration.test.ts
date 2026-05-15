/**
 * Shell-out integration tests for `golazo all <folder>` (Plan 04-01 Task 2).
 *
 * Because nock does NOT cross process boundaries (it only intercepts HTTP in the
 * same Node process), the YouTube API calls are stubbed via a separate nock-based
 * in-process approach using GOLAZO_OAUTH_MOCK=1 + nock interceptors.
 *
 * Split into two describe blocks:
 *
 *   Block 1 (in-process with nock, cases 1-5):
 *     Drives golazo all via the exported `main()` function directly in-process.
 *     nock intercepts the YouTube API calls made by runPublish.
 *     process.stdout/stderr spied to capture output.
 *     Fixture folder contents are copied to a tmpdir sandbox for isolation.
 *
 *   Block 2 (shell-out without nock, cases 6):
 *     Spawns `npx tsx src/cli/index.ts all ...` via child_process.
 *     Used for the stub-removal gate and token-leakage check (which works
 *     because the failure happens before any YouTube network call).
 *
 * Sandbox layout: <tmpdir>/tests/fixtures/golazo/leo/<game-folder>/
 * This mirrors the publish.integration.test.ts sandbox convention so
 * resolveKidFromPath → loadChannel → tilde-path token resolution all work.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import nock from 'nock';

import { main } from './index.js';
import { writePublishRecord } from '../publish/index.js';
import { PRIVACY_STATUS } from '../publish/uploader.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(process.cwd());
const FIXTURE_CHANNELS_DIR = resolve(REPO_ROOT, 'tests/fixtures/golazo');
const YOUTUBE_HOST = 'https://youtube.googleapis.com';
const VIDEO_INSERT_PATH = '/upload/youtube/v3/videos';
const THUMBNAIL_SET_PATH = '/upload/youtube/v3/thumbnails/set';
const GAME_FOLDER_NAME = '2026-05-13_vs_united_3-1';

// ---------------------------------------------------------------------------
// nock helpers (mirror publish.integration.test.ts pattern)
// ---------------------------------------------------------------------------

function stubVideoInsertHappy(videoId: string): void {
  nock(YOUTUBE_HOST)
    .post(VIDEO_INSERT_PATH)
    .query(true)
    .reply(200, {
      id: videoId,
      snippet: { title: 'x', description: 'x' },
      status: { privacyStatus: 'unlisted' },
    });
}

function stubThumbnailSetHappy(videoId: string): void {
  nock(YOUTUBE_HOST)
    .post(THUMBNAIL_SET_PATH)
    .query(true)
    .reply(200, { kind: 'youtube#thumbnailSetResponse', items: [{ videoId }] });
}

function stubQuotaExceeded(): void {
  nock(YOUTUBE_HOST)
    .post(VIDEO_INSERT_PATH)
    .query(true)
    .times(5)
    .reply(403, {
      error: {
        code: 403,
        errors: [{ reason: 'quotaExceeded', domain: 'youtube.quota', message: 'quota exceeded' }],
      },
    });
}

// ---------------------------------------------------------------------------
// Sandbox helpers
// ---------------------------------------------------------------------------

/** Far-future fake token — loadToken will not attempt a refresh. */
const FAKE_TOKEN_JSON = JSON.stringify(
  {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    expiry_date: Date.now() + 365 * 24 * 60 * 60 * 1000,
    scope: 'https://www.googleapis.com/auth/youtube.upload',
    token_type: 'Bearer',
  },
  null,
  2,
);

/**
 * Creates a sandbox tmpdir with the fixture game folder + fake tokens.
 * Returns the sandbox root path.
 */
function makeSandbox(): string {
  const sandbox = mkdtempSync(join(tmpdir(), 'golazo-all-integ-'));
  cpSync(FIXTURE_CHANNELS_DIR, join(sandbox, 'tests/fixtures/golazo'), { recursive: true });
  writeFileSync(join(sandbox, 'tests/fixtures/golazo/leo.token.json'), FAKE_TOKEN_JSON, 'utf8');
  writeFileSync(join(sandbox, 'tests/fixtures/golazo/mateo.token.json'), FAKE_TOKEN_JSON, 'utf8');
  return sandbox;
}

/** Returns the absolute path to the game folder inside a sandbox. */
function gameFolder(sandbox: string): string {
  return join(sandbox, 'tests/fixtures/golazo/leo', GAME_FOLDER_NAME);
}

/** Returns the absolute channels.yaml path inside a sandbox. */
function channelsConfig(sandbox: string): string {
  return join(sandbox, 'tests/fixtures/golazo/channels.yaml');
}

// ---------------------------------------------------------------------------
// Shell-out helper
// ---------------------------------------------------------------------------

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], env: Record<string, string | undefined>): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', 'src/cli/index.ts', ...args], {
      env: { ...process.env, ...env },
      cwd: REPO_ROOT,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('close', (code) => { resolve({ code, stdout, stderr }); });
  });
}

// ===========================================================================
// BLOCK 1: in-process with nock
// ===========================================================================

describe('all CLI in-process (with nock)', () => {
  let sandbox: string;
  let stdoutChunks: string[];
  let stderrChunks: string[];

  beforeEach(() => {
    sandbox = makeSandbox();
    vi.stubEnv('HOME', sandbox);
    vi.stubEnv('GOOGLE_CLIENT_ID', 'x');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'y');
    vi.stubEnv('GOLAZO_OAUTH_MOCK', '1');
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1'); // allow Remotion's local file server
    stdoutChunks = [];
    stderrChunks = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    nock.cleanAll();
    nock.enableNetConnect();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it(
    '1. HAPPY PATH: exit 0, stdout has 3 sub-stage lines in order, all 4 artifacts present, nock consumed',
    async () => {
      const folder = gameFolder(sandbox);
      const channels = channelsConfig(sandbox);

      stubVideoInsertHappy('all-test-id');
      stubThumbnailSetHappy('all-test-id');

      let thrown: unknown = null;
      try {
        await main([
          'node', 'golazo', 'all', folder,
          '--channels-config', channels,
          '--low-res',
        ]);
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeNull();
      const stdout = stdoutChunks.join('');

      // stdout must contain the three frozen sub-stage output lines in order
      const manifestIdx = Math.max(
        stdout.indexOf('manifest written to '),
        stdout.indexOf('manifest up to date'),
      );
      const renderIdx = Math.max(
        stdout.indexOf('episode rendered'),
        stdout.indexOf('render up to date'),
      );
      const publishIdx = Math.max(
        stdout.indexOf('video published'),
        stdout.indexOf('publish up to date'),
      );

      expect(manifestIdx).toBeGreaterThanOrEqual(0);
      expect(renderIdx).toBeGreaterThan(manifestIdx);
      expect(publishIdx).toBeGreaterThan(renderIdx);

      // All four artifacts present
      expect(existsSync(join(folder, '.golazo', 'manifest.json'))).toBe(true);
      expect(existsSync(join(folder, '.golazo', 'episode.mp4'))).toBe(true);
      expect(existsSync(join(folder, '.golazo', 'thumb.png'))).toBe(true);
      expect(existsSync(join(folder, '.golazo', 'publish.json'))).toBe(true);

      // nock interceptors consumed
      expect(nock.isDone()).toBe(true);
    },
    120_000,
  );

  it(
    '2. IDEMPOTENT RE-RUN: after artifacts exist, stdout has skip lines, nock NOT consumed',
    async () => {
      const folder = gameFolder(sandbox);
      const channels = channelsConfig(sandbox);

      // First run — create all artifacts
      stubVideoInsertHappy('all-idempotent-id');
      stubThumbnailSetHappy('all-idempotent-id');
      await main([
        'node', 'golazo', 'all', folder,
        '--channels-config', channels,
        '--low-res',
      ]);
      nock.cleanAll();
      stdoutChunks.length = 0;

      // Second run with NO nock interceptors registered
      let thrown: unknown = null;
      try {
        await main([
          'node', 'golazo', 'all', folder,
          '--channels-config', channels,
          '--low-res',
        ]);
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeNull();
      const stdout = stdoutChunks.join('');
      expect(stdout).toContain('manifest up to date (hash matches)');
      expect(stdout).toContain('render up to date (hash matches)');
      expect(stdout).toContain('publish up to date (videoId: all-idempotent-id)');
      // No interceptors registered = none consumed (isDone trivially true, but pendingMocks empty)
      expect(nock.pendingMocks().length).toBe(0);
    },
    120_000,
  );

  it(
    '3. --force RE-RUNS ALL THREE: stdout has force lines, nock interceptors consumed',
    async () => {
      const folder = gameFolder(sandbox);
      const channels = channelsConfig(sandbox);

      // First run to create artifacts
      stubVideoInsertHappy('all-force-old-id');
      stubThumbnailSetHappy('all-force-old-id');
      await main([
        'node', 'golazo', 'all', folder,
        '--channels-config', channels,
        '--low-res',
      ]);
      nock.cleanAll();
      stdoutChunks.length = 0;

      // Force run — register fresh interceptors
      stubVideoInsertHappy('all-force-new-id');
      stubThumbnailSetHappy('all-force-new-id');

      let thrown: unknown = null;
      try {
        await main([
          'node', 'golazo', 'all', folder,
          '--channels-config', channels,
          '--low-res',
          '--force',
        ]);
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeNull();
      const stdout = stdoutChunks.join('');
      expect(stdout).toContain('manifest rewritten (force)');
      expect(stdout).toContain('episode re-rendered (force)');
      expect(stdout).toContain('video re-published (force)');
      expect(nock.isDone()).toBe(true);
    },
    120_000,
  );

  it(
    '4. PREPARE STAGE FAILURE: exit 1, stderr has original error + stage label, no .golazo/ dir',
    async () => {
      const sandbox2 = makeSandbox();
      // Create a folder with a malformed name that will fail FilenameError
      const malformedFolder = join(sandbox2, 'tests/fixtures/golazo/leo', 'MALFORMED_FOLDER_NAME');
      mkdirSync(malformedFolder, { recursive: true });

      vi.unstubAllEnvs();
      vi.stubEnv('HOME', sandbox2);
      vi.stubEnv('GOOGLE_CLIENT_ID', 'x');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'y');
      vi.stubEnv('GOLAZO_OAUTH_MOCK', '1');

      let thrown: unknown = null;
      try {
        await main([
          'node', 'golazo', 'all', malformedFolder,
          '--channels-config', channelsConfig(sandbox2),
          '--low-res',
        ]);
      } catch (e) {
        thrown = e;
      }

      expect(thrown).not.toBeNull();
      expect((thrown as { exitCode?: number }).exitCode).toBe(1);
      const stderr = stderrChunks.join('');
      // FilenameError stable contract from Plan 01-03
      expect(stderr).toContain('Expected format: YYYY-MM-DD_vs_<slug>_<for>-<against>');
      // Stage label line
      expect(stderr).toContain("golazo all: stage 'prepare' failed");
      // No .golazo/ dir created
      expect(existsSync(join(malformedFolder, '.golazo'))).toBe(false);

      rmSync(sandbox2, { recursive: true, force: true });
    },
    30_000,
  );

  it(
    '5. PUBLISH STAGE FAILURE (quota): exit 1, stderr has quota msg + stage label, earlier artifacts preserved',
    async () => {
      const folder = gameFolder(sandbox);
      const channels = channelsConfig(sandbox);

      // First run — create manifest + episode + thumb
      stubVideoInsertHappy('all-quota-initial-id');
      stubThumbnailSetHappy('all-quota-initial-id');
      await main([
        'node', 'golazo', 'all', folder,
        '--channels-config', channels,
        '--low-res',
      ]);
      nock.cleanAll();
      stdoutChunks.length = 0;
      stderrChunks.length = 0;

      // Now force a new upload that will quota-fail
      stubQuotaExceeded();

      let thrown: unknown = null;
      try {
        await main([
          'node', 'golazo', 'all', folder,
          '--channels-config', channels,
          '--low-res',
          '--force',
        ]);
      } catch (e) {
        thrown = e;
      }

      expect(thrown).not.toBeNull();
      expect((thrown as { exitCode?: number }).exitCode).toBe(1);
      const stderr = stderrChunks.join('');
      expect(stderr).toMatch(/quota|Quota/i);
      expect(stderr).toContain("golazo all: stage 'publish' failed");

      // Earlier artifacts still present (no cleanup)
      expect(existsSync(join(folder, '.golazo', 'manifest.json'))).toBe(true);
      expect(existsSync(join(folder, '.golazo', 'episode.mp4'))).toBe(true);
      expect(existsSync(join(folder, '.golazo', 'thumb.png'))).toBe(true);
    },
    // Two full Remotion renders (initial + --force re-run). Coverage instrumentation
    // adds significant overhead — 240 s gives headroom in both modes.
    240_000,
  );
});

// ===========================================================================
// BLOCK 2: shell-out without nock
// ===========================================================================

describe('all CLI shell-out (no nock)', () => {
  it(
    '6. STUB REMOVAL GATE + TOKEN LEAKAGE: all.ts does not contain "not yet implemented"; token bytes absent from output',
    async () => {
      // Stub removal gate
      const allTs = readFileSync(
        resolve(REPO_ROOT, 'src/cli/commands/all.ts'),
        'utf8',
      );
      expect(allTs).not.toContain('all: not yet implemented');

      // Token leakage check via shell-out (will fail early on missing manifest,
      // enough to verify token bytes never appear in output)
      const sandbox = makeSandbox();
      const folder = gameFolder(sandbox);

      const result = await runCli(
        [
          'all', folder,
          '--channels-config', channelsConfig(sandbox),
          '--low-res',
        ],
        {
          HOME: sandbox,
          GOOGLE_CLIENT_ID: 'x',
          GOOGLE_CLIENT_SECRET: 'y',
          GOLAZO_OAUTH_MOCK: '1',
        },
      );

      // Will fail at prepare stage (folder exists but may succeed — doesn't matter)
      // What matters: no mock token bytes appear
      expect(result.stdout).not.toContain('mock-access');
      expect(result.stdout).not.toContain('mock-refresh');
      expect(result.stderr).not.toContain('mock-access');
      expect(result.stderr).not.toContain('mock-refresh');

      rmSync(sandbox, { recursive: true, force: true });
    },
    60_000,
  );
});
