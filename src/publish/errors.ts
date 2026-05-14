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
 * Message format mirrors ManifestError / RenderError:
 *   "oauth: <field>: <reason>. <remediation>"
 *   "template: <field>: <reason>. <remediation>"
 */

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
