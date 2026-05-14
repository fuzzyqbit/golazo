/**
 * Tests for uploadEpisode — nock-stubbed HTTP tests against the YouTube
 * Data API v3 via googleapis SDK.
 *
 * PROTOCOL NOTE: The googleapis SDK (googleapis-common apirequest.js) uses
 * uploadType=multipart (NOT resumable) when both requestBody + media.body
 * are provided. This differs from the plan's documented expectation of
 * resumable. Tests 6 + 7 pin the ACTUAL behavior (multipart). Deviation is
 * documented in 03-03-SUMMARY.md.
 *
 * The upload goes to a single POST:
 *   POST https://youtube.googleapis.com/upload/youtube/v3/videos
 *        ?part=snippet&part=status&uploadType=multipart
 *
 * The body is a multipart/related stream — nock receives it as a raw string.
 * We extract the JSON metadata part from the multipart body manually.
 *
 * Thumbnails use a separate POST:
 *   POST https://youtube.googleapis.com/upload/youtube/v3/thumbnails/set
 *        ?uploadType=multipart&videoId=<id>
 *
 * nock 14.x intercepts both. nock.disableNetConnect() is active for the
 * entire file — no test accidentally hits a real endpoint.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import nock from 'nock';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

import { uploadEpisode, PRIVACY_STATUS } from './uploader.js';
import { UploadError } from './errors.js';
import type { UploadEpisodeArgs } from './uploader.js';
import type { ChannelConfig } from '../config/types.js';
import type { Manifest } from '../prepare/manifest.js';

// ---------------------------------------------------------------------------
// Disable network for entire file
// ---------------------------------------------------------------------------

beforeAll(() => nock.disableNetConnect());
afterAll(() => nock.enableNetConnect());
afterEach(() => {
  nock.cleanAll();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const YOUTUBE_HOST = 'https://youtube.googleapis.com';
const VIDEO_INSERT_PATH = '/upload/youtube/v3/videos';
const THUMBNAIL_SET_PATH = '/upload/youtube/v3/thumbnails/set';

function makeClient(accessToken = 'SECRET-TOKEN-AAA'): OAuth2Client {
  const c = new google.auth.OAuth2('cid', 'csecret');
  c.setCredentials({
    access_token: accessToken,
    refresh_token: 'SECRET-REFRESH-BBB',
    expiry_date: Date.now() + 3_600_000,
    scope: 'https://www.googleapis.com/auth/youtube.upload',
    token_type: 'Bearer',
  });
  return c;
}

const TEST_CHANNEL: ChannelConfig = {
  kid: 'leo',
  name: 'Leo',
  club: 'FC Eagles',
  jersey: 10,
  accent: '#ffce5a',
  source: 'Veo',
  youtube: {
    channelId: 'UC_TEST',
    oauthTokenPath: '/dev/null',
  },
};

const TEST_MANIFEST: Manifest = {
  version: 1,
  kid: 'leo',
  game: {
    date: '2026-05-13',
    opponent: 'united',
    scoreFor: 3,
    scoreAgainst: 1,
    result: 'W',
  },
  clips: [
    {
      file: '01-goal.mp4',
      durationSec: 10.5,
      sha256: 'a'.repeat(64),
    },
  ],
  totalDurationSec: 10.5,
  manifestHash: 'sha256:' + 'b'.repeat(64),
  music: {
    track: 'track-01.mp3',
    durationSec: 180.0,
    strategy: 'trim-fade',
    reroll: 0,
  },
  render: {
    episodePath: '.golazo/episode.mp4',
    thumbnailPath: '.golazo/thumb.png',
    renderedAt: '2026-05-13T18:00:00.000Z',
    manifestHash: 'sha256:' + 'b'.repeat(64),
    width: 1920,
    height: 1080,
    durationSec: 10.5,
  },
};

// Tmp file management
let tmpDir: string;
let episodePath: string;
let thumbnailPath: string;

function setupTmpFiles(): void {
  tmpDir = join(tmpdir(), `golazo-test-${process.pid}-${Date.now()}`);
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  episodePath = join(tmpDir, 'episode.mp4');
  thumbnailPath = join(tmpDir, 'thumb.png');
  writeFileSync(episodePath, Buffer.from('mp4-bytes'));
  writeFileSync(thumbnailPath, Buffer.from('png-bytes'));
}

function cleanupTmpFiles(): void {
  try {
    if (existsSync(episodePath)) rmSync(episodePath);
    if (existsSync(thumbnailPath)) rmSync(thumbnailPath);
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  } catch {
    // best effort
  }
}

/** Build the complete UploadEpisodeArgs with tmp files wired up. */
function makeArgs(overrides?: Partial<UploadEpisodeArgs>): UploadEpisodeArgs {
  return {
    client: makeClient(),
    channel: TEST_CHANNEL,
    manifest: TEST_MANIFEST,
    episodePath,
    thumbnailPath,
    ...overrides,
  };
}

