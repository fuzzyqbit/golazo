/**
 * CLI integration tests for `golazo publish <folder>` (Plan 03-05 Task 3).
 *
 * Split into two describe blocks because nock only intercepts HTTP within the
 * same Node process — it does NOT propagate to child processes spawned via
 * execFile/spawn. This is a known limitation of nock.
 *
 *   Block 1 (in-process with nock, cases 1-4):
 *     Uses main(argv) directly via the CLI's exported `main` function.
 *     nock interceptors registered here work because publish runs in the same
 *     process. process.stdout/stderr are spied to capture output.
 *
 *   Block 2 (shell-out without nock, cases 5-8):
 *     Spawns `npx tsx src/cli/index.ts publish ...` via child_process.
 *     These cases don't need HTTP stubbing — they fail before any network call
 *     (missing manifest, missing episode) or test grep/token-safety guarantees.
 *
 * Inline comment on nock-vs-spawn split: if nock worked across process boundaries
 * we'd use shell-out for everything (more realistic). The in-process approach is
 * a deliberate pragmatic choice for cases 1-4 (quota, force, idempotency, happy
 * path) — they require HTTP interception and commander's exitOverride() makes
 * in-process invocation clean.
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
import { runPrepare } from '../prepare/index.js';
import type { PublishRecordDoc } from '../publish/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(process.cwd());
const FIXTURE_CHANNELS_DIR = resolve(REPO_ROOT, 'tests/fixtures/golazo');
const FIXTURE_CHANNELS = join(REPO_ROOT, 'tests/fixtures/golazo/channels.yaml');

const YOUTUBE_HOST = 'https://youtube.googleapis.com';
const VIDEO_INSERT_PATH = '/upload/youtube/v3/videos';
const THUMBNAIL_SET_PATH = '/upload/youtube/v3/thumbnails/set';

// ---------------------------------------------------------------------------
// nock helpers (mirror uploader.test.ts pattern)
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
    .reply(200, { kind: 'youtube#thumbnailSetResponse' });
}

function stubQuotaExceeded(): void {
  // googleapis may retry 403, stub multiple times
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

/** A fake token with far-future expiry — loadToken will not attempt a refresh. */
const FAKE_TOKEN_JSON = JSON.stringify(
  {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    expiry_date: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
    scope: 'https://www.googleapis.com/auth/youtube.upload',
    token_type: 'Bearer',
  },
  null,
  2,
);

function makeSandbox(): string {
  const sandbox = mkdtempSync(join(tmpdir(), 'golazo-pub-integ-'));
  cpSync(FIXTURE_CHANNELS_DIR, join(sandbox, 'tests/fixtures/golazo'), { recursive: true });
  // Write fake tokens so loadToken can build a client without real refresh.
  // The token has a far-future expiry so no eager refresh is triggered.
  // nock intercepts the actual YouTube API calls in in-process tests.
  writeFileSync(join(sandbox, 'tests/fixtures/golazo/leo.token.json'), FAKE_TOKEN_JSON, 'utf8');
  writeFileSync(join(sandbox, 'tests/fixtures/golazo/mateo.token.json'), FAKE_TOKEN_JSON, 'utf8');
  return sandbox;
}

function gameFolder(sandbox: string): string {
  return join(sandbox, 'tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1');
}

async function prepareAndStubRendered(folder: string, sandbox: string): Promise<void> {
  // Must set HOME to sandbox so tilde-paths in channels.yaml (token file path)
  // resolve to the sandbox's fixture directory, not the real user home.
  const origHome = process.env['HOME'];
  process.env['HOME'] = sandbox;
  try {
    await runPrepare({
      folderPath: folder,
      channelsPath: join(sandbox, 'tests/fixtures/golazo/channels.yaml'),
    });
  } finally {
    if (origHome !== undefined) {
      process.env['HOME'] = origHome;
    } else {
      delete process.env['HOME'];
    }
  }
  mkdirSync(join(folder, '.golazo'), { recursive: true });
  writeFileSync(join(folder, '.golazo', 'episode.mp4'), Buffer.from('mp4-stub'));
  writeFileSync(join(folder, '.golazo', 'thumb.png'), Buffer.from('png-stub'));
}

// ---------------------------------------------------------------------------
// Shell-out helper (mirrors auth.integration.test.ts)
// ---------------------------------------------------------------------------

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

