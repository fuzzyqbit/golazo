/**
 * Retry / backoff / quota classification policy for the golazo publish pipeline.
 *
 * Exports:
 *   DEFAULT_RETRY_DELAYS_MS — PUB-05 contract: [1000, 4000, 16000] ms
 *   classifyError(err) — pure classifier: retriable | quota | fatal
 *   withRetry(fn, opts) — generic retry wrapper with injectable sleep + clock
 *   publishWithRetry(args, retryOpts) — convenience: wraps uploadEpisode with retry policy
 *   __test_nextUtcMidnight — exported for test assertions only (underscore-prefixed)
 *
 * RETRY POLICY (PUB-05):
 *   Up to 3 retries (4 total attempts) for retriable errors (HTTP 5xx, 429, network drops).
 *   Backoff delays: 1000ms before attempt 2, 4000ms before attempt 3, 16000ms before attempt 4.
 *   Total worst-case wait: 21000ms.
 *   After exhaustion, throws a wrapped Error with { cause: lastErr }.
 *
 * QUOTA HANDLING (PUB-06):
 *   HTTP 403 with errors[0].reason === 'quotaExceeded' → immediate QuotaExceededError.
 *   NO retry is attempted. resumeAtHint = next UTC midnight (conservative estimate;
 *   actual YouTube quota reset is midnight Pacific Time = 08:00 UTC PST / 07:00 UTC PDT).
 *
 * FATAL ERRORS:
 *   UploadError, OAuthError, 4xx-non-quota, unclassified → re-thrown immediately, no retry.
 *
 * RESUMABLE UPLOADS:
 *   publishWithRetry re-invokes uploadEpisode (which calls createReadStream) on each retry,
 *   giving fresh-stream semantics. The googleapis SDK's multipart upload does not persist
 *   resumable-session state across attempts — each retry is a clean upload attempt.
 *
 * LOGGING DISCIPLINE:
 *   This module is write-silent. Plan 03-05's CLI handler logs via the onAttemptFail observer.
 *   The observer MUST log only classification.kind + classification.detail — never err.message
 *   (which may contain credentials or headers).
 */

import { OAuthError, QuotaExceededError, UploadError } from './errors.js';
import { uploadEpisode } from './uploader.js';
import type { UploadEpisodeArgs, PublishRecord } from './uploader.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default exponential backoff delays for `withRetry`.
 *
 * PUB-05 contract: 1s before attempt 2, 4s before attempt 3, 16s before
 * attempt 4 (total 4 attempts = initial + 3 retries; worst-case 21s wait).
 *
 * The array is `readonly` — do NOT mutate at runtime. `withRetry` accepts
 * an `opts.delaysMs` override only for test injection (Plan 03-04's test
 * suite uses [10, 20, 30] to avoid real delays). Plan 03-05's CLI handler
 * passes no custom delays — the production policy is this locked default.
 */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [1000, 4000, 16000];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Default sleep implementation using setTimeout.
 * Replaced in tests via opts.sleep injection.
 */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns the Date at the next 00:00:00.000 UTC after `now`.
 * If `now` is exactly at midnight UTC, returns the NEXT midnight (not the same).
 *
 * NOTE: YouTube's actual daily quota resets at midnight Pacific Time
 * (PST = 08:00 UTC, PDT = 07:00 UTC). This function returns next UTC
 * midnight as a conservative estimate — the operator may need to wait a
 * few additional hours in the worst case.
 *
 * Exported under the underscore-prefixed name `__test_nextUtcMidnight` for
 * use in tests (Part D). Plan 03-05 does NOT import this function.
 */
export function __test_nextUtcMidnight(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
}

// ---------------------------------------------------------------------------
// ErrorClassification
// ---------------------------------------------------------------------------

/**
 * Classification result from {@link classifyError}.
 *
 * Plan 03-05's CLI handler can inspect this to emit targeted retry messages:
 *   e.g. `'retry 1/3 after 1s: 5xx (503)'` to stderr.
 *
 * SECURITY: The CLI handler MUST log only `kind` + `detail`, never `reason`
 * from an underlying `err.message` — the latter may contain auth headers.
 */
export interface ErrorClassification {
  kind: 'retriable' | 'quota' | 'fatal';
  reason: string;
  /**
   * When kind === 'retriable', the HTTP status code (e.g. '500', '503', '429')
   * or `'network'` for socket errors. Undefined for fatal/quota.
   * For debugging and operator-facing retry messages only.
   */
  detail?: string;
}

