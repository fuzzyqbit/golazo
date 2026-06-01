/**
 * WarningBag — in-memory accumulator for non-fatal scanner anomalies.
 *
 * Implements the DISC-05 contract: folders whose basename fails parseFilename
 * surface here (not as silent skips, not as thrown errors). Invalid manifests
 * and invalid publish records likewise accumulate here so the scanner can
 * return all valid episodes while surfacing every anomaly to the caller.
 *
 * **In-memory-only contract (D-20):** WarningBag is never persisted. Plan 04
 * stores the latest bag as a module-level variable on the cache singleton and
 * exposes it via a future Phase 7 dev banner. sqlite contains only EpisodeIndex
 * rows.
 *
 * Instances are plain value objects — no class, no methods. Plan 04 treats them
 * as transient and never serialises them to sqlite.
 */

/** Warning emitted when a game folder basename fails parseFilename. */
export interface BrokenFolderWarning {
  /** Absolute path to the folder whose basename failed parseFilename. */
  absPath: string;
  /** Single-line reason from FilenameError.message or a fallback string. */
  reason: string;
}

/** Warning emitted when manifest.json exists but fails JSON parse or schema validation. */
export interface InvalidManifestWarning {
  /** Absolute path to the game folder containing the invalid manifest. */
  absPath: string;
  /**
   * Zod issue.path joined with '.' + ': ' + issue.message, or JSON-parse
   * error message. Always a single human-readable line.
   */
  reason: string;
}

/** Warning emitted when publish.json exists but fails JSON parse or schema validation. */
export interface InvalidPublishWarning {
  /** Absolute path to the game folder containing the invalid publish record. */
  absPath: string;
  /** Zod issue path + message, or JSON-parse error. */
  reason: string;
}

/**
 * Accumulator for all non-fatal scanner anomalies.
 *
 * All three arrays are mutable — the scanner pushes into them during the walk.
 * Callers (Plan 04 cache singleton) may read them after scanGolazoRoot returns.
 */
export interface WarningBag {
  brokenFolders: BrokenFolderWarning[];
  invalidManifests: InvalidManifestWarning[];
  invalidPublishRecords: InvalidPublishWarning[];
}

/**
 * Create an empty WarningBag. Each call returns a new independent instance —
 * no module-level singleton.
 */
export function createWarningBag(): WarningBag {
  return {
    brokenFolders: [],
    invalidManifests: [],
    invalidPublishRecords: [],
  };
}
