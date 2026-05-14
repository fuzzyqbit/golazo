/**
 * Tests for runner.ts — runPublish orchestrator.
 *
 * 12 cases covering: happy path, idempotency, force, error paths,
 * clock injection, retry opts forwarding.
 *
 * Strategy: vi.mock('./retry.js') and vi.mock('./oauth.js') to decouple from
 * real HTTP. Filesystem operations use a per-test sandbox cloned from the
 * committed fixture. runPrepare is called for real to produce manifest.json.
 * episode.mp4 + thumb.png are tiny placeholder files (no real Remotion render).
 *
 * Per-test timeout: 5000ms (most sub-100ms; case 1 calls runPrepare ≈1s).
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import nock from 'nock';

import { runPublish } from './runner.js';
import { PRIVACY_STATUS } from './uploader.js';
import { PublishError } from './errors.js';
import { OAuthError, QuotaExceededError } from './errors.js';
import { writePublishRecord } from './publishRecord.js';
import type { PublishRecordDoc } from './publishRecord.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('./oauth.js', () => ({
  loadToken: vi.fn(),
}));

vi.mock('./retry.js', async (importOriginal) => {
  // Import actual module to preserve QuotaExceededError (we need it in case 9)
  const actual = await importOriginal<typeof import('./retry.js')>();
  return {
    ...actual,
    publishWithRetry: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Import mocked modules after vi.mock hoisting
// ---------------------------------------------------------------------------

import { loadToken } from './oauth.js';
import { publishWithRetry } from './retry.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(process.cwd());
const FIXTURE_CHANNELS = join(REPO_ROOT, 'tests/fixtures/golazo/channels.yaml');
const FIXTURE_GOLAZO_DIR = join(REPO_ROOT, 'tests/fixtures/golazo');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a per-test sandbox under os.tmpdir(). */
function makeSandbox(): string {
  const sandbox = mkdtempSync(join(tmpdir(), 'golazo-runner-'));
  // Clone fixture directory so we get channels.yaml + token stubs
  cpSync(FIXTURE_GOLAZO_DIR, join(sandbox, 'tests/fixtures/golazo'), { recursive: true });
  return sandbox;
}

/** Return the absolute path to the game folder inside the sandbox. */
function gameFolderPath(sandbox: string): string {
  return join(sandbox, 'tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1');
}

