/**
 * Single-attempt YouTube episode uploader for the golazo publish pipeline.
 *
 * Exports:
 *   uploadEpisode(args) — one videos.insert + one thumbnails.set; no retry;
 *     no quota detection (those live in Plan 03-04's withRetry wrapper).
 *     Returns PublishRecord on success. Throws UploadError for shape failures
 *     (missing file, missing videoId in response) or GaxiosError for HTTP
 *     failures (Plan 03-04 classifies those).
 *
 *   PRIVACY_STATUS — typed defense-in-depth constant. See JSDoc below.
 *   DEFAULT_YOUTUBE_CATEGORY_ID — Sports category id.
 *
 * UPLOAD PROTOCOL NOTE:
 *   The googleapis SDK (googleapis-common apirequest.js) uses
 *   uploadType=multipart (NOT resumable) when both requestBody and media.body
 *   are provided. The plan documented resumable, but the SDK's actual
 *   implementation in apirequest.js sets uploadType=multipart for the
 *   stream+requestBody combination. This is functionally equivalent for
 *   golazo's upload sizes (~100 MB typical); resumable retry-on-network-drop
 *   is handled by Plan 03-04's wrapper at the GaxiosError retry level.
 *   See 03-03-SUMMARY.md for the full deviation log.
 *
 * LOGGING DISCIPLINE:
 *   This file is intentionally write-silent to stdout/stderr. Logging is the
 *   CLI handler's responsibility (Plan 03-05). A grep gate in the plan's
 *   verify step enforces no write calls in this file at CI time.
 */

import { createReadStream, existsSync } from 'node:fs';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

import { renderTemplates } from './templates.js';
import { UploadError } from './errors.js';
import type { ChannelConfig } from '../config/types.js';
import type { Manifest } from '../prepare/manifest.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * YouTube Data API category id for 'Sports'.
 * Reference: https://developers.google.com/youtube/v3/docs/videoCategories/list
 * Override this via a future arg if the operator needs a different category.
 */
export const DEFAULT_YOUTUBE_CATEGORY_ID = '17';

/**
 * Defense-in-depth: the single typed constant that pins the unlisted-only
 * privacy literal across the publish pipeline.
 *
 * The bare string 'unlisted' MUST NOT appear outside this declaration; every
 * consumer (videos.insert requestBody, the returned PublishRecord.privacyStatus
 * field, and Plan 03-05's publishRecord schema's cross-module binding)
 * references PRIVACY_STATUS by name. If a future refactor needs to change the
 * privacy literal (the project policy forbids this), every consumer fails the
 * typecheck in lockstep — defense-in-depth at the module boundary.
 *
 * Plan 03-05's publishRecord.ts imports this for a compile-time
 * `'unlisted' satisfies typeof PRIVACY_STATUS` binding so any future drift
 * fails the typecheck before runtime.
 */
export const PRIVACY_STATUS = 'unlisted' as const;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Arguments for {@link uploadEpisode}. All paths must be absolute.
 */
export interface UploadEpisodeArgs {
  /** Authorized OAuth2Client from Plan 03-01's loadToken(channelConfig). */
  client: OAuth2Client;
  /** Channel config from Plan 01-02's loadChannel(kid). */
  channel: ChannelConfig;
  /** Manifest from Plan 01-05's readManifest(folderPath). */
  manifest: Manifest;
  /** Absolute path to .golazo/episode.mp4 (already exists on disk per Plan 02-04). */
  episodePath: string;
  /** Absolute path to .golazo/thumb.png. */
  thumbnailPath: string;
  /**
   * Optional clock injection for deterministic uploadedAt timestamps in tests.
   * Defaults to `() => new Date()`. The returned Date's toISOString() is
   * recorded BEFORE the API calls so retries (Plan 03-04) do not shift the
   * timestamp — operator sees "when did you start the upload?" not "when did
   * the third retry succeed?".
   */
  clock?: () => Date;
}

/**
 * The shape Plan 03-05 writes to `<folder>/.golazo/publish.json`.
 *
 * privacyStatus is typed as `typeof PRIVACY_STATUS` (the literal type
 * `'unlisted'`) — bound to the PRIVACY_STATUS constant, NOT a bare 'unlisted'
 * literal. This makes the constant load-bearing at the type level: if a future
 * refactor changes PRIVACY_STATUS, the PublishRecord type changes in lockstep.
 */
export interface PublishRecord {
  videoId: string;
  watchUrl: string; // 'https://youtu.be/' + videoId
  uploadedAt: string; // ISO 8601 UTC
  channelId: string; // from channel.youtube.channelId
  privacyStatus: typeof PRIVACY_STATUS; // literal type 'unlisted' — bound to PRIVACY_STATUS
}

