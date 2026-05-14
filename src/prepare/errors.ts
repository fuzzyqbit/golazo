/**
 * Custom error classes for the prepare pipeline. Mirrors the
 * `src/config/errors.ts` pattern: each class carries structured fields on
 * the instance + a `toJSON()` method, and the `message` is a single line
 * naming the offending input, the reason, and a remediation hint.
 *
 * Two classes:
 *  - {@link FilenameError} — thrown by `parseFilename` when a folder name
 *    does not match the canonical convention or the date is not a real
 *    calendar date or a score component is > 99.
 *  - {@link KidPathError} — thrown by `resolveKidFromPath` when the supplied
 *    path does not contain a `~/golazo/<kid>/<game-folder>/` layout (e.g.
 *    relative paths, missing `golazo` segment, no segment after `golazo`).
 */

/** Inputs to {@link FilenameError}. */
export interface FilenameErrorInput {
  /** The folder name (just the basename, not a full path) that failed to parse. */
  folderName: string;
  /** Short reason for the failure (e.g. `does not match required pattern`). */
  reason: string;
}

/** Serialised representation of {@link FilenameError} for structured logging. */
export interface FilenameErrorJson {
  name: 'FilenameError';
  folderName: string;
  reason: string;
}

/**
 * Thrown by `parseFilename` when the folder name violates the
 * `YYYY-MM-DD_vs_<slug>_<for>-<against>` convention. The message echoes the
 * expected format verbatim so operators see the contract in their terminal.
 */
export class FilenameError extends Error {
  public readonly folderName: string;
  public readonly reason: string;

  constructor(input: FilenameErrorInput) {
    super(
      `folder name '${input.folderName}' is invalid: ${input.reason}. Expected format: YYYY-MM-DD_vs_<slug>_<for>-<against> (e.g. 2026-05-13_vs_united_3-1)`,
    );
    this.name = 'FilenameError';
    this.folderName = input.folderName;
    this.reason = input.reason;
    Object.setPrototypeOf(this, FilenameError.prototype);
  }

  toJSON(): FilenameErrorJson {
    return {
      name: 'FilenameError',
      folderName: this.folderName,
      reason: this.reason,
    };
  }
}

/** Inputs to {@link KidPathError}. */
export interface KidPathErrorInput {
  /** The absolute folder path that failed to resolve to a kid. */
  folderPath: string;
  /** Short reason for the failure. */
  reason: string;
}

/** Serialised representation of {@link KidPathError} for structured logging. */
export interface KidPathErrorJson {
  name: 'KidPathError';
  folderPath: string;
  reason: string;
}

/**
 * Thrown by `resolveKidFromPath` when the supplied path cannot be decoded
 * as `~/golazo/<kid>/<game-folder>/`. Covers relative paths, missing
 * `golazo` segment, and `golazo` appearing as the last segment (no kid
 * after it). The message echoes the expected layout so operators can
 * reorganise their folders.
 */
export class KidPathError extends Error {
  public readonly folderPath: string;
  public readonly reason: string;

  constructor(input: KidPathErrorInput) {
    super(
      `cannot resolve kid from path '${input.folderPath}': ${input.reason}. Expected layout: ~/golazo/<kid>/<game-folder>/`,
    );
    this.name = 'KidPathError';
    this.folderPath = input.folderPath;
    this.reason = input.reason;
    Object.setPrototypeOf(this, KidPathError.prototype);
  }

  toJSON(): KidPathErrorJson {
    return {
      name: 'KidPathError',
      folderPath: this.folderPath,
      reason: this.reason,
    };
  }
}
