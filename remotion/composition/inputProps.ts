/**
 * Zod schemas for the inputProps that Episode.tsx and Thumbnail.tsx receive.
 *
 * These schemas are a narrow projection of the Manifest type (Phase 1) plus:
 *   - `clips[].absPath`  — resolved absolute filesystem path (provided by the
 *                          render driver in Plan 02-04 via `path.resolve(folderPath, clip.file)`)
 *   - `music.absPath`    — resolved absolute filesystem path for the music track
 *   - `music.strategy`   — the MusicPickStrategy from Plan 02-02's picker
 *
 * The `game.opponent` field is a PRETTY-PRINTED name (e.g. 'United', 'City SC'),
 * NOT the raw filename slug. Plan 02-04's driver derives it from
 * `manifest.game.opponent` using a minimal local pretty-print helper
 * (title-case + hyphen-to-space + acronym allow-list [sc, fc, ac]).
 * Phase 3 (PUB-03) will consolidate the helper; Plan 02-04 implements it inline.
 *
 * No tests in this file — the schema is exercised by Task 2's composition
 * rendering and Plan 02-04's bundle end-to-end test.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Per-clip input
// ---------------------------------------------------------------------------

/**
 * Single clip descriptor as the render driver passes it to the composition.
 * `absPath` is added by the driver — it is NOT in the Manifest clip entry.
 */
export const clipInputSchema = z.object({
  file: z.string(),
  absPath: z.string(),
  durationSec: z.number().positive(),
});

// ---------------------------------------------------------------------------
// Episode inputProps schema
// ---------------------------------------------------------------------------

/**
 * Full inputProps schema for the Episode composition.
 *
 * Consumed by:
 *   - `remotion/Root.tsx` as the `schema` prop on the Episode <Composition>
 *   - Plan 02-04's render driver to validate before calling `renderMedia`
 */
export const episodeInputPropsSchema = z.object({
  kid: z.object({
    name: z.string().min(1),
    club: z.string().min(1),
    jersey: z.number().int().min(1).max(99),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  game: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Pretty-printed opponent name (title-case; Plan 02-04 derives it from the manifest slug). */
    opponent: z.string().min(1),
    scoreFor: z.number().int().min(0),
    scoreAgainst: z.number().int().min(0),
    result: z.enum(['W', 'L', 'D']),
  }),
  clips: z.array(clipInputSchema).min(1),
  music: z.object({
    /** Resolved absolute filesystem path to the music track. */
    absPath: z.string(),
    durationSec: z.number().positive(),
    strategy: z.enum(['trim-fade', 'reroll', 'crossfade']),
  }),
});

/** Inferred TypeScript type for Episode inputProps. */
export type EpisodeInputProps = z.infer<typeof episodeInputPropsSchema>;

// ---------------------------------------------------------------------------
// Thumbnail inputProps schema
// ---------------------------------------------------------------------------

/**
 * InputProps schema for the Thumbnail composition (kid + game only).
 * Shares sub-schemas with `episodeInputPropsSchema` for consistency.
 */
export const thumbnailInputPropsSchema = z.object({
  kid: episodeInputPropsSchema.shape.kid,
  game: episodeInputPropsSchema.shape.game,
});

/** Inferred TypeScript type for Thumbnail inputProps. */
export type ThumbnailInputProps = z.infer<typeof thumbnailInputPropsSchema>;
