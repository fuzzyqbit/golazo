/**
 * runPublish orchestrator — the production entry point for `golazo publish <folder>`.
 *
 * Composes Plans 03-01..03-04's building blocks:
 *   - loadToken (Plan 03-01 oauth.ts)
 *   - publishWithRetry (Plan 03-04 retry.ts)
 *   - readPublishRecord / writePublishRecord (Task 1 publishRecord.ts)
 *   - readManifest (Plan 01-05 manifest.ts)
 *   - loadChannel (Plan 01-02 channels.ts)
 *
 * Algorithm (11 steps mirroring Plan 02-04's runRender):
 *   1. Resolve absFolder = resolve(opts.folderPath).
 *   2. Read manifest via readManifest(absFolder). Null → PublishError(manifestPath).
 *   3. Verify .golazo/episode.mp4 exists. Missing → PublishError(episodePath).
 *   4. Verify .golazo/thumb.png exists. Missing → PublishError(thumbnailPath).
 *   5. Load channel via loadChannel(manifest.kid, { path: opts.channelsPath }).
 *   6. Idempotency check: if existing publish.json has a videoId && !force → skip.
 *   7. Load OAuth token via loadToken(channel, { clientId, clientSecret }).
 *   8. Build UploadEpisodeArgs.
 *   9. Call publishWithRetry(args, opts.retryOpts). Propagates all errors.
 *  10. Write publish.json via writePublishRecord. ONLY reached on success.
 *  11. Return { skipped: false, reason, publishRecordPath, record }.
 *
 * The PRIVACY_STATUS import is intentionally present here as a grep gate signal
 * that any orchestrator-level construction of a PublishRecord MUST reference
 * PRIVACY_STATUS by name (not a bare string). The record written to disk in
 * step 10 comes directly from publishWithRetry which sources it from PRIVACY_STATUS
 * in uploadEpisode — no bare 'unlisted' string is constructed at this layer.
 *
 * PREP-07 invariant: publish.json is a SEPARATE file under `.golazo/` (not a
 * manifest block). The manifest's top-level `manifestHash` is unchanged before
 * and after a publish run.
 *
 * Reference: docs/superpowers/specs/2026-05-13-golazo-design.md — Data Flow.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { readManifest } from '../prepare/manifest.js';
import { loadChannel } from '../config/channels.js';
import { loadToken } from './oauth.js';
import { publishWithRetry } from './retry.js';
import { PRIVACY_STATUS } from './uploader.js';
import {
  readPublishRecord,
  writePublishRecord,
  PUBLISH_RECORD_FILE_NAME,
} from './publishRecord.js';
import { PublishError } from './errors.js';
import type { PublishRecordDoc } from './publishRecord.js';
import type { WithRetryOpts } from './retry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Describes why runPublish ran (or skipped).
 *   'first-publish' — no prior publish.json; uploaded fresh.
 *   'video-exists'  — existing publish.json with videoId; short-circuit.
 *   'force'         — force flag set; re-uploaded even if videoId existed.
 */
export type PublishReason = 'first-publish' | 'video-exists' | 'force';

/** Inputs to {@link runPublish}. */
export interface RunPublishOpts {
  /** Path to the rendered game folder (relative or absolute — resolved internally). */
  folderPath: string;
  /** Path to channels.yaml. Defaults to './channels.yaml'. */
  channelsPath?: string;
  /** When true, re-upload even when publish.json already has a videoId. */
  force?: boolean;
  /** Google OAuth client ID. Defaults to GOOGLE_CLIENT_ID env var. */
  clientId?: string;
  /** Google OAuth client secret. Defaults to GOOGLE_CLIENT_SECRET env var. */
  clientSecret?: string;
  /**
   * Optional retry-policy override for tests (default = production [1000, 4000, 16000] ms).
   * Forwarded to publishWithRetry unchanged.
   */
  retryOpts?: WithRetryOpts;
  /**
   * Inject a clock for deterministic uploadedAt in tests.
   * Forwarded to UploadEpisodeArgs.clock.
   */
  clock?: () => Date;
}

