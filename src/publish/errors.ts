/**
 * Custom error classes for the publish pipeline (Phase 3).
 *
 * OAuthError is thrown at four primary sites:
 *  1. Missing token file (loadToken — field: 'tokenPath')
 *  2. Malformed token JSON (loadToken — field: 'tokenJson')
 *  3. Exchange failure — Google rejected the authorization code (exchangeCode — field: 'exchange')
 *  4. Refresh failure — refresh_token revoked / invalid_grant (loadToken — field: 'refresh')
 *
 * TemplateError is thrown by renderTitle / renderDescription / renderTemplates
 * when zod's defensive safeParse finds a shape violation at runtime.
 *
 * UploadError is thrown by uploadEpisode for shape failures:
 *  1. Missing episode file on disk (field: 'episodePath')
 *  2. Missing thumbnail file on disk (field: 'thumbnailPath')
 *  3. YouTube response missing video id (field: 'videoId')
 *
 * QuotaExceededError is thrown by withRetry (Plan 03-04) when the YouTube API
 * returns HTTP 403 with errors[0].reason === 'quotaExceeded'. Carries a
 * resumeAtHint (next UTC midnight) so the operator knows when to retry.
 *
 * Message format mirrors ManifestError / RenderError:
 *   "oauth: <field>: <reason>. <remediation>"
 *   "template: <field>: <reason>. <remediation>"
 *   "upload: <field>: <reason>. <remediation>"
 *   "publish: quota: <reason>. Rerun after <resumeAtHint>."
 */

// ---------------------------------------------------------------------------
// Internal helper: next UTC midnight from a given Date
// ---------------------------------------------------------------------------

/**
 * Returns the Date at the next 00:00:00.000 UTC after `now`.
 * If `now` is exactly at midnight UTC, returns the NEXT midnight (not the same).
 *
 * NOTE: YouTube's actual daily quota resets at midnight Pacific Time (PST = 08:00 UTC,
 * PDT = 07:00 UTC). This function returns next UTC midnight as a conservative estimate —
 * the operator may need to wait an additional few hours in the worst case. Plan 03-05
 * operator docs should document this timezone reality.
 */
function computeDefaultResumeHint(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  ).toISOString();
}

/** Inputs to {@link OAuthError}. */
export interface OAuthErrorInput {
  /** Dotted field path or context label that failed. */
  field: string;
  /** Short reason for the failure. */
  reason: string;
  /** Operator-facing remediation hint. */
  remediation: string;
}

/** Serialised representation of {@link OAuthError} for structured logging. */
export interface OAuthErrorJson {
  name: 'OAuthError';
  field: string;
  reason: string;
  remediation: string;
}

/**
 * Thrown by OAuth helpers when token I/O or the Google authorization flow fails.
 *
 * Single-line message format `oauth: <field>: <reason>. <remediation>` mirrors
 * `ManifestError` / `RenderError` for stylistic consistency across pipeline
 * error classes.
 */
export class OAuthError extends Error {
  public readonly field: string;
  public readonly reason: string;
  public readonly remediation: string;

  constructor(input: OAuthErrorInput) {
    super(`oauth: ${input.field}: ${input.reason}. ${input.remediation}`);
    this.name = 'OAuthError';
    this.field = input.field;
    this.reason = input.reason;
    this.remediation = input.remediation;
    Object.setPrototypeOf(this, OAuthError.prototype);
  }

  toJSON(): OAuthErrorJson {
    return {
      name: 'OAuthError',
      field: this.field,
      reason: this.reason,
      remediation: this.remediation,
    };
  }
}

// ---------------------------------------------------------------------------
// TemplateError
// ---------------------------------------------------------------------------

/** Inputs to {@link TemplateError}. */
export interface TemplateErrorInput {
  /** Dotted field path that failed validation. */
  field: string;
  /** Short reason for the failure. */
  reason: string;
  /** Operator-facing remediation hint. */
  remediation: string;
}

/** Serialised representation of {@link TemplateError} for structured logging. */
export interface TemplateErrorJson {
  name: 'TemplateError';
  field: string;
  reason: string;
  remediation: string;
}

/**
 * Thrown by template renderers when the defensive zod parse detects a shape
 * violation at runtime. TypeScript catches most violations at compile time;
 * this class exists for the `as any` / edge cases that reach the runtime path.
 *
 * Single-line message format `template: <field>: <reason>. <remediation>`
 * mirrors `OAuthError` / `ManifestError` / `RenderError`.
 */
export class TemplateError extends Error {
  public readonly field: string;
  public readonly reason: string;
  public readonly remediation: string;

