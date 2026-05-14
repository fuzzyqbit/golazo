/**
 * Custom error classes for the prepare pipeline and render subsystem.
 * Mirrors the `src/config/errors.ts` pattern: each class carries structured
 * fields on the instance + a `toJSON()` method, and the `message` is a
 * single line naming the offending input, the reason, and a remediation hint.
 *
 * Seven classes:
 *  - {@link FilenameError} — thrown by `parseFilename` when a folder name
 *    does not match the canonical convention or the date is not a real
 *    calendar date or a score component is > 99.
 *  - {@link KidPathError} — thrown by `resolveKidFromPath` when the supplied
 *    path does not contain a `~/golazo/<kid>/<game-folder>/` layout (e.g.
 *    relative paths, missing `golazo` segment, no segment after `golazo`).
 *  - {@link ClipDiscoveryError} — thrown by `discoverClips` when the
 *    supplied folder does not exist, is not a directory, or contains zero
 *    files matching the `NN-<name>.mp4` pattern. Lists the skipped files so
 *    the operator can see what got filtered out.
 *  - {@link ProbeError} — thrown by `probeDuration` when ffprobe exits
 *    non-zero or returns a non-numeric duration. Carries the file path,
 *    exit code, and full stderr so the failure mode is reproducible.
 *  - {@link ManifestError} — thrown by `buildManifest` / `readManifest`
 *    (Plan 05) when an input fails the manifest contract (e.g. empty clips
 *    array, malformed on-disk manifest.json, zod validation failure on the
 *    parsed object). Carries the field that failed, the reason, and a
 *    remediation hint.
 *  - {@link MusicPoolError} — thrown by `loadMusicPool` (Plan 02-02) when
 *    `remotion/assets/music/index.json` is absent, malformed, fails zod
 *    schema validation, or declares a file that is not present on disk.
 *  - {@link MusicPickError} — thrown by `pickTrack` (Plan 02-02) when the
 *    music pool is empty and no track can be selected.
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

/** Inputs to {@link ClipDiscoveryError}. */
export interface ClipDiscoveryErrorInput {
  /** The folder path that failed discovery. */
  folderPath: string;
  /**
   * Files inside the folder that did NOT match `^\d+-.+\.mp4$`. Always a
   * defined array — empty when the folder itself was empty, populated when
   * there were non-matching files.
   */
  skippedFiles: readonly string[];
  /** Short reason (e.g. `no files match NN-*.mp4`, `folder does not exist`). */
  reason: string;
}

/** Serialised representation of {@link ClipDiscoveryError} for structured logging. */
export interface ClipDiscoveryErrorJson {
  name: 'ClipDiscoveryError';
  folderPath: string;
  skippedFiles: readonly string[];
  reason: string;
}

/**
 * Thrown by `discoverClips` when the supplied folder does not exist, is
 * not a directory, or contains zero files matching the `NN-<name>.mp4`
 * pattern. The message lists every skipped file so the operator can see
 * which files were filtered (`(none)` when the folder was empty), and
 * echoes the expected pattern so the contract is visible.
 */
export class ClipDiscoveryError extends Error {
  public readonly folderPath: string;
  public readonly skippedFiles: readonly string[];
  public readonly reason: string;

  constructor(input: ClipDiscoveryErrorInput) {
    const skippedList = input.skippedFiles.length === 0 ? '(none)' : input.skippedFiles.join(', ');
    super(
      `clip discovery failed in '${input.folderPath}': ${input.reason}. Skipped non-matching files: ${skippedList}. Expected files matching ^NN-<name>.mp4 (e.g. 01-clip.mp4).`,
    );
    this.name = 'ClipDiscoveryError';
    this.folderPath = input.folderPath;
    this.skippedFiles = input.skippedFiles;
    this.reason = input.reason;
    Object.setPrototypeOf(this, ClipDiscoveryError.prototype);
  }

  toJSON(): ClipDiscoveryErrorJson {
    return {
      name: 'ClipDiscoveryError',
      folderPath: this.folderPath,
      skippedFiles: this.skippedFiles,
      reason: this.reason,
    };
  }
}