/** Write tiny placeholder episode.mp4 + thumb.png into .golazo/ under the given folder. */
function stubRendered(folder: string): void {
  const golazoDir = join(folder, '.golazo');
  if (!existsSync(golazoDir)) {
    const { mkdirSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(golazoDir, { recursive: true });
  }
  writeFileSync(join(golazoDir, 'episode.mp4'), Buffer.from('mp4-stub'));
  writeFileSync(join(golazoDir, 'thumb.png'), Buffer.from('png-stub'));
}

/** Return a fake OAuth2Client (the runner just passes it through). */
function makeFakeClient() {
  return { fakeOAuth2Client: true } as unknown as import('google-auth-library').OAuth2Client;
}

/** Canonical mock PublishRecord returned by stubbed publishWithRetry. */
function makeMockRecord(videoId = 'fake-video-id'): PublishRecordDoc {
  return {
    videoId,
    watchUrl: `https://youtu.be/${videoId}`,
    uploadedAt: '2026-05-13T18:00:00.000Z',
    channelId: 'UC_FIXTURE_LEO_CHANNEL_ID',
    privacyStatus: PRIVACY_STATUS,
  };
}

/** Run runPrepare so manifest.json exists in .golazo/. */
async function prepare(folder: string, sandbox: string): Promise<void> {
  const { runPrepare } = await import('../prepare/index.js');
  // HOME must point to sandbox so tilde-paths in channels.yaml resolve correctly
  const origHome = process.env['HOME'];
  process.env['HOME'] = sandbox;
  try {
    await runPrepare({ folderPath: folder, channelsPath: FIXTURE_CHANNELS });
  } finally {
    if (origHome !== undefined) {
      process.env['HOME'] = origHome;
    } else {
      delete process.env['HOME'];
    }
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let sandbox: string;

beforeEach(() => {
  sandbox = makeSandbox();
  // Stub HOME to sandbox so tilde-paths in channels.yaml resolve correctly.
  // channels.yaml has `oauth_token: '~/tests/fixtures/golazo/leo.token.json'`
  // which loadChannel expands to `${HOME}/tests/fixtures/golazo/leo.token.json`.
  vi.stubEnv('HOME', sandbox);
  nock.disableNetConnect();
  vi.mocked(loadToken).mockReset();
  vi.mocked(publishWithRetry).mockReset();
  vi.mocked(loadToken).mockResolvedValue(makeFakeClient());
  vi.mocked(publishWithRetry).mockResolvedValue(makeMockRecord());
});

afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
  vi.unstubAllEnvs();
  rmSync(sandbox, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runPublish', () => {
  it(
    '1. FIRST PUBLISH HAPPY PATH: returns correct result + writes publish.json',
    async () => {
      const folder = gameFolderPath(sandbox);
      await prepare(folder, sandbox);
      stubRendered(folder);

      const result = await runPublish({
        folderPath: folder,
        channelsPath: FIXTURE_CHANNELS,
        clientId: 'x',
        clientSecret: 'y',
        clock: () => new Date('2026-05-13T18:00:00.000Z'),
      });

      expect(result.skipped).toBe(false);
      expect(result.reason).toBe('first-publish');
      expect(result.publishRecordPath).toContain('.golazo/publish.json');
      expect(result.record.videoId).toBe('fake-video-id');
      expect(result.record.privacyStatus).toBe(PRIVACY_STATUS);
      expect(existsSync(result.publishRecordPath)).toBe(true);
      const onDisk = JSON.parse(readFileSync(result.publishRecordPath, 'utf8'));
      expect(onDisk).toEqual(result.record);
      expect(vi.mocked(publishWithRetry)).toHaveBeenCalledTimes(1);
      const [[callArgs]] = vi.mocked(publishWithRetry).mock.calls;
      expect(callArgs.channel.youtube.channelId).toBe('UC_FIXTURE_LEO_CHANNEL_ID');
      expect(callArgs.episodePath).toMatch(/\.golazo\/episode\.mp4$/);
      expect(callArgs.thumbnailPath).toMatch(/\.golazo\/thumb\.png$/);
    },
    5000,
  );

  it(
    '2. VIDEO-EXISTS NO-OP: returns skipped=true without calling publishWithRetry',
    async () => {
      const folder = gameFolderPath(sandbox);
      await prepare(folder, sandbox);
      stubRendered(folder);
      // Pre-write a publish.json
      const preExisting: PublishRecordDoc = {
        videoId: 'pre-existing-id',
        watchUrl: 'https://youtu.be/pre-existing-id',
        uploadedAt: '2026-05-13T10:00:00.000Z',
        channelId: 'UC_FIXTURE_LEO_CHANNEL_ID',
        privacyStatus: PRIVACY_STATUS,
      };
      writePublishRecord(folder, preExisting);

      const result = await runPublish({
        folderPath: folder,
        channelsPath: FIXTURE_CHANNELS,
        clientId: 'x',
        clientSecret: 'y',
      });

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('video-exists');
      expect(result.record.videoId).toBe('pre-existing-id');
      expect(vi.mocked(publishWithRetry)).not.toHaveBeenCalled();
    },
    5000,
  );

  it(
    '3. FORCE OVERRIDE: re-uploads even when publish.json exists',
    async () => {
      const folder = gameFolderPath(sandbox);
      await prepare(folder, sandbox);
      stubRendered(folder);
      // Pre-write a publish.json
      writePublishRecord(folder, {
        videoId: 'old-id',
        watchUrl: 'https://youtu.be/old-id',
        uploadedAt: '2026-05-13T10:00:00.000Z',
        channelId: 'UC_FIXTURE_LEO_CHANNEL_ID',
        privacyStatus: PRIVACY_STATUS,
      });
      vi.mocked(publishWithRetry).mockResolvedValueOnce(makeMockRecord('force-uploaded-id'));

      const result = await runPublish({
        folderPath: folder,
        channelsPath: FIXTURE_CHANNELS,
        clientId: 'x',
        clientSecret: 'y',
        force: true,
      });

      expect(result.skipped).toBe(false);
      expect(result.reason).toBe('force');
      expect(result.record.videoId).toBe('force-uploaded-id');
      expect(vi.mocked(publishWithRetry)).toHaveBeenCalledTimes(1);
      const onDisk = JSON.parse(readFileSync(result.publishRecordPath, 'utf8'));
      expect(onDisk.videoId).toBe('force-uploaded-id');
    },
    5000,
  );

  it(
    '4. MISSING MANIFEST: throws PublishError with manifestPath field + remediation',
    async () => {
      const folder = gameFolderPath(sandbox);
      // No prepare — manifest.json is absent
      stubRendered(folder);

      let caught: unknown;
      try {
        await runPublish({
          folderPath: folder,
          channelsPath: FIXTURE_CHANNELS,
          clientId: 'x',
          clientSecret: 'y',
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(PublishError);
      const err = caught as PublishError;
      expect(err.field).toBe('manifestPath');
      expect(err.message).toContain('manifest not found');
      expect(err.message).toMatch(/golazo prepare/);
      expect(existsSync(join(folder, '.golazo/publish.json'))).toBe(false);
    },
    5000,
  );

  it(
    '5. MISSING EPISODE.MP4: throws PublishError with episodePath field',
    async () => {
      const folder = gameFolderPath(sandbox);
      await prepare(folder, sandbox);
      // Write only thumb.png, no episode.mp4
      const { mkdirSync } = await import('node:fs');
      mkdirSync(join(folder, '.golazo'), { recursive: true });
      writeFileSync(join(folder, '.golazo/thumb.png'), Buffer.from('png-stub'));

      let caught: unknown;
      try {
        await runPublish({
          folderPath: folder,
          channelsPath: FIXTURE_CHANNELS,
          clientId: 'x',
          clientSecret: 'y',
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(PublishError);
      const err = caught as PublishError;
      expect(err.field).toBe('episodePath');
      expect(err.message).toContain('episode.mp4 not found');
      expect(err.message).toMatch(/golazo render/);
    },
    5000,
  );

  it(
    '6. MISSING THUMB.PNG: throws PublishError with thumbnailPath field',
    async () => {
      const folder = gameFolderPath(sandbox);
      await prepare(folder, sandbox);
      // Write only episode.mp4, no thumb.png
      const { mkdirSync } = await import('node:fs');
      mkdirSync(join(folder, '.golazo'), { recursive: true });
      writeFileSync(join(folder, '.golazo/episode.mp4'), Buffer.from('mp4-stub'));

      let caught: unknown;
      try {
        await runPublish({
          folderPath: folder,
          channelsPath: FIXTURE_CHANNELS,
          clientId: 'x',
          clientSecret: 'y',
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(PublishError);
      const err = caught as PublishError;
      expect(err.field).toBe('thumbnailPath');
      expect(err.message).toContain('thumb.png not found');
      expect(err.message).toMatch(/golazo render/);
    },
    5000,
  );

  it(
    '7. UNKNOWN KID: propagates UnknownKidError from loadChannel',
    async () => {
      // Build a sandbox where the game folder's parent is 'alice' (not in channels.yaml)
      const aliceFolder = join(sandbox, 'tests/fixtures/golazo/alice/2026-05-13_vs_united_3-1');
      cpSync(gameFolderPath(sandbox), aliceFolder, { recursive: true });

      // Run prepare on the alice folder — it will throw UnknownKidError since 'alice' is unknown
      let caught: unknown;
      try {
        await runPublish({
          folderPath: aliceFolder,
          channelsPath: FIXTURE_CHANNELS,
          clientId: 'x',
          clientSecret: 'y',
        });
      } catch (e) {
        caught = e;
      }

      // Should propagate an error containing 'alice'
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/alice/);
    },
    5000,
  );

  it(
    '8. TOKEN REFRESH FAILS: propagates OAuthError, publish.json NOT written',
    async () => {
      const folder = gameFolderPath(sandbox);
      await prepare(folder, sandbox);
      stubRendered(folder);
      vi.mocked(loadToken).mockRejectedValueOnce(
        new OAuthError({
          field: 'refresh',
          reason: 'invalid_grant',
          remediation: "run 'golazo auth leo' to reauthorize",
        }),
      );

      let caught: unknown;
      try {
        await runPublish({
          folderPath: folder,
          channelsPath: FIXTURE_CHANNELS,
          clientId: 'x',
          clientSecret: 'y',
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(OAuthError);
      expect(existsSync(join(folder, '.golazo/publish.json'))).toBe(false);
      expect(vi.mocked(publishWithRetry)).not.toHaveBeenCalled();
    },
    5000,
  );

  it(
    '9. QUOTA EXCEEDED: throws QuotaExceededError, publish.json NOT written (PUB-06)',
    async () => {
      const folder = gameFolderPath(sandbox);
      await prepare(folder, sandbox);
      stubRendered(folder);
      vi.mocked(publishWithRetry).mockRejectedValueOnce(
        new QuotaExceededError({ resumeAtHint: '2026-05-14T00:00:00.000Z' }),
      );

      let caught: unknown;
      try {
        await runPublish({
          folderPath: folder,
          channelsPath: FIXTURE_CHANNELS,
          clientId: 'x',
          clientSecret: 'y',
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(QuotaExceededError);
      // PUB-06: no publish.json on quota failure
      expect(existsSync(join(folder, '.golazo/publish.json'))).toBe(false);
    },
    5000,
  );

  it(
    '10. RETRIABLE FAILURE EXHAUSTED: propagates Error, publish.json NOT written',
    async () => {
      const folder = gameFolderPath(sandbox);
      await prepare(folder, sandbox);
      stubRendered(folder);
      vi.mocked(publishWithRetry).mockRejectedValueOnce(
        new Error('upload failed after 4 attempts: network error'),
      );

      let caught: unknown;
      try {
        await runPublish({
          folderPath: folder,
          channelsPath: FIXTURE_CHANNELS,
          clientId: 'x',
          clientSecret: 'y',
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain('upload failed after 4 attempts');
      expect(existsSync(join(folder, '.golazo/publish.json'))).toBe(false);
    },
    5000,
  );

  it(
    '11. CLOCK INJECTION: forwarded to publishWithRetry args',
    async () => {
      const folder = gameFolderPath(sandbox);
      await prepare(folder, sandbox);
      stubRendered(folder);
      const fixedClock = () => new Date('2026-05-13T18:00:00.000Z');

      await runPublish({
        folderPath: folder,
        channelsPath: FIXTURE_CHANNELS,
        clientId: 'x',
        clientSecret: 'y',
        clock: fixedClock,
      });

      const [[callArgs]] = vi.mocked(publishWithRetry).mock.calls;
      expect(typeof callArgs.clock).toBe('function');
      expect(callArgs.clock?.()?.toISOString()).toBe('2026-05-13T18:00:00.000Z');
    },
    5000,
  );

  it(
    '12. RETRY OPTS FORWARDED: retryOpts passed through to publishWithRetry',
    async () => {
      const folder = gameFolderPath(sandbox);
      await prepare(folder, sandbox);
      stubRendered(folder);
      const fakeSleep = vi.fn(async (_ms: number) => undefined);
      const retryOpts = { delaysMs: [10, 20, 30], sleep: fakeSleep };

      await runPublish({
        folderPath: folder,
        channelsPath: FIXTURE_CHANNELS,
        clientId: 'x',
        clientSecret: 'y',
        retryOpts,
      });

      expect(vi.mocked(publishWithRetry)).toHaveBeenCalledTimes(1);
      const [[, passedRetryOpts]] = vi.mocked(publishWithRetry).mock.calls;
      expect(passedRetryOpts).toBe(retryOpts);
      expect(passedRetryOpts?.delaysMs).toEqual([10, 20, 30]);
    },
    5000,
  );
});