// ---------------------------------------------------------------------------
// uploadEpisode
// ---------------------------------------------------------------------------

/**
 * Perform ONE videos.insert + ONE thumbnails.set against the YouTube Data
 * API v3. Returns the PublishRecord on success. Throws:
 *
 * - UploadError — shape failures: missing file on disk, missing videoId in
 *   YouTube response. These are NOT helped by a retry.
 * - GaxiosError — HTTP failures (5xx, 403 quotaExceeded, network error).
 *   These are intentionally NOT caught here — Plan 03-04's withRetry wrapper
 *   catches them and classifies by status code (5xx → retry, 403 quota →
 *   fail-loudly with "rerun tomorrow", network drop → resume).
 *
 * Algorithm (8 steps — pinned for Plan 03-04's wrapper to consume):
 *
 * 1. Validate args: existsSync(episodePath) and existsSync(thumbnailPath);
 *    else throw UploadError.
 * 2. Render title + description via renderTemplates({ kid, game }).
 * 3. Build youtube SDK client via google.youtube({ version: 'v3', auth: client }).
 * 4. Sample clock BEFORE API calls: uploadedAt = clock().toISOString().
 * 5. Call youtube.videos.insert({ part, requestBody, media }) — SDK uses
 *    uploadType=multipart for stream+requestBody combination.
 * 6. Validate response: throw UploadError if response.data.id is absent.
 * 7. Call youtube.thumbnails.set({ videoId, media }) — let errors bubble.
 * 8. Return PublishRecord.
 */
export async function uploadEpisode(args: UploadEpisodeArgs): Promise<PublishRecord> {
  // Step 1: Validate file existence BEFORE constructing the SDK client —
  // saves a network round-trip on dev-machine typos.
  if (!existsSync(args.episodePath)) {
    throw new UploadError({
      field: 'episodePath',
      reason: `file not found at ${args.episodePath}`,
      remediation: "run 'golazo render <folder>' first",
    });
  }
  if (!existsSync(args.thumbnailPath)) {
    throw new UploadError({
      field: 'thumbnailPath',
      reason: `file not found at ${args.thumbnailPath}`,
      remediation: "run 'golazo render <folder>' first",
    });
  }

  // Step 2: Render title + description.
  // Pass only the fields renderTemplates needs (self-documenting call site).
  const { title, description } = renderTemplates({
    kid: {
      name: args.channel.name,
      club: args.channel.club,
      jersey: args.channel.jersey,
      source: args.channel.source,
    },
    game: args.manifest.game,
  });

  // Step 3: Build youtube SDK client.
  const youtube = google.youtube({ version: 'v3', auth: args.client });

  // Step 4: Sample clock BEFORE API calls.
  const clock = args.clock ?? (() => new Date());
  const uploadedAt = clock().toISOString();

  // Step 5: Call videos.insert.
  // The googleapis SDK uses uploadType=multipart (single POST) when both
  // requestBody and media.body are provided — see module JSDoc for full note.
  // selfDeclaredMadeForKids: false — YouTube COPPA compliance requires this
  // field. The videos are NOT directed at children as audience members (they
  // are for family/teammates/recruiters); the unlisted-only constraint + small
  // audience channel framing supports false. See SUMMARY for operator callout.
  const insertResponse = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description,
        categoryId: DEFAULT_YOUTUBE_CATEGORY_ID,
      },
      status: {
        privacyStatus: PRIVACY_STATUS,
        selfDeclaredMadeForKids: false,
      },
    },
    media: { mimeType: 'video/mp4', body: createReadStream(args.episodePath) },
  });

  // Step 6: Validate the videoId.
  const videoId = insertResponse.data.id ?? null;
  if (!videoId) {
    throw new UploadError({
      field: 'videoId',
      reason: 'YouTube videos.insert response missing id',
      remediation:
        'inspect response; channel may be misconfigured or upload was rejected upstream',
    });
  }

  // Step 7: Attach thumbnail. Let any error bubble — Plan 03-04 decides retry.
  await youtube.thumbnails.set({
    videoId,
    media: { mimeType: 'image/png', body: createReadStream(args.thumbnailPath) },
  });

  // Step 8: Return PublishRecord.
  // Use PRIVACY_STATUS in the returned record, NOT a bare 'unlisted' literal —
  // the TypeScript type typeof PRIVACY_STATUS narrows this to the literal
  // 'unlisted' but anchors it to a single declaration.
  return {
    videoId,
    watchUrl: `https://youtu.be/${videoId}`,
    uploadedAt,
    channelId: args.channel.youtube.channelId,
    privacyStatus: PRIVACY_STATUS,
  };
}