/** Inputs to {@link ProbeError}. */
export interface ProbeErrorInput {
  /** Absolute path of the file ffprobe failed on. */
  filePath: string;
  /** Exit code from ffprobe (or 0 when the failure was a non-numeric stdout). */
  exitCode: number;
  /** Full stderr text from ffprobe (or a synthetic message for non-numeric stdout). */
  stderr: string;
}

/** Serialised representation of {@link ProbeError} for structured logging. */
export interface ProbeErrorJson {
  name: 'ProbeError';
  filePath: string;
  exitCode: number;
  stderr: string;
}

/**
 * Thrown by `probeDuration` when ffprobe exits non-zero or returns a
 * non-numeric duration. The message includes the file path, the exit
 * code, and the full stderr text so the operator can reproduce the
 * failure outside the CLI. Remediation hint points at the canonical
 * "fix or remove the corrupt clip and rerun 'golazo prepare'" loop.
 */
export class ProbeError extends Error {
  public readonly filePath: string;
  public readonly exitCode: number;
  public readonly stderr: string;

  constructor(input: ProbeErrorInput) {
    super(
      `ffprobe failed on '${input.filePath}' (exit code ${input.exitCode}): ${input.stderr}. Fix or remove the corrupt clip and rerun 'golazo prepare'.`,
    );
    this.name = 'ProbeError';
    this.filePath = input.filePath;
    this.exitCode = input.exitCode;
    this.stderr = input.stderr;
    Object.setPrototypeOf(this, ProbeError.prototype);
  }

  toJSON(): ProbeErrorJson {
    return {
      name: 'ProbeError',
      filePath: this.filePath,
      exitCode: this.exitCode,
      stderr: this.stderr,
    };
  }
}

/** Inputs to {@link ManifestError}. */
export interface ManifestErrorInput {
  /**
   * Dotted field path inside the manifest that failed (e.g. `clips`,
   * `clips.0.sha256`, `version`, or `(yaml)` / `(file)` for top-level
   * failures). Mirrors the convention used by `ChannelsConfigError`.
   */
  field: string;
  /** Short reason for the failure (e.g. `must contain at least one clip`). */
  reason: string;
  /** Operator-facing remediation hint (e.g. `add NN-*.mp4 files to the folder`). */
  remediation: string;
}

/** Serialised representation of {@link ManifestError} for structured logging. */
export interface ManifestErrorJson {
  name: 'ManifestError';
  field: string;
  reason: string;
  remediation: string;
}

/**
 * Thrown by `buildManifest`, `readManifest`, and (transitively)
 * `runPrepare` when an input or on-disk file violates the manifest
 * contract. Single-line message format `manifest: <field>: <reason>.
 * <remediation>` keeps stderr output operator-friendly and matches the
 * shape of `ChannelsConfigError` for stylistic consistency.
 */
export class ManifestError extends Error {
  public readonly field: string;
  public readonly reason: string;
  public readonly remediation: string;

  constructor(input: ManifestErrorInput) {
    super(`manifest: ${input.field}: ${input.reason}. ${input.remediation}`);
    this.name = 'ManifestError';
    this.field = input.field;
    this.reason = input.reason;
    this.remediation = input.remediation;
    Object.setPrototypeOf(this, ManifestError.prototype);
  }

  toJSON(): ManifestErrorJson {
    return {
      name: 'ManifestError',
      field: this.field,
      reason: this.reason,
      remediation: this.remediation,
    };
  }
}

// ---------------------------------------------------------------------------
// Music subsystem errors (Plan 02-02)
// ---------------------------------------------------------------------------

/** Inputs to {@link MusicPoolError}. */
export interface MusicPoolErrorInput {
  /**
   * Dotted field path or context label that failed
   * (e.g. `indexPath`, `pool`, `pool[0].file`).
   */
  field: string;
  /** Short reason for the failure. */
  reason: string;
  /** Operator-facing remediation hint. */
  remediation: string;
}