// Network error codes that indicate transient connectivity failures
const NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE']);

/**
 * Pure error classifier. No I/O, no side effects.
 *
 * Classification algorithm:
 *  1. instanceof QuotaExceededError → quota (idempotent re-classification)
 *  2. instanceof UploadError → fatal (shape failures don't recover from retry)
 *  3. instanceof OAuthError → fatal (auth failures need operator action)
 *  4. Network socket error codes → retriable
 *  5. HTTP status codes:
 *     a. 403 with quotaExceeded reason → quota
 *     b. 5xx → retriable
 *     c. 429 → retriable (rate-limited)
 *     d. 4xx → fatal
 *  6. Otherwise → fatal/unclassified
 *
 * Exported so Plan 03-05's CLI handler can introspect errors independently
 * (e.g. to build the `onAttemptFail` observer message).
 */
export function classifyError(err: unknown): ErrorClassification {
  // Guard against null/undefined
  if (err === null || err === undefined) {
    return { kind: 'fatal', reason: 'unclassified', detail: String(err) };
  }

  // Step 1: Already a QuotaExceededError — idempotent re-classification
  if (err instanceof QuotaExceededError) {
    return { kind: 'quota', reason: err.message };
  }

  // Step 2: UploadError — shape failures (missing file, missing videoId)
  if (err instanceof UploadError) {
    return { kind: 'fatal', reason: err.message };
  }

  // Step 3: OAuthError — auth failures require operator action
  if (err instanceof OAuthError) {
    return { kind: 'fatal', reason: err.message };
  }

  // Step 4: Network socket errors (plain Node Error with a string .code)
  const errObj = err as Record<string, unknown>;
  if (typeof errObj.code === 'string' && NETWORK_CODES.has(errObj.code)) {
    return { kind: 'retriable', reason: 'network', detail: errObj.code };
  }

  // Step 5: HTTP status errors (GaxiosError or synthetic shape)
  // Status can appear in err.response?.status OR as a numeric err.code
  let status: number | null = null;

  if (errObj.response !== null && errObj.response !== undefined) {
    const response = errObj.response as Record<string, unknown>;
    if (typeof response.status === 'number') {
      status = response.status;
    }
  }

  // Some googleapis SDK versions surface numeric status as err.code
  if (status === null && typeof errObj.code === 'number') {
    status = errObj.code;
  }

  if (status !== null) {
    // 5a: 403 — check for quotaExceeded reason in two possible shapes
    if (status === 403) {
      const isQuota = isQuotaExceededError(errObj);
      if (isQuota) {
        return { kind: 'quota', reason: 'quotaExceeded' };
      }
      // 403 without quotaExceeded → fatal (forbidden, wrong scope, etc.)
      return { kind: 'fatal', reason: '4xx', detail: '403' };
    }

    // 5b: 5xx server errors → retriable
    if (status >= 500 && status < 600) {
      return { kind: 'retriable', reason: '5xx', detail: String(status) };
    }

    // 5c: 429 rate-limited → retriable
    if (status === 429) {
      return { kind: 'retriable', reason: 'rate-limited', detail: '429' };
    }

    // 5d: 4xx client errors → fatal (4xx means the request is wrong)
    if (status >= 400 && status < 500) {
      return { kind: 'fatal', reason: '4xx', detail: String(status) };
    }
  }

  // Step 6: Unclassified — fatal
  return { kind: 'fatal', reason: 'unclassified', detail: String(err) };
}

/**
 * Check whether a 403 error object contains a quotaExceeded reason.
 *
 * googleapis surfaces the error details in two different locations depending
 * on SDK version:
 *   Shape 1: err.errors[0].reason === 'quotaExceeded'
 *   Shape 2: err.response.data.error.errors[0].reason === 'quotaExceeded'
 *
 * Both are checked so quota detection is SDK-version-agnostic.
 * Threat T-03-17: misclassification prevented by testing both shapes (case A11).
 */