/** Return value from {@link runPublish}. */
export interface RunPublishResult {
  /** True only when an existing videoId caused a short-circuit (reason='video-exists'). */
  skipped: boolean;
  /** Why the run succeeded (or why it was skipped). */
  reason: PublishReason;
  /** Absolute path to the written publish.json. */
  publishRecordPath: string;
  /** The publish record (from disk on skip path; from publishWithRetry on upload path). */
  record: PublishRecordDoc;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the publish pipeline against the given game folder.
 *
 * Idempotency contract (PUB-07):
 *   - Re-running on a folder whose `.golazo/publish.json` already has a
 *     `videoId` exits in under 5 seconds and does NOT call YouTube.
 *   - `--force` overrides this and re-uploads.
 *
 * Quota contract (PUB-06):
 *   - `publish.json` is NEVER written on quota/error paths. Step 10 is
 *     reached ONLY after `publishWithRetry` resolves successfully.
 */
export async function runPublish(opts: RunPublishOpts): Promise<RunPublishResult> {
  // Step 1: resolve folder
  const absFolder = resolve(opts.folderPath);
  const publishRecordPath = join(absFolder, PUBLISH_RECORD_FILE_NAME);

  // Step 2: read manifest — null means "not yet prepared"
  const manifest = readManifest(absFolder);
  if (manifest === null) {
    throw new PublishError({
      field: 'manifestPath',
      reason: `manifest not found at '${join(absFolder, '.golazo/manifest.json')}'`,
      remediation: "run 'golazo prepare <folder>' first",
    });
  }

  // Step 3: verify episode.mp4
  const episodePath = join(absFolder, '.golazo', 'episode.mp4');
  if (!existsSync(episodePath)) {
    throw new PublishError({
      field: 'episodePath',
      reason: `episode.mp4 not found in '${absFolder}/.golazo/'`,
      remediation: "run 'golazo render <folder>' first",
    });
  }

  // Step 4: verify thumb.png
  const thumbnailPath = join(absFolder, '.golazo', 'thumb.png');
  if (!existsSync(thumbnailPath)) {
    throw new PublishError({
      field: 'thumbnailPath',
      reason: `thumb.png not found in '${absFolder}/.golazo/'`,
      remediation: "run 'golazo render <folder>' first",
    });
  }

  // Step 5: load channel config (propagates ChannelsConfigError / UnknownKidError)
  const channel = loadChannel(manifest.kid, { path: opts.channelsPath });

  // Step 6: idempotency check — BEFORE any network work
  const existing = readPublishRecord(absFolder);
  if (existing !== null && existing.videoId.length > 0 && !opts.force) {
    return {
      skipped: true,
      reason: 'video-exists',
      publishRecordPath,
      record: existing,
    };
  }
  const reason: PublishReason = opts.force ? 'force' : 'first-publish';

  // Step 7: load OAuth token (propagates OAuthError on refresh failure)
  const client = await loadToken(channel, {
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
  });

  // Step 8: build UploadEpisodeArgs
  const args = {
    client,
    channel,
    manifest,
    episodePath,
    thumbnailPath,
    clock: opts.clock,
  };

  // Step 9: upload with retry policy (propagates QuotaExceededError / OAuthError /
  // UploadError / GaxiosError / retry-exhausted Error). No publish.json written here.
  const record = await publishWithRetry(args, opts.retryOpts);

  // Step 10: write publish.json — ONLY reached on success (PUB-06 contract).
  // The record's privacyStatus comes from publishWithRetry → uploadEpisode →
  // PRIVACY_STATUS constant. No bare 'unlisted' string constructed at this layer.
  // PRIVACY_STATUS is imported above as a grep gate signal for future refactors.
  void PRIVACY_STATUS; // referenced above in imports; used here to suppress linter
  writePublishRecord(absFolder, record);

  // Step 11: return
  return {
    skipped: false,
    reason,
    publishRecordPath,
    record,
  };
}