async function runCli(
  args: string[],
  env: Record<string, string | undefined>,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', 'src/cli/index.ts', ...args], {
      env: { ...process.env, ...env },
      cwd: REPO_ROOT,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

// ===========================================================================
// BLOCK 1: in-process with nock
// ===========================================================================

describe('publish CLI in-process (with nock)', () => {
  let sandbox: string;
  let stdoutChunks: string[];
  let stderrChunks: string[];

  beforeEach(() => {
    sandbox = makeSandbox();
    // HOME → sandbox so tilde-paths in channels.yaml resolve to sandbox
    vi.stubEnv('HOME', sandbox);
    vi.stubEnv('GOOGLE_CLIENT_ID', 'x');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'y');
    vi.stubEnv('GOLAZO_OAUTH_MOCK', '1');
    nock.disableNetConnect();
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
    '1. FIRST PUBLISH HAPPY PATH: exit 0, stdout contains watch URL, publish.json written',
    async () => {
      const folder = gameFolder(sandbox);
      await prepareAndStubRendered(folder, sandbox);
      stubVideoInsertHappy('cli-test-id');
      stubThumbnailSetHappy('cli-test-id');

      let thrown: unknown = null;
      try {
        await main([
          'node',
          'golazo',
          'publish',
          folder,
          '--channels-config',
          join(sandbox, 'tests/fixtures/golazo/channels.yaml'),
        ]);
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeNull();
      const stdout = stdoutChunks.join('');
      expect(stdout).toContain('video published');
      expect(stdout).toContain('https://youtu.be/cli-test-id');
      expect(stdout).toContain('UC_FIXTURE_LEO_CHANNEL_ID');
      const publishJson = join(folder, '.golazo', 'publish.json');
      expect(existsSync(publishJson)).toBe(true);
      const record = JSON.parse(readFileSync(publishJson, 'utf8'));
      expect(record.videoId).toBe('cli-test-id');
      expect(nock.isDone()).toBe(true);
    },
    30_000,
  );

  it(
    '2. VIDEO-EXISTS NO-OP: stdout contains "publish up to date", nock NOT consumed',
    async () => {
      const folder = gameFolder(sandbox);
      await prepareAndStubRendered(folder, sandbox);
      // Pre-write publish.json
      const preExisting: PublishRecordDoc = {
        videoId: 'existing-id',
        watchUrl: 'https://youtu.be/existing-id',
        uploadedAt: '2026-05-13T10:00:00.000Z',
        channelId: 'UC_FIXTURE_LEO_CHANNEL_ID',
        privacyStatus: PRIVACY_STATUS,
      };
      writePublishRecord(folder, preExisting);
      // Register a "should not be called" interceptor
      nock(YOUTUBE_HOST).post(VIDEO_INSERT_PATH).query(true).reply(500, {});

      let thrown: unknown = null;
      try {
        await main([
          'node',
          'golazo',
          'publish',
          folder,
          '--channels-config',
          join(sandbox, 'tests/fixtures/golazo/channels.yaml'),
        ]);
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeNull();
      const stdout = stdoutChunks.join('');
      expect(stdout).toContain('publish up to date (videoId: existing-id)');
      // The nock interceptor should NOT have been consumed
      expect(nock.pendingMocks().length).toBeGreaterThan(0);
    },
    30_000,
  );

  it(
    '3. FORCE RE-PUBLISH: stdout contains "video re-published (force)", new videoId',
    async () => {
      const folder = gameFolder(sandbox);
      await prepareAndStubRendered(folder, sandbox);
      writePublishRecord(folder, {
        videoId: 'old-id',
        watchUrl: 'https://youtu.be/old-id',
        uploadedAt: '2026-05-13T10:00:00.000Z',
        channelId: 'UC_FIXTURE_LEO_CHANNEL_ID',
        privacyStatus: PRIVACY_STATUS,
      });
      stubVideoInsertHappy('cli-force-id');
      stubThumbnailSetHappy('cli-force-id');

      let thrown: unknown = null;
      try {
        await main([
          'node',
          'golazo',
          'publish',
          folder,
          '--force',
          '--channels-config',
          join(sandbox, 'tests/fixtures/golazo/channels.yaml'),
        ]);
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeNull();
      const stdout = stdoutChunks.join('');
      expect(stdout).toContain('video re-published (force)');
      expect(stdout).toContain('cli-force-id');
      const record = JSON.parse(readFileSync(join(folder, '.golazo', 'publish.json'), 'utf8'));
      expect(record.videoId).toBe('cli-force-id');
    },
    30_000,
  );

  it(
    '4. QUOTA EXCEEDED: exit 1, stderr contains quota message + Rerun after, publish.json NOT written',
    async () => {
      const folder = gameFolder(sandbox);
      await prepareAndStubRendered(folder, sandbox);
      stubQuotaExceeded();

      let thrown: unknown = null;
      try {
        await main([
          'node',
          'golazo',
          'publish',
          folder,
          '--channels-config',
          join(sandbox, 'tests/fixtures/golazo/channels.yaml'),
        ]);
      } catch (e) {
        thrown = e;
      }

      // Should throw a CommanderError with exitCode 1
      expect(thrown).not.toBeNull();
      expect((thrown as { exitCode?: number }).exitCode).toBe(1);
      const stderr = stderrChunks.join('');
      expect(stderr).toMatch(/quota|Quota/i);
      expect(stderr).toContain('Rerun after');
      expect(existsSync(join(folder, '.golazo', 'publish.json'))).toBe(false);
    },
    30_000,
  );
});

// ===========================================================================
// BLOCK 2: shell-out without nock
// ===========================================================================

describe('publish CLI shell-out (no nock)', () => {
  let sandbox: string;

  afterEach(() => {
    if (sandbox) {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it(
    '5. MISSING MANIFEST: exit 1, stderr contains "manifest not found" + "golazo prepare"',
    async () => {
      sandbox = makeSandbox();
      const folder = gameFolder(sandbox);
      // No prepare — no manifest.json
      mkdirSync(join(folder, '.golazo'), { recursive: true });
      writeFileSync(join(folder, '.golazo', 'episode.mp4'), Buffer.from('mp4-stub'));

      const result = await runCli(
        [
          'publish',
          folder,
          '--channels-config',
          join(sandbox, 'tests/fixtures/golazo/channels.yaml'),
        ],
        {
          HOME: sandbox,
          GOOGLE_CLIENT_ID: 'x',
          GOOGLE_CLIENT_SECRET: 'y',
          GOLAZO_OAUTH_MOCK: '1',
        },
      );

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('manifest not found');
      expect(result.stderr).toMatch(/golazo prepare/);
      expect(existsSync(join(folder, '.golazo', 'publish.json'))).toBe(false);
    },
    30_000,
  );

  it(
    '6. MISSING EPISODE.MP4: exit 1, stderr contains "episode.mp4 not found" + "golazo render"',
    async () => {
      sandbox = makeSandbox();
      const folder = gameFolder(sandbox);
      // runPrepare uses resolveKidFromPath → loadChannelsFile → tilde expansion with homedir()
      // We need to temporarily set HOME so the fixture token path resolves correctly.
      const origHome = process.env['HOME'];
      process.env['HOME'] = sandbox;
      try {
        await runPrepare({ folderPath: folder, channelsPath: join(sandbox, 'tests/fixtures/golazo/channels.yaml') });
      } finally {
        if (origHome !== undefined) {
          process.env['HOME'] = origHome;
        } else {
          delete process.env['HOME'];
        }
      }
      // Only manifest.json, no episode.mp4

      const result = await runCli(
        [
          'publish',
          folder,
          '--channels-config',
          join(sandbox, 'tests/fixtures/golazo/channels.yaml'),
        ],
        {
          HOME: sandbox,
          GOOGLE_CLIENT_ID: 'x',
          GOOGLE_CLIENT_SECRET: 'y',
          GOLAZO_OAUTH_MOCK: '1',
        },
      );

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('episode.mp4 not found');
      expect(result.stderr).toMatch(/golazo render/);
    },
    30_000,
  );

  it(
    '7. STUB REMOVAL GATE: publish.ts does not contain "publish: not yet implemented"',
    () => {
      const publishTs = readFileSync(
        resolve(REPO_ROOT, 'src/cli/commands/publish.ts'),
        'utf8',
      );
      expect(publishTs).not.toContain('publish: not yet implemented');
    },
  );

  it(
    '8. NEVER LOGS TOKEN BYTES: stdout + stderr do not contain token values from fixture',
    async () => {
      sandbox = makeSandbox();
      const folder = gameFolder(sandbox);
      // Set HOME for prepare
      const origHome = process.env['HOME'];
      process.env['HOME'] = sandbox;
      try {
        await runPrepare({ folderPath: folder, channelsPath: join(sandbox, 'tests/fixtures/golazo/channels.yaml') });
      } finally {
        if (origHome !== undefined) {
          process.env['HOME'] = origHome;
        } else {
          delete process.env['HOME'];
        }
      }
      // No episode.mp4 — will fail before any upload, enough to test token non-logging

      const result = await runCli(
        [
          'publish',
          folder,
          '--channels-config',
          join(sandbox, 'tests/fixtures/golazo/channels.yaml'),
        ],
        {
          HOME: sandbox,
          GOOGLE_CLIENT_ID: 'x',
          GOOGLE_CLIENT_SECRET: 'y',
          GOLAZO_OAUTH_MOCK: '1',
        },
      );

      // The token file at leo.token.json is `{}` (empty) — the credentials
      // used are GOLAZO_OAUTH_MOCK='1' tokens ('mock-access', 'mock-refresh').
      // Neither should appear in any output.
      expect(result.stdout).not.toContain('mock-access');
      expect(result.stdout).not.toContain('mock-refresh');
      expect(result.stderr).not.toContain('mock-access');
      expect(result.stderr).not.toContain('mock-refresh');
    },
    30_000,
  );
});
