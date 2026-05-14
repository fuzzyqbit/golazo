/**
 * Tests for src/publish/retry.ts — classifyError, withRetry, publishWithRetry,
 * and the internal nextUtcMidnight helper.
 *
 * All sleep calls are injected (synchronous Promise.resolve()) so the full
 * suite runs in well under 100ms — no real 21-second worst-case waits.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyError,
  withRetry,
  publishWithRetry,
  DEFAULT_RETRY_DELAYS_MS,
  __test_nextUtcMidnight,
} from './retry.js';
import { OAuthError, UploadError, QuotaExceededError } from './errors.js';

// ---------------------------------------------------------------------------
// Module mock for publishWithRetry tests (PART C)
// ---------------------------------------------------------------------------

vi.mock('./uploader.js', () => ({
  uploadEpisode: vi.fn(),
}));

import { uploadEpisode } from './uploader.js';
const mockUpload = vi.mocked(uploadEpisode);

// ---------------------------------------------------------------------------
// Helper: fast no-op sleep for withRetry tests
// ---------------------------------------------------------------------------

function makeSleepRecorder(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  const sleep = async (ms: number): Promise<void> => {
    delays.push(ms);
  };
  return { sleep, delays };
}

// ---------------------------------------------------------------------------
// PART A — classifyError (19 cases + 1 row-count gate)
// ---------------------------------------------------------------------------

/**
 * Table of classify test cases.
 * Each entry: [label, input, expectedClassification]
 */