  constructor(input: TemplateErrorInput) {
    super(`template: ${input.field}: ${input.reason}. ${input.remediation}`);
    this.name = 'TemplateError';
    this.field = input.field;
    this.reason = input.reason;
    this.remediation = input.remediation;
    Object.setPrototypeOf(this, TemplateError.prototype);
  }

  toJSON(): TemplateErrorJson {
    return {
      name: 'TemplateError',
      field: this.field,
      reason: this.reason,
      remediation: this.remediation,
    };
  }
}

// ---------------------------------------------------------------------------
// UploadError
// ---------------------------------------------------------------------------

/** Inputs to {@link UploadError}. */
export interface UploadErrorInput {
  /** Dotted field path or context label that failed. */
  field: string;
  /** Short reason for the failure. */
  reason: string;
  /** Operator-facing remediation hint. */
  remediation: string;
}

/** Serialised representation of {@link UploadError} for structured logging. */
export interface UploadErrorJson {
  name: 'UploadError';
  field: string;
  reason: string;
  remediation: string;
}

/**
 * Thrown by `uploadEpisode` for shape failures (missing file on disk, missing
 * videoId in YouTube response). HTTP failures from the googleapis SDK surface
 * as `GaxiosError` and are intentionally NOT wrapped here — Plan 03-04's
 * `withRetry` wrapper catches and classifies those by status code.
 *
 * Single-line message format `upload: <field>: <reason>. <remediation>` mirrors
 * `OAuthError` / `TemplateError` / `ManifestError` / `RenderError`.
 */
export class UploadError extends Error {
  public readonly field: string;
  public readonly reason: string;
  public readonly remediation: string;

  constructor(input: UploadErrorInput) {
    super(`upload: ${input.field}: ${input.reason}. ${input.remediation}`);
    this.name = 'UploadError';
    this.field = input.field;
    this.reason = input.reason;
    this.remediation = input.remediation;
    Object.setPrototypeOf(this, UploadError.prototype);
  }

  toJSON(): UploadErrorJson {
    return {
      name: 'UploadError',
      field: this.field,
      reason: this.reason,
      remediation: this.remediation,
    };
  }
}

// ---------------------------------------------------------------------------
// QuotaExceededError
// ---------------------------------------------------------------------------

/** Inputs to {@link QuotaExceededError}. */
export interface QuotaExceededErrorInput {
  /**
   * Operator-friendly reason.
   * Defaults to 'YouTube daily upload quota exhausted'.
   */
  reason?: string;
  /**
   * ISO 8601 UTC timestamp of the next quota reset.
   * Defaults to the next UTC midnight (computed from clock at construction time).
   */
  resumeAtHint?: string;
  /** Underlying error (the GaxiosError from googleapis). For debugging. */
  cause?: unknown;
}

/** Serialised representation of {@link QuotaExceededError} for structured logging. */
export interface QuotaExceededErrorJson {
  name: 'QuotaExceededError';
  reason: string;
  resumeAtHint: string;
}

/**
 * Thrown by Plan 03-04's `withRetry` when the YouTube API returns HTTP 403
 * with `errors[0].reason === 'quotaExceeded'`. This is not a transient error
 * and must NOT be retried — the quota resets daily.
 *
 * Single-line message format:
 *   "publish: quota: <reason>. Rerun after <resumeAtHint>."
 *
 * Plan 03-05's CLI handler branches on `instanceof QuotaExceededError` to
 * display the "rerun tomorrow" remediation message.
 *
 * NOTE on timezone: YouTube's quota resets at midnight Pacific Time
 * (08:00 UTC under PST, 07:00 UTC under PDT). The `resumeAtHint` is the next
 * UTC midnight — a conservative estimate. Operators may have to wait an
 * additional few hours in the worst case.
 */
export class QuotaExceededError extends Error {
  public readonly reason: string;
  public readonly resumeAtHint: string;

  constructor(input: QuotaExceededErrorInput = {}) {
    const reason = input.reason ?? 'YouTube daily upload quota exhausted';
    const resumeAtHint = input.resumeAtHint ?? computeDefaultResumeHint();
    super(`publish: quota: ${reason}. Rerun after ${resumeAtHint}.`);
    this.name = 'QuotaExceededError';
    this.reason = reason;
    this.resumeAtHint = resumeAtHint;
    if (input.cause !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).cause = input.cause;
    }
    Object.setPrototypeOf(this, QuotaExceededError.prototype);
  }

  toJSON(): QuotaExceededErrorJson {
    return {
      name: 'QuotaExceededError',
      reason: this.reason,
      resumeAtHint: this.resumeAtHint,
    };
  }
}
