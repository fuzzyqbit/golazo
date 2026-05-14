/**
 * On-disk contract for `.golazo/publish.json`.
 *
 * Mirrors Plan 01-05's `manifest.ts` schema + builder + reader + writer pattern
 * line-for-line. Zod validates on both write (via `writePublishRecord`'s
 * defensive `.parse`) and read (via `readPublishRecord`'s `safeParse`) so
 * malformed publish records never silently propagate through the pipeline.
 *
 * **Privacy constraint (load-bearing for the project's unlisted-only policy):**
 * `privacyStatus: z.literal('unlisted')` enforces that ONLY 'unlisted' is a
 * valid value at the schema boundary. Case 6 in publishRecord.test.ts explicitly
 * verifies that a 'public' record fails `.parse()`.
 *
 * The `_PrivacyStatusBinding` type alias below forms a compile-time bridge
 * between this schema literal and Plan 03-03's `PRIVACY_STATUS = 'unlisted'
 * as const` constant. If PRIVACY_STATUS ever drifts (e.g. someone changes it
 * to 'public' in uploader.ts), the `satisfies typeof PRIVACY_STATUS` assertion
 * fails the build before any runtime path is reached.
 *
 * **PREP-07 invariant:** publish.json is a SEPARATE file under `.golazo/`
 * (NOT a block inside manifest.json). The manifest's top-level `manifestHash`
 * is unchanged before and after publish.
 *
 * Reference: docs/superpowers/specs/2026-05-13-golazo-design.md — Data Flow >
 * publish.json schema.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { PublishError } from './errors.js';
import { PRIVACY_STATUS } from './uploader.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Path-relative location of the publish record under a game folder. */
export const PUBLISH_RECORD_FILE_NAME = '.golazo/publish.json';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for the publish record stored at `.golazo/publish.json`.
 *
 * Fields mirror the `PublishRecord` interface from `uploader.ts` exactly —
 * the orchestrator (runner.ts) passes the `publishWithRetry` return value
 * through `writePublishRecord` which validates via this schema before writing.
 *
 * `privacyStatus: z.literal('unlisted')` is the runtime gate for the
 * project's unlisted-only constraint (CLAUDE.md: "every upload is unlisted").
 * The bare `'unlisted'` string is kept here (not `z.literal(PRIVACY_STATUS)`)
 * so the verify grep gate `grep -q "z.literal\\('unlisted'\\)"` can surface
 * the literal in source. The `_PrivacyStatusBinding` line below provides the
 * cross-module compile-time link.
 */
export const publishRecordSchema = z.object({
  /** YouTube video ID (non-empty string). */
  videoId: z.string().min(1),
  /** Short watch URL in canonical https://youtu.be/<id> form. */
  watchUrl: z.string().regex(/^https:\/\/youtu\.be\//),
  /** ISO 8601 UTC timestamp — sampled BEFORE the videos.insert call (Plan 03-03). */
  uploadedAt: z.string().datetime(),
  /** YouTube channel ID — always starts with 'UC'. */
  channelId: z.string().regex(/^UC/),
  /**
   * Privacy status — MUST be 'unlisted'. This is the hard gate for the
   * project's unlisted-only publishing constraint (CLAUDE.md + design spec).
   * Even if a bug in uploadEpisode produced a 'public' record, this literal
   * check blocks it at the schema boundary before the record is written to disk.
   */
  privacyStatus: z.literal('unlisted'),
});

/**
 * Compile-time bridge between the schema literal and Plan 03-03's `PRIVACY_STATUS`
 * constant (exported from `uploader.ts` as `'unlisted' as const`).
 *
 * If `PRIVACY_STATUS` ever changes from `'unlisted'`, the `satisfies` assertion
 * fails `npx tsc --noEmit -p tsconfig.check.json` immediately — before any test
 * or runtime path is reached. This prevents both the schema literal and the
 * uploader constant from drifting independently without a single-point typecheck.
 *
 * Rationale for using `satisfies` rather than `z.literal(PRIVACY_STATUS)`:
 * keeping the bare `'unlisted'` in the zod call means the source-level grep gate
 * can confirm the literal is present as a human-readable string. The `satisfies`
 * line provides the cross-module compile-time link without obscuring the literal.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _privacyStatusBinding = 'unlisted' satisfies typeof PRIVACY_STATUS;

/** Inferred TypeScript type of a valid publish record document. */
export type PublishRecordDoc = z.infer<typeof publishRecordSchema>;

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Write a publish record to `<folderPath>/.golazo/publish.json`.
 *
 * Validates `record` via `publishRecordSchema.parse` BEFORE writing — same
 * defensive pattern as `buildManifest` in Plan 01-05. Creates `.golazo/` if
 * missing. Emits pretty-printed JSON (2-space indent) with a trailing newline.
 *
 * If `record.privacyStatus` is not `'unlisted'`, the `.parse()` throws a
 * `ZodError` before any file I/O occurs — enforcing the unlisted-only
 * constraint at the write boundary.
 */
export function writePublishRecord(folderPath: string, record: PublishRecordDoc): void {
  const parsed = publishRecordSchema.parse(record);
  const dir = join(folderPath, '.golazo');
  mkdirSync(dir, { recursive: true });
  const file = join(folderPath, PUBLISH_RECORD_FILE_NAME);
  writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/**
 * Read + zod-validate the publish record at `<folderPath>/.golazo/publish.json`.
 *
 * Returns `null` when the file does not exist (so the orchestrator can treat
 * absence as "first publish"). Throws {@link PublishError} when the file exists
 * but cannot be JSON-parsed or fails schema validation — the error message
 * instructs the operator to delete the corrupt record and rerun `golazo publish`.
 *
 * Mirrors `readManifest` from Plan 01-05 line-for-line.
 */
export function readPublishRecord(folderPath: string): PublishRecordDoc | null {
  const file = join(folderPath, PUBLISH_RECORD_FILE_NAME);
  if (!existsSync(file)) return null;

  const raw = readFileSync(file, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PublishError({
      field: '(json)',
      reason: `failed to parse '${file}': ${msg}`,
      remediation: `delete '${file}' and rerun 'golazo publish'`,
    });
  }

  const result = publishRecordSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field =
      issue && issue.path.length > 0
        ? issue.path.map((segment) => String(segment)).join('.')
        : '(root)';
    const reason = issue?.message ?? 'failed schema validation';
    throw new PublishError({
      field,
      reason: `${reason} (in '${file}')`,
      remediation: `delete '${file}' and rerun 'golazo publish'`,
    });
  }
  return result.data;
}
