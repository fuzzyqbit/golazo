/**
 * Manifest schema + builder + reader + writer (PREP-07 output half).
 *
 * The manifest is the durable on-disk contract that downstream phases
 * consume: Phase 2's render driver reads the clip list + `manifestHash`
 * to decide whether to re-render; Phase 3's publish client reads the
 * game metadata for the title/description templates. Schema is
 * zod-validated on both write (via `buildManifest`'s final `.parse`) and
 * read (via `readManifest`'s `safeParse`) so malformed manifests never
 * silently propagate through the pipeline.
 *
 * **Architectural note — manifestHash placement (load-bearing for Phase 2):**
 * `manifestHash` lives at the TOP LEVEL of the manifest, NOT nested inside
 * a `render` sub-block. The design spec
 * (`docs/superpowers/specs/2026-05-13-golazo-design.md`) sketches a nested
 * layout that contradicts the Phase 1 idempotency contract — the hash
 * MUST exist before any render runs (Phase 1 emits it; Phase 2's render
 * driver consumes it to decide whether to re-render). Phase 2 WILL add a
 * sibling `render: { episodePath, thumbnailPath, renderedAt }` block
 * alongside `manifestHash` once the render pipeline lands, but MUST NOT
 * relocate `manifestHash` into it. Plan 04 + Plan 05 SUMMARYs explain
 * the rationale in full.
 *
 * **Additive deviation from design spec:** per-clip `sha256` is exposed
 * in the JSON so the hash is reproducible from manifest contents alone.
 * Phase 2 + Phase 3 MUST preserve this field — see Plan 04 SUMMARY for
 * the full justification.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { ManifestError } from './errors.js';
import { computeManifestHash } from './hash.js';
import type { GameMeta } from './types.js';

/** Current manifest schema version. Bumped on any breaking change. */
export const MANIFEST_SCHEMA_VERSION = 1 as const;

/** Path-relative location of the manifest under a game folder. */
export const MANIFEST_FILE_NAME = '.golazo/manifest.json';

/**
 * Per-clip entry. File name is the canonical `NN-<name>.mp4` form (see
 * Plan 04's `CLIP_FILENAME_REGEX`), duration is in seconds (3-decimal
 * rounded per `probeDuration`), and sha256 is the lowercase 64-char hex
 * digest of the file bytes (no `sha256:` prefix — the prefix only
 * appears on the top-level `manifestHash`).
 */
