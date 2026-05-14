/**
 * Custom error classes for the `channels.yaml` loader. Every load-time
 * failure (zod validation, missing file, missing OAuth token, unknown kid
 * lookup) surfaces as one of these so callers can branch on
 * `instanceof ChannelsConfigError` / `UnknownKidError` and operators
 * see a single-line message of the form
 * `channels.yaml: <field>: <reason>. <remediation>`.
 */

/** Inputs to {@link ChannelsConfigError}. All three text fields are required. */
export interface ChannelsConfigErrorInput {
  /** Dotted field path identifying the failing leaf (e.g. `leo.accent`). */
  field: string;
  /** Short human-readable reason (e.g. `must match #RRGGBB hex`). */
  reason: string;
  /** Operator-facing remediation hint (e.g. `edit channels.yaml ...`). */
  remediation: string;
  /** Optional source path (e.g. resolved token path, channels.yaml path). */
  source?: string;
}

/** Serialised representation of {@link ChannelsConfigError} for structured logging. */
export interface ChannelsConfigErrorJson {
  name: 'ChannelsConfigError';
  field: string;
  reason: string;
  remediation: string;
  source?: string;
}

/**
 * Thrown on any validation failure when loading `channels.yaml`:
 * missing file, yaml syntax error, zod schema failure, or missing OAuth
 * token file on disk. The single-line `message` is the canonical operator
 * surface; the structured properties are stable for tests + tooling.
 */
export class ChannelsConfigError extends Error {
  public readonly field: string;
  public readonly reason: string;
  public readonly remediation: string;
  public readonly source: string | undefined;

  constructor(input: ChannelsConfigErrorInput) {
    super(`channels.yaml: ${input.field}: ${input.reason}. ${input.remediation}`);
    this.name = 'ChannelsConfigError';
    this.field = input.field;
    this.reason = input.reason;
    this.remediation = input.remediation;
    this.source = input.source;
    // Re-set the prototype for instanceof to work after ES5 transpilation
    // (no-op on native ES2023, but cheap insurance).
    Object.setPrototypeOf(this, ChannelsConfigError.prototype);
  }

  /** Plain-object form for structured logging / serialisation. */
  toJSON(): ChannelsConfigErrorJson {
    const out: ChannelsConfigErrorJson = {
      name: 'ChannelsConfigError',
      field: this.field,
      reason: this.reason,
      remediation: this.remediation,
    };
    if (this.source !== undefined) {
      out.source = this.source;
    }
    return out;
  }
}

/** Inputs to {@link UnknownKidError}. */
export interface UnknownKidErrorInput {
  /** The kid key the operator asked for that wasn't in the loaded file. */
  kidKey: string;
  /** All kid keys actually present in the loaded channels.yaml. */
  validKeys: readonly string[];
}

/** Serialised representation of {@link UnknownKidError} for structured logging. */
export interface UnknownKidErrorJson {
  name: 'UnknownKidError';
  kidKey: string;
  validKeys: readonly string[];
}

/**
 * Thrown by `loadChannel(kidKey)` when the requested key is not present
 * in the loaded channels.yaml. Carries the full list of valid keys so the
 * operator can see at a glance what's available and what to add.
 */
export class UnknownKidError extends Error {
  public readonly kidKey: string;
  public readonly validKeys: readonly string[];

  constructor(input: UnknownKidErrorInput) {
    super(
      `unknown kid '${input.kidKey}'. Valid keys: ${input.validKeys.join(', ')}. Edit channels.yaml to add '${input.kidKey}'.`,
    );
    this.name = 'UnknownKidError';
    this.kidKey = input.kidKey;
    this.validKeys = input.validKeys;
    Object.setPrototypeOf(this, UnknownKidError.prototype);
  }

  /** Plain-object form for structured logging / serialisation. */
  toJSON(): UnknownKidErrorJson {
    return {
      name: 'UnknownKidError',
      kidKey: this.kidKey,
      validKeys: this.validKeys,
    };
  }
}