const CLASSIFY_TEST_CASES: Array<{
  label: string;
  input: unknown;
  expected: { kind: 'retriable' | 'quota' | 'fatal'; reason: string; detail?: string };
}> = [
  // A1-A5: network errors
  {
    label: 'A1. ECONNRESET → retriable/network',
    input: Object.assign(new Error('socket hangup'), { code: 'ECONNRESET' }),
    expected: { kind: 'retriable', reason: 'network', detail: 'ECONNRESET' },
  },
  {
    label: 'A2. ETIMEDOUT → retriable/network',
    input: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }),
    expected: { kind: 'retriable', reason: 'network', detail: 'ETIMEDOUT' },
  },
  {
    label: 'A3. ENOTFOUND → retriable/network',
    input: Object.assign(new Error('not found'), { code: 'ENOTFOUND' }),
    expected: { kind: 'retriable', reason: 'network', detail: 'ENOTFOUND' },
  },
  {
    label: 'A4. EAI_AGAIN → retriable/network',
    input: Object.assign(new Error('dns failure'), { code: 'EAI_AGAIN' }),
    expected: { kind: 'retriable', reason: 'network', detail: 'EAI_AGAIN' },
  },
  {
    label: 'A5. EPIPE → retriable/network',
    input: Object.assign(new Error('broken pipe'), { code: 'EPIPE' }),
    expected: { kind: 'retriable', reason: 'network', detail: 'EPIPE' },
  },
  // A6-A9: 5xx errors
  {
    label: 'A6. 500 → retriable/5xx',
    input: { response: { status: 500 } },
    expected: { kind: 'retriable', reason: '5xx', detail: '500' },
  },
  {
    label: 'A7. 503 → retriable/5xx',
    input: { response: { status: 503 } },
    expected: { kind: 'retriable', reason: '5xx', detail: '503' },
  },
  {
    label: 'A8. 502 → retriable/5xx',
    input: { response: { status: 502 } },
    expected: { kind: 'retriable', reason: '5xx', detail: '502' },
  },
  {
    label: 'A9. 504 → retriable/5xx',
    input: { response: { status: 504 } },
    expected: { kind: 'retriable', reason: '5xx', detail: '504' },
  },
  // A10: 429 rate-limited
  {
    label: 'A10. 429 → retriable/rate-limited',
    input: { response: { status: 429 } },
    expected: { kind: 'retriable', reason: 'rate-limited', detail: '429' },
  },
  // A11: 403 quotaExceeded (shape 1: err.errors[0].reason)
  {
    label: 'A11a. 403 quotaExceeded (err.errors[0]) → quota',
    input: { response: { status: 403 }, errors: [{ reason: 'quotaExceeded' }] },
    expected: { kind: 'quota', reason: 'quotaExceeded' },
  },
  // A11 alternate: err.response.data.error.errors[0].reason
  {
    label: 'A11b. 403 quotaExceeded (response.data.error.errors[0]) → quota',
    input: {
      response: {
        status: 403,
        data: { error: { errors: [{ reason: 'quotaExceeded' }] } },
      },
    },
    expected: { kind: 'quota', reason: 'quotaExceeded' },
  },
  // A12: 403 OTHER reason
  {
    label: 'A12. 403 forbidden → fatal/4xx',
    input: { response: { status: 403 }, errors: [{ reason: 'forbidden' }] },
    expected: { kind: 'fatal', reason: '4xx', detail: '403' },
  },
  // A13: 400 Bad Request
  {
    label: 'A13. 400 → fatal/4xx',
    input: { response: { status: 400 } },
    expected: { kind: 'fatal', reason: '4xx', detail: '400' },
  },
  // A14: 401 Unauthorized
  {
    label: 'A14. 401 → fatal/4xx',
    input: { response: { status: 401 } },
    expected: { kind: 'fatal', reason: '4xx', detail: '401' },
  },
  // A15: UploadError instance
  {
    label: 'A15. UploadError → fatal',
    input: new UploadError({ field: 'videoId', reason: 'missing', remediation: 'inspect' }),
    expected: {
      kind: 'fatal',
      reason: new UploadError({ field: 'videoId', reason: 'missing', remediation: 'inspect' })
        .message,
    },
  },
  // A16: OAuthError instance
  {
    label: 'A16. OAuthError → fatal',
    input: new OAuthError({ field: 'refresh', reason: 'invalid_grant', remediation: 'reauth' }),
    expected: {
      kind: 'fatal',
      reason: new OAuthError({ field: 'refresh', reason: 'invalid_grant', remediation: 'reauth' })
        .message,
    },
  },
  // A17: QuotaExceededError instance (idempotent re-classification)
  {
    label: 'A17. QuotaExceededError → quota',
    input: new QuotaExceededError({
      reason: 'YouTube daily upload quota exhausted',
      resumeAtHint: '2026-05-14T00:00:00.000Z',
    }),
    expected: {
      kind: 'quota',
      reason: new QuotaExceededError({
        reason: 'YouTube daily upload quota exhausted',
        resumeAtHint: '2026-05-14T00:00:00.000Z',
      }).message,
    },
  },
  // A18: Unclassified error
  {
    label: 'A18. Unclassified Error → fatal/unclassified',
    input: new Error('something weird'),
    expected: { kind: 'fatal', reason: 'unclassified', detail: 'Error: something weird' },
  },
  // A19: null/undefined
  {
    label: 'A19. null → fatal/unclassified',
    input: null,
    expected: { kind: 'fatal', reason: 'unclassified', detail: 'null' },
  },
];