const clipEntrySchema = z.object({
  file: z.string().regex(/^\d{2,}-.+\.mp4$/),
  durationSec: z.number().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * Top-level manifest schema. Mirrors the contract Phase 2+3 consume.
 *
 * `manifestHash` deliberately sits at the top level, NOT inside a `render`
 * sub-block — Phase 1 emits the hash so Phase 2 can read it back BEFORE
 * any render runs. Phase 2 will add a sibling `render` block; it MUST NOT
 * move `manifestHash` into it.
 */
export const manifestSchema = z.object({
  version: z.literal(1),
  kid: z.string().min(1),
  game: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    opponent: z.string().min(1),
    scoreFor: z.number().int().min(0),
    scoreAgainst: z.number().int().min(0),
    result: z.enum(['W', 'L', 'D']),
  }),
  clips: z.array(clipEntrySchema).min(1),
  totalDurationSec: z.number().positive(),
  // Top-level — see module JSDoc.
  manifestHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

/** Statically-typed manifest shape (inferred from {@link manifestSchema}). */
export type Manifest = z.infer<typeof manifestSchema>;

/** Inputs to {@link buildManifest}. */
export interface BuildManifestInput {
  /** Just the basename of the game folder (used for manifestHash + game block reconstruction); NOT an absolute path. */
  folderName: string;
  /** Kid key as declared in channels.yaml. */
  kid: string;
  /** Parsed game metadata (date, opponent, scores, result). */
  gameMeta: GameMeta;
  /** Per-clip records produced by Plan 04's discoverClips + probeDuration + computeClipSha256. */
  clips: { file: string; durationSec: number; sha256: string }[];
}

/**
 * Sum the durations and round to 3 decimals so the manifest field is
 * JSON-stable across re-probes — matches `probeDuration`'s rounding so
 * `totalDurationSec` is always exactly the sum of `clips[i].durationSec`
 * with no last-bit float drift.
 */
function sumDurations(clips: readonly { durationSec: number }[]): number {
  const raw = clips.reduce((sum, c) => sum + c.durationSec, 0);
  return Math.round(raw * 1000) / 1000;
}

/**
 * Compose a {@link Manifest} from parsed inputs. Validates the result via
 * `manifestSchema.parse` so any contract drift surfaces immediately as a
 * {@link ManifestError}. Throws {@link ManifestError} if `clips` is empty
 * (caught before zod for a clearer remediation message).
 */
export function buildManifest(input: BuildManifestInput): Manifest {
  if (input.clips.length === 0) {
    throw new ManifestError({
      field: 'clips',
      reason: 'must contain at least one clip',
      remediation: 'add NN-*.mp4 files to the folder',
    });
  }

  const manifestHash = computeManifestHash(
    input.folderName,
    input.clips.map((c) => ({ file: c.file, sha256: c.sha256 })),
  );

  const candidate = {
    version: MANIFEST_SCHEMA_VERSION,
    kid: input.kid,
    game: {
      date: input.gameMeta.date,
      opponent: input.gameMeta.opponent,
      scoreFor: input.gameMeta.scoreFor,
      scoreAgainst: input.gameMeta.scoreAgainst,
      result: input.gameMeta.result,
    },
    clips: input.clips.map((c) => ({
      file: c.file,
      durationSec: c.durationSec,
      sha256: c.sha256,
    })),
    totalDurationSec: sumDurations(input.clips),
    manifestHash,
  };

  const result = manifestSchema.safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field =
      issue && issue.path.length > 0
        ? issue.path.map((segment) => String(segment)).join('.')
        : '(root)';
    const reason = issue?.message ?? 'failed schema validation';
    throw new ManifestError({
      field,
      reason,
      remediation: 'check the inputs to buildManifest and rerun',
    });
  }
  return result.data;
}

/**
 * Write a manifest to `<folderPath>/.golazo/manifest.json`. Creates the
 * `.golazo/` directory if missing. Emits pretty-printed JSON (2-space
 * indent) with a trailing newline so diffs are readable and the file is
 * well-formed text by Unix conventions.
 */
export function writeManifest(folderPath: string, manifest: Manifest): void {
  const dir = join(folderPath, '.golazo');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const file = join(folderPath, MANIFEST_FILE_NAME);
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

/**
 * Read + zod-validate the manifest at `<folderPath>/.golazo/manifest.json`.
 * Returns `null` when the file does not exist (so the orchestrator can
 * treat absence as "first run"). Throws {@link ManifestError} when the
 * file exists but cannot be JSON-parsed or fails schema validation; the
 * error message names the file path and instructs the operator to delete
 * the corrupt manifest and rerun `golazo prepare`.
 */
export function readManifest(folderPath: string): Manifest | null {
  const file = join(folderPath, MANIFEST_FILE_NAME);
  if (!existsSync(file)) return null;

  const raw = readFileSync(file, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ManifestError({
      field: '(json)',
      reason: `failed to parse '${file}': ${msg}`,
      remediation: `delete '${file}' and rerun 'golazo prepare'`,
    });
  }

  const result = manifestSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field =
      issue && issue.path.length > 0
        ? issue.path.map((segment) => String(segment)).join('.')
        : '(root)';
    const reason = issue?.message ?? 'failed schema validation';
    throw new ManifestError({
      field,
      reason: `${reason} (in '${file}')`,
      remediation: `delete '${file}' and rerun 'golazo prepare'`,
    });
  }
  return result.data;
}