function isQuotaExceededError(errObj: Record<string, unknown>): boolean {
  // Shape 1: err.errors[0].reason
  if (Array.isArray(errObj.errors)) {
    const firstError = errObj.errors[0] as Record<string, unknown> | undefined;
    if (firstError?.reason === 'quotaExceeded') {
      return true;
    }
  }

  // Shape 2: err.response.data.error.errors[0].reason
  const response = errObj.response as Record<string, unknown> | undefined;
  if (response !== undefined) {
    const data = response.data as Record<string, unknown> | undefined;
    if (data !== undefined) {
      const apiError = data.error as Record<string, unknown> | undefined;
      if (apiError !== undefined && Array.isArray(apiError.errors)) {
        const firstApiError = apiError.errors[0] as Record<string, unknown> | undefined;
        if (firstApiError?.reason === 'quotaExceeded') {
          return true;
        }
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// WithRetryOpts
// ---------------------------------------------------------------------------

/**
 * Options for {@link withRetry}.
 */
export interface WithRetryOpts {
  /**
   * Override the default [1000, 4000, 16000] backoff delays (in ms).
   * Length of the array determines the maximum number of retries.
   * For tests: pass [10, 20, 30] to simulate the production policy without
   * waiting 21 seconds.
   */
  delaysMs?: readonly number[];

  /**
   * Injectable sleep function for test determinism.
   * Default: setTimeout-based defaultSleep.
   * Tests inject `async (ms) => { delaysObserved.push(ms); }`.
   */
  sleep?: (ms: number) => Promise<void>;

  /**
   * Injectable clock for QuotaExceededError.resumeAtHint computation.
   * Default: () => new Date().
   * Tests inject a fixed Date to pin the resumeAtHint value.
   */
  clock?: () => Date;

  /**
   * Observer hook called with the error classification and attempt index
   * after each failure, BEFORE the sleep. Default: no-op.
   *
   * NOT for production logging — Plan 03-05's CLI handler registers this.
   *
   * SECURITY: The observer MUST log only `classification.kind` +
   * `classification.detail`, never `err.message` (may contain credentials).
   * See Threat T-03-19.
   */
  onAttemptFail?: (classification: ErrorClassification, attemptIndex: number) => void;
}

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

/**
 * Generic retry wrapper implementing the PUB-05 / PUB-06 policy.
 *
 * Retries retriable errors up to `delaysMs.length` times (default 3).
 * Short-circuits immediately on quota errors (QuotaExceededError) and
 * fatal errors (UploadError, OAuthError, 4xx-non-quota, unclassified).
 *
 * Threat T-03-16: Hard cap on retries — `attempt >= delaysMs.length` check
 * ensures no code path can extend the retry limit at runtime.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts?: WithRetryOpts): Promise<T> {
  const delaysMs = opts?.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const sleep = opts?.sleep ?? defaultSleep;
  const clock = opts?.clock ?? (() => new Date());
  const onAttemptFail = opts?.onAttemptFail ?? (() => {});

  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const cls = classifyError(err);
      onAttemptFail(cls, attempt);

      if (cls.kind === 'quota') {
        // PUB-06: immediate failure with "rerun tomorrow" hint
        throw new QuotaExceededError({
          reason: cls.reason,
          resumeAtHint: __test_nextUtcMidnight(clock()).toISOString(),
          cause: err,
        });
      }

      if (cls.kind === 'fatal') {
        // Re-throw unwrapped — the caller gets the original error
        throw err;
      }

      // retriable — check if retries are exhausted
      if (attempt >= delaysMs.length) {
        // Exhausted all retries — wrap with cause to preserve stack trace
        const lastErrMsg = err instanceof Error ? err.message : String(err);
        const wrapped = new Error(
          `upload failed after ${attempt + 1} attempts: ${lastErrMsg}`,
        ) as Error & { cause: unknown };
        wrapped.cause = err;
        throw wrapped;
      }

      // Sleep before the next attempt.
      // delaysMs[attempt] is always defined here because we checked attempt < delaysMs.length above.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await sleep(delaysMs[attempt]!);
      attempt++;
    }
  }
}

// ---------------------------------------------------------------------------
// publishWithRetry
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper that combines `uploadEpisode` (Plan 03-03) with the
 * `withRetry` retry policy. This is the production entry point for Plan 03-05.
 *
 * The lambda `() => uploadEpisode(args)` ensures `createReadStream(episodePath)`
 * is re-invoked on each retry attempt, giving fresh-stream semantics. The
 * googleapis SDK's multipart upload uses a new HTTP request for each attempt —
 * the lambda re-creates the stream from offset 0 each time.
 */
export async function publishWithRetry(
  args: UploadEpisodeArgs,
  retryOpts?: WithRetryOpts,
): Promise<PublishRecord> {
  return withRetry(() => uploadEpisode(args), retryOpts);
}