/**
 * Extract the JSON metadata part from a multipart/related body string.
 *
 * The googleapis SDK sends a multipart body structured as:
 *   --<boundary>\r\n
 *   content-type: application/json\r\n\r\n
 *   {"snippet":...,"status":...}\r\n
 *   --<boundary>\r\n
 *   content-type: video/mp4\r\n\r\n
 *   <binary>\r\n
 *   --<boundary>--
 *
 * nock 14.x receives this as a string (or Buffer). We find the first JSON
 * block between the first content-type+blank-line and the next boundary.
 */
function extractMultipartJson(body: string | Buffer): Record<string, unknown> {
  const s = typeof body === 'string' ? body : body.toString('utf8');
  // Find the JSON object — it starts after the first blank line (\r\n\r\n)
  const jsonStart = s.indexOf('\r\n\r\n');
  if (jsonStart === -1) return {};
  const afterHeader = s.slice(jsonStart + 4);
  // JSON ends at the next \r\n-- boundary
  const jsonEnd = afterHeader.indexOf('\r\n--');
  if (jsonEnd === -1) return {};
  const jsonStr = afterHeader.slice(0, jsonEnd);
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Stub the happy-path nock interceptors.
 *
 * googleapis uses uploadType=multipart (single POST) when both requestBody
 * and media.body are provided. The nock interceptor captures the body for
 * assertions in cases 2-5.
 *
 * The query for videos.insert comes as an array-style part:
 *   ?part=snippet&part=status&uploadType=multipart
 */
let capturedInsertBody: Record<string, unknown> = {};
let capturedInsertQuery: Record<string, unknown> = {};

function stubVideoInsertHappy(videoId = 'fake-video-id'): void {
  nock(YOUTUBE_HOST)
    .post(VIDEO_INSERT_PATH, (body: unknown) => {
      capturedInsertBody = extractMultipartJson(body as string | Buffer);
      return true;
    })
    .query((query) => {
      capturedInsertQuery = query as Record<string, unknown>;
      return true;
    })
    .reply(200, { id: videoId, snippet: { title: 'x', description: 'x' }, status: { privacyStatus: 'unlisted' } });
}

function stubThumbnailSetHappy(videoId = 'fake-video-id'): void {
  nock(YOUTUBE_HOST)
    .post(THUMBNAIL_SET_PATH)
    .query((query) => {
      const q = query as Record<string, string>;
      return q['videoId'] === videoId;
    })
    .reply(200, { kind: 'youtube#thumbnailSetResponse' });
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('uploadEpisode', () => {
  // setup tmp files before/after all tests (not per test — they're read-only)
  beforeAll(() => setupTmpFiles());
  afterAll(() => cleanupTmpFiles());

  // -------------------------------------------------------------------------
  // 1. HAPPY PATH
  // -------------------------------------------------------------------------
  it('1. returns PublishRecord on success and all nock interceptors consumed', async () => {
    stubVideoInsertHappy();
    stubThumbnailSetHappy();

    const result = await uploadEpisode(makeArgs());

    expect(result).toEqual(
      expect.objectContaining({
        videoId: 'fake-video-id',
        watchUrl: 'https://youtu.be/fake-video-id',
        channelId: 'UC_TEST',
        privacyStatus: 'unlisted',
      }),
    );
    expect(result.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Typed-constant binding: result.privacyStatus must equal the imported PRIVACY_STATUS constant
    expect(result.privacyStatus).toBe(PRIVACY_STATUS);
    expect(nock.isDone()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. REQUEST BODY SHAPE — title
  // -------------------------------------------------------------------------
  it('2. title matches renderTitle(input) — "Leo · vs United · 3–1 W · 2026-05-13"', async () => {
    capturedInsertBody = {};
    stubVideoInsertHappy();
    stubThumbnailSetHappy();

    await uploadEpisode(makeArgs());

    const snippet = (capturedInsertBody as { snippet?: { title?: string } }).snippet;
    expect(snippet?.title).toBe('Leo · vs United · 3–1 W · 2026-05-13');
  });

  // -------------------------------------------------------------------------
  // 3. REQUEST BODY SHAPE — description
  // -------------------------------------------------------------------------
  it('3. description contains expected lines from renderDescription()', async () => {
    capturedInsertBody = {};
    stubVideoInsertHappy();
    stubThumbnailSetHappy();

    await uploadEpisode(makeArgs());

    const snippet = (capturedInsertBody as { snippet?: { description?: string } }).snippet;
    const desc = snippet?.description ?? '';
    expect(desc).toMatch(/^Match Day · 2026-05-13/);
    expect(desc).toContain('Leo (#10, FC Eagles) vs United');
    expect(desc).toContain('Final: 3–1');
    expect(desc).toContain('Filmed via Veo. Edited with golazo.');
  });

  // -------------------------------------------------------------------------
  // 4. REQUEST BODY SHAPE — privacyStatus + categoryId
  // -------------------------------------------------------------------------
  it('4. requestBody.status.privacyStatus === PRIVACY_STATUS and categoryId === "17"', async () => {
    capturedInsertBody = {};
    stubVideoInsertHappy();
    stubThumbnailSetHappy();

    await uploadEpisode(makeArgs());

    const body = capturedInsertBody as {
      status?: { privacyStatus?: string };
      snippet?: { categoryId?: string };
    };
    expect(body.status?.privacyStatus).toBe('unlisted');
    expect(body.status?.privacyStatus).toBe(PRIVACY_STATUS);
    expect(body.snippet?.categoryId).toBe('17');
  });

  // -------------------------------------------------------------------------
  // 5. REQUEST BODY SHAPE — part query param
  // -------------------------------------------------------------------------
  it('5. query params include part=snippet,status', async () => {
    capturedInsertQuery = {};
    stubVideoInsertHappy();
    stubThumbnailSetHappy();

    await uploadEpisode(makeArgs());

    // SDK sends part as an array: ['snippet', 'status']
    const part = capturedInsertQuery['part'];
    expect(part).toBeDefined();
    const parts = Array.isArray(part) ? part : [String(part)];
    expect(parts).toContain('snippet');
    expect(parts).toContain('status');
  });

  // -------------------------------------------------------------------------
  // 6. UPLOAD PROTOCOL — uploadType=multipart (SDK actual behavior)
  // Note: The googleapis SDK uses uploadType=multipart (NOT resumable) when
  // both requestBody and media.body are provided. The plan documented
  // resumable, but the SDK's actual code path in googleapis-common/apirequest.js
  // sets uploadType=multipart for the stream+requestBody combination.
  // This test pins the ACTUAL SDK behavior. See 03-03-SUMMARY.md deviation log.
  // -------------------------------------------------------------------------
  it('6. upload uses uploadType=multipart (googleapis SDK behavior for stream+requestBody)', async () => {
    capturedInsertQuery = {};
    stubVideoInsertHappy();
    stubThumbnailSetHappy();

    await uploadEpisode(makeArgs());

    expect(capturedInsertQuery['uploadType']).toBe('multipart');
  });

  // -------------------------------------------------------------------------
  // 7. UPLOAD PROTOCOL — sequence: video insert before thumbnails
  // -------------------------------------------------------------------------
  it('7. thumbnail set is called AFTER video insert (call order)', async () => {
    const callOrder: string[] = [];

    nock(YOUTUBE_HOST)
      .post(VIDEO_INSERT_PATH)
      .query(true)
      .reply(() => {
        callOrder.push('video-insert');
        return [200, { id: 'fake-video-id', snippet: {}, status: { privacyStatus: 'unlisted' } }];
      });

    nock(YOUTUBE_HOST)
      .post(THUMBNAIL_SET_PATH)
      .query(true)
      .reply(() => {
        callOrder.push('thumbnail-set');
        return [200, { kind: 'youtube#thumbnailSetResponse' }];
      });

    await uploadEpisode(makeArgs());

    expect(callOrder).toEqual(['video-insert', 'thumbnail-set']);
    expect(nock.isDone()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 8. THUMBNAIL ATTACHED with correct videoId
  // -------------------------------------------------------------------------
  it('8. thumbnails.set is called with videoId from videos.insert response', async () => {
    let capturedThumbnailQuery: Record<string, string> = {};

    nock(YOUTUBE_HOST)
      .post(VIDEO_INSERT_PATH)
      .query(true)
      .reply(200, { id: 'fake-video-id', snippet: {}, status: { privacyStatus: 'unlisted' } });

    nock(YOUTUBE_HOST)
      .post(THUMBNAIL_SET_PATH)
      .query((q) => {
        capturedThumbnailQuery = q as Record<string, string>;
        return true;
      })
      .reply(200, { kind: 'youtube#thumbnailSetResponse' });

    await uploadEpisode(makeArgs());

    expect(capturedThumbnailQuery['videoId']).toBe('fake-video-id');
  });

  // -------------------------------------------------------------------------
  // 9. NO videoId IN RESPONSE — UploadError thrown, thumbnail NOT called
  // -------------------------------------------------------------------------
  it('9. throws UploadError when videos.insert response has no id field', async () => {
    // Set up ONE video insert interceptor (no id in response)
    nock(YOUTUBE_HOST)
      .post(VIDEO_INSERT_PATH)
      .query(true)
      .reply(200, { snippet: { title: 'x' }, status: { privacyStatus: 'unlisted' } });

    // Thumbnail interceptor — should NOT be consumed
    const thumbnailScope = nock(YOUTUBE_HOST)
      .post(THUMBNAIL_SET_PATH)
      .query(true)
      .reply(200, { kind: 'youtube#thumbnailSetResponse' });

    let caughtErr: unknown;
    try {
      await uploadEpisode(makeArgs());
    } catch (e) {
      caughtErr = e;
    }

    expect(caughtErr).toBeInstanceOf(UploadError);
    expect((caughtErr as UploadError).field).toBe('videoId');
    // Thumbnail interceptor was not consumed
    expect(thumbnailScope.isDone()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 10. MISSING EPISODE FILE
  // -------------------------------------------------------------------------
  it('10. throws UploadError(episodePath) when episode file does not exist', async () => {
    // No nock interceptors — validation happens before HTTP
    let caughtErr: unknown;
    try {
      await uploadEpisode(makeArgs({ episodePath: '/nonexistent/episode.mp4' }));
    } catch (e) {
      caughtErr = e;
    }

    expect(caughtErr).toBeInstanceOf(UploadError);
    const err = caughtErr as UploadError;
    expect(err.field).toBe('episodePath');
    expect(err.reason).toContain('not found');
    // No HTTP calls made
    expect(nock.activeMocks()).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 11. MISSING THUMBNAIL FILE
  // -------------------------------------------------------------------------
  it('11. throws UploadError(thumbnailPath) when thumbnail file does not exist', async () => {
    let caughtErr: unknown;
    try {
      await uploadEpisode(makeArgs({ thumbnailPath: '/nonexistent/thumb.png' }));
    } catch (e) {
      caughtErr = e;
    }

    expect(caughtErr).toBeInstanceOf(UploadError);
    const err = caughtErr as UploadError;
    expect(err.field).toBe('thumbnailPath');
    expect(err.reason).toContain('not found');
    expect(nock.activeMocks()).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 12. CLOCK INJECTION
  // -------------------------------------------------------------------------
  it('12. clock injection produces deterministic uploadedAt timestamp', async () => {
    stubVideoInsertHappy();
    stubThumbnailSetHappy();

    const fixedDate = new Date('2026-05-13T18:05:00.000Z');
    const result = await uploadEpisode(makeArgs({ clock: () => fixedDate }));

    expect(result.uploadedAt).toBe('2026-05-13T18:05:00.000Z');
  });

  // -------------------------------------------------------------------------
  // 13. NEVER LOGS TOKEN
  // -------------------------------------------------------------------------
  it('13. token bytes never appear in console output during uploadEpisode', async () => {
    const captured: string[] = [];
    const captureLog = (...args: unknown[]) => captured.push(args.map(String).join(' '));

    vi.spyOn(console, 'log').mockImplementation(captureLog);
    vi.spyOn(console, 'info').mockImplementation(captureLog);
    vi.spyOn(console, 'warn').mockImplementation(captureLog);
    vi.spyOn(console, 'error').mockImplementation(captureLog);
    vi.spyOn(console, 'debug').mockImplementation(captureLog);

    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation((s: unknown) => {
      captured.push(String(s));
      return true;
    });
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation((s: unknown) => {
      captured.push(String(s));
      return true;
    });

    stubVideoInsertHappy();
    stubThumbnailSetHappy();

    const clientWithSecret = makeClient('SECRET-TOKEN-AAA');
    await uploadEpisode(makeArgs({ client: clientWithSecret }));

    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();

    const allOutput = captured.join('\n');
    expect(allOutput).not.toContain('SECRET-TOKEN-AAA');
    expect(allOutput).not.toContain('SECRET-REFRESH-BBB');
  });

  // -------------------------------------------------------------------------
  // 14. HTTP 5xx PROPAGATES — not wrapped in UploadError
  // -------------------------------------------------------------------------
  it('14. HTTP 500 from videos.insert propagates as GaxiosError, not UploadError', async () => {
    nock(YOUTUBE_HOST)
      .post(VIDEO_INSERT_PATH)
      .query(true)
      .reply(500, { error: { code: 500, message: 'Internal Server Error' } });

    let caughtError: unknown;
    try {
      await uploadEpisode(makeArgs());
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError).not.toBeInstanceOf(UploadError);
    // GaxiosError has a status or response.status field
    const err = caughtError as { status?: number; response?: { status?: number }; code?: number | string };
    const status = err.status ?? err.response?.status ?? err.code;
    // 5xx or ERR_NOCK_NO_MATCH if it retried
    expect(String(status)).toMatch(/5\d\d|500|ERR/);
  });

  // -------------------------------------------------------------------------
  // 15. HTTP 403 quotaExceeded PROPAGATES — not wrapped in UploadError
  // -------------------------------------------------------------------------
  it('15. HTTP 403 quotaExceeded from videos.insert propagates as GaxiosError, not UploadError', async () => {
    // googleapis retries 403 if it looks like a transient error;
    // stub multiple times to cover potential retries within gaxios
    nock(YOUTUBE_HOST)
      .post(VIDEO_INSERT_PATH)
      .query(true)
      .times(5)
      .reply(403, {
        error: {
          code: 403,
          errors: [{ reason: 'quotaExceeded', domain: 'youtube.quota', message: 'The caller exceeded their quota.' }],
        },
      });

    let caughtError: unknown;
    try {
      await uploadEpisode(makeArgs());
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError).not.toBeInstanceOf(UploadError);
    const err = caughtError as { status?: number; response?: { status?: number }; code?: string };
    // 403, or ERR_NOCK_NO_MATCH if retried more times than stubbed
    const status = err.status ?? err.response?.status;
    expect(status === 403 || err.code?.includes('NOCK') === true || err.code?.includes('ERR') === true).toBe(true);
  });
});