/** Serialised representation of {@link MusicPoolError} for structured logging. */
export interface MusicPoolErrorJson {
  name: 'MusicPoolError';
  field: string;
  reason: string;
  remediation: string;
}

/**
 * Thrown by `loadMusicPool` when `remotion/assets/music/index.json` is
 * absent, not valid JSON, fails zod schema validation, or declares a file
 * that is not present on disk. Single-line message format
 * `music pool: <field>: <reason>. <remediation>` mirrors `ManifestError`.
 */
export class MusicPoolError extends Error {
  public readonly field: string;
  public readonly reason: string;
  public readonly remediation: string;

  constructor(input: MusicPoolErrorInput) {
    super(`music pool: ${input.field}: ${input.reason}. ${input.remediation}`);
    this.name = 'MusicPoolError';
    this.field = input.field;
    this.reason = input.reason;
    this.remediation = input.remediation;
    Object.setPrototypeOf(this, MusicPoolError.prototype);
  }

  toJSON(): MusicPoolErrorJson {
    return {
      name: 'MusicPoolError',
      field: this.field,
      reason: this.reason,
      remediation: this.remediation,
    };
  }
}

/** Inputs to {@link MusicPickError}. */
export interface MusicPickErrorInput {
  /** Short reason why track selection failed. */
  reason: string;
  /** Operator-facing remediation hint. */
  remediation: string;
}

/** Serialised representation of {@link MusicPickError} for structured logging. */
export interface MusicPickErrorJson {
  name: 'MusicPickError';
  reason: string;
  remediation: string;
}

/**
 * Thrown by `pickTrack` when the music pool is empty and no track can be
 * selected. Single-line message format `music pick: <reason>. <remediation>`.
 */
export class MusicPickError extends Error {
  public readonly reason: string;
  public readonly remediation: string;

  constructor(input: MusicPickErrorInput) {
    super(`music pick: ${input.reason}. ${input.remediation}`);
    this.name = 'MusicPickError';
    this.reason = input.reason;
    this.remediation = input.remediation;
    Object.setPrototypeOf(this, MusicPickError.prototype);
  }

  toJSON(): MusicPickErrorJson {
    return {
      name: 'MusicPickError',
      reason: this.reason,
      remediation: this.remediation,
    };
  }
}

// ---------------------------------------------------------------------------
// Render subsystem errors (Plan 02-04)
// ---------------------------------------------------------------------------

/** Inputs to {@link RenderError}. */
export interface RenderErrorInput {
  /**
   * Dotted field path or context label that failed
   * (e.g. `'manifestPath'`, `'remotion'`, `'manifestHash'`).
   */
  field: string;
  /** Short reason for the failure. */
  reason: string;
  /** Operator-facing remediation hint. */
  remediation: string;
}

/** Serialised representation of {@link RenderError} for structured logging. */
export interface RenderErrorJson {
  name: 'RenderError';
  field: string;
  reason: string;
  remediation: string;
}

/**
 * Thrown by `runRender` for:
 *   - missing manifest (operator must run `golazo prepare` first)
 *   - Remotion bundle / renderMedia / renderStill failures
 *   - manifestHash invariant violations (render block changed the top-level hash)
 *
 * Single-line message format `render: <field>: <reason>. <remediation>` mirrors
 * `ManifestError` for stylistic consistency across pipeline error classes.
 */
export class RenderError extends Error {
  public readonly field: string;
  public readonly reason: string;
  public readonly remediation: string;

  constructor(input: RenderErrorInput) {
    super(`render: ${input.field}: ${input.reason}. ${input.remediation}`);
    this.name = 'RenderError';
    this.field = input.field;
    this.reason = input.reason;
    this.remediation = input.remediation;
    Object.setPrototypeOf(this, RenderError.prototype);
  }

  toJSON(): RenderErrorJson {
    return {
      name: 'RenderError',
      field: this.field,
      reason: this.reason,
      remediation: this.remediation,
    };
  }
}