describe('classifyError', () => {
  for (const tc of CLASSIFY_TEST_CASES) {
    it(tc.label, () => {
      const result = classifyError(tc.input);
      expect(result.kind).toBe(tc.expected.kind);
      expect(result.reason).toBe(tc.expected.reason);
      if (tc.expected.detail !== undefined) {
        expect(result.detail).toBe(tc.expected.detail);
      }
    });
  }

  it('A19b. undefined → fatal/unclassified', () => {
    const result = classifyError(undefined);
    expect(result.kind).toBe('fatal');
    expect(result.reason).toBe('unclassified');
    expect(result.detail).toBe('undefined');
  });

  it('A20. CLASSIFY_TEST_CASES row-count gate: expect 20 cases (A11 tests 2 shapes)', () => {
    // A11 covers two error-body shapes for quotaExceeded (googleapis SDK version variance),
    // so the table has 20 entries total (not 19). Both shapes must classify identically.
    expect(CLASSIFY_TEST_CASES.length).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// PART B — withRetry (13 behavior tests)
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  it('B1. SUCCESS FIRST TRY: fn called once, sleep never called', async () => {
    const fn = vi.fn(async () => 'ok' as const);
    const sleepFn = vi.fn();
    const result = await withRetry(fn, { sleep: sleepFn });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('B2. SUCCESS AFTER ONE RETRY: delays [1000]', async () => {
    const { sleep, delays } = makeSleepRecorder();
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { sleep });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([1000]);
  });

  it('B3. SUCCESS AFTER TWO RETRIES: delays [1000, 4000]', async () => {
    const { sleep, delays } = makeSleepRecorder();
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { sleep });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([1000, 4000]);
  });

  it('B4. SUCCESS AFTER THREE RETRIES: delays [1000, 4000, 16000]', async () => {
    const { sleep, delays } = makeSleepRecorder();
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockRejectedValueOnce({ response: { status: 502 } })
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { sleep });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(4);
    expect(delays).toEqual([1000, 4000, 16000]);
  });

  it('B5. FAILS AFTER FOUR ATTEMPTS: throws wrapped error; cause = last rejection; delays [1000, 4000, 16000]', async () => {
    const { sleep, delays } = makeSleepRecorder();
    // All 4 rejections must be retriable (5xx) — plain Errors are fatal and won't retry
    const lastErr = { response: { status: 503 }, message: 'final 503' };
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockRejectedValueOnce({ response: { status: 502 } })
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce(lastErr);
    const caught = await withRetry(fn, { sleep }).catch((e) => e);
    expect(caught.message).toMatch(/upload failed after 4 attempts/);
    expect((caught as Error & { cause: unknown }).cause).toBe(lastErr);
    // Only 3 sleeps (not 4) — no sleep after the last failure
    expect(delays).toEqual([1000, 4000, 16000]);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('B6. QUOTA IMMEDIATELY: fn called once, sleep never called, QuotaExceededError with correct resumeAtHint', async () => {
    const sleepFn = vi.fn();
    const clock = () => new Date('2026-05-13T15:00:00.000Z');
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 403 }, errors: [{ reason: 'quotaExceeded' }] });
    const err = await withRetry(fn, { sleep: sleepFn, clock }).catch((e) => e);
    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err.resumeAtHint).toBe('2026-05-14T00:00:00.000Z');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('B7. FATAL IMMEDIATELY (UploadError): fn called once, sleep never called', async () => {
    const sleepFn = vi.fn();
    const uploadErr = new UploadError({
      field: 'videoId',
      reason: 'missing',
      remediation: '...',
    });
    const fn = vi.fn().mockRejectedValueOnce(uploadErr);
    await expect(withRetry(fn, { sleep: sleepFn })).rejects.toBeInstanceOf(UploadError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('B8. FATAL IMMEDIATELY (400 Bad Request): fn called once, sleep never called', async () => {
    const sleepFn = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce({ response: { status: 400 } });
    await expect(withRetry(fn, { sleep: sleepFn })).rejects.toMatchObject({
      response: { status: 400 },
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('B9. MIXED — retriable then fatal: fn called twice, delays [1000]', async () => {
    const { sleep, delays } = makeSleepRecorder();
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ response: { status: 400 } });
    await expect(withRetry(fn, { sleep })).rejects.toMatchObject({ response: { status: 400 } });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([1000]);
  });

  it('B10. NETWORK DROP RETRIES: ECONNRESET delays [1000, 4000]', async () => {
    const { sleep, delays } = makeSleepRecorder();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('socket hangup'), { code: 'ECONNRESET' }))
      .mockRejectedValueOnce(Object.assign(new Error('socket hangup'), { code: 'ECONNRESET' }))
      .mockResolvedValueOnce('recovered');
    const result = await withRetry(fn, { sleep });
    expect(result).toBe('recovered');
    expect(delays).toEqual([1000, 4000]);
  });

  it('B11. CUSTOM DELAYS: three retries see [10, 20, 30]', async () => {
    const { sleep, delays } = makeSleepRecorder();
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce('ok');
    await withRetry(fn, { sleep, delaysMs: [10, 20, 30] });
    expect(delays).toEqual([10, 20, 30]);
  });

  it('B12. onAttemptFail OBSERVER: called once on 5xx then success; not called on success', async () => {
    const { sleep } = makeSleepRecorder();
    const observations: Array<{ kind: string; attemptIndex: number }> = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce('ok');
    await withRetry(fn, {
      sleep,
      onAttemptFail: (cls, idx) => {
        observations.push({ kind: cls.kind, attemptIndex: idx });
      },
    });
    expect(observations).toHaveLength(1);
    expect(observations[0]).toEqual({ kind: 'retriable', attemptIndex: 0 });
  });

  it('B13. DEFAULT_RETRY_DELAYS_MS === [1000, 4000, 16000]', () => {
    expect(DEFAULT_RETRY_DELAYS_MS).toEqual([1000, 4000, 16000]);
  });
});

// ---------------------------------------------------------------------------
// PART C — publishWithRetry (integration with uploadEpisode)
// ---------------------------------------------------------------------------

describe('publishWithRetry', () => {
  beforeEach(() => {
    mockUpload.mockReset();
  });

  const fakeArgs = {
    client: {} as never,
    channel: {} as never,
    manifest: {} as never,
    episodePath: '/fake/episode.mp4',
    thumbnailPath: '/fake/thumb.png',
  };

  const fakeRecord = {
    videoId: 'abc123',
    watchUrl: 'https://youtu.be/abc123',
    uploadedAt: '2026-05-13T12:00:00.000Z',
    channelId: 'UC123',
    privacyStatus: 'unlisted' as const,
  };

  it('C1. PASSTHROUGH SUCCESS: resolves to publishRecord', async () => {
    mockUpload.mockResolvedValueOnce(fakeRecord);
    const result = await publishWithRetry(fakeArgs);
    expect(result).toEqual(fakeRecord);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it('C2. PASSTHROUGH RETRIES: uploadEpisode called 3 times; delays [1000, 4000]', async () => {
    const { sleep, delays } = makeSleepRecorder();
    mockUpload
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce(fakeRecord);
    const result = await publishWithRetry(fakeArgs, { sleep });
    expect(result).toEqual(fakeRecord);
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([1000, 4000]);
  });

  it('C3. PASSTHROUGH QUOTA: rejects with QuotaExceededError', async () => {
    const sleepSpy = vi.fn(async (_ms: number) => {});
    const clock = () => new Date('2026-05-13T15:00:00.000Z');
    mockUpload.mockRejectedValueOnce({
      response: { status: 403 },
      errors: [{ reason: 'quotaExceeded' }],
    });
    await expect(publishWithRetry(fakeArgs, { sleep: sleepSpy, clock })).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(sleepSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PART D — nextUtcMidnight helper (4 cases)
// ---------------------------------------------------------------------------

describe('nextUtcMidnight', () => {
  it('D1. mid-day UTC → next midnight', () => {
    expect(__test_nextUtcMidnight(new Date('2026-05-13T15:00:00.000Z')).toISOString()).toBe(
      '2026-05-14T00:00:00.000Z',
    );
  });

  it('D2. already at midnight → NEXT midnight (not same)', () => {
    expect(__test_nextUtcMidnight(new Date('2026-05-13T00:00:00.000Z')).toISOString()).toBe(
      '2026-05-14T00:00:00.000Z',
    );
  });

  it('D3. just before midnight → next midnight', () => {
    expect(__test_nextUtcMidnight(new Date('2026-05-13T23:59:59.999Z')).toISOString()).toBe(
      '2026-05-14T00:00:00.000Z',
    );
  });

  it('D4. end of month → rolls over to next month', () => {
    expect(__test_nextUtcMidnight(new Date('2026-05-31T15:00:00.000Z')).toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    );
  });
});
