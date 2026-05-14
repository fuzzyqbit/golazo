/**
 * Pure title + description template renderers for the publish pipeline.
 *
 * Both functions are side-effect free: no I/O, no clock reads, no random.
 * Same input → same output on every call (referentially transparent).
 *
 * Template strings use:
 *   U+00B7 MIDDLE DOT  (·) as the section separator in titles
 *   U+2013 EN DASH     (–) as the score separator (between scoreFor and scoreAgainst)
 *
 * These are visual-design decisions from the golazo design spec — they are
 * NOT ASCII period or ASCII hyphen-minus.
 *
 * `prettyOpponent` is IMPORTED from src/render/opponentPretty.ts (Plan 02-04).
 * It is NOT redefined here. Phase 3 PUB-03 reuses the same helper in place.
 */
import { z } from 'zod';
import { prettyOpponent } from '../render/opponentPretty.js';
import { TemplateError } from './errors.js';

// ---------------------------------------------------------------------------
// Template constants (exported for documentation + smoke tests)
// ---------------------------------------------------------------------------

/**
 * Canonical title template string.
 * Placeholders: {Kid}, {Opponent}, {scoreFor}, {scoreAgainst}, {result}, {date}
 * Section separator: U+00B7 MIDDLE DOT
 * Score separator: U+2013 EN DASH
 */
export const TITLE_TEMPLATE =
  '{Kid} · vs {Opponent} · {scoreFor}–{scoreAgainst} {result} · {date}';

/**
 * Canonical description template string (LF line endings).
 * Placeholders: {date}, {Kid}, {jersey}, {club}, {Opponent}, {scoreFor},
 *   {scoreAgainst}, {source}
 */
export const DESCRIPTION_TEMPLATE =
  'Match Day · {date}\n' +
  '{Kid} (#{jersey}, {club}) vs {Opponent}\n' +
  'Final: {scoreFor}–{scoreAgainst}\n' +
  '\n' +
  'Filmed via {source}. Edited with golazo.';

// ---------------------------------------------------------------------------
// Input / Output interfaces
// ---------------------------------------------------------------------------

/**
 * Input shape for the template renderers.
 *
 * `kid` fields come from `ChannelConfig` (channels.yaml loader).
 * `game` fields come from `manifest.game` (prepare pipeline output).
 *
 * The `opponent` field is the RAW slug from the folder name (e.g. 'city-sc').
 * `prettyOpponent` is applied INSIDE the renderers — callers pass the raw slug.
 */
export interface TemplateInput {
  kid: {
    /** Display name, e.g. 'Leo'. Substitutes {Kid}. */
    name: string;
    /** Club name, e.g. 'FC Eagles'. Substitutes {club}. */
    club: string;
    /** Jersey number (1–99). Substitutes {jersey}. */
    jersey: number;
    /** Recording source label, e.g. 'Veo' | 'Trace'. Substitutes {source}. */
    source: string;
  };
  game: {
    /** ISO date string YYYY-MM-DD. Substitutes {date}. */
    date: string;
    /** Hyphen-separated opponent slug from folder name (e.g. 'city-sc'). */
    opponent: string;
    /** Goals scored by the kid's team (>= 0). Substitutes {scoreFor}. */
    scoreFor: number;
    /** Goals scored by the opponent (>= 0). Substitutes {scoreAgainst}. */
    scoreAgainst: number;
    /** Match result from kid's perspective. Substitutes {result}. */
    result: 'W' | 'L' | 'D';
  };
}

/** Output shape returned by {@link renderTemplates}. */
export interface TemplateOutput {
  title: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Defensive runtime schema (zod)
// ---------------------------------------------------------------------------

const templateInputSchema = z.object({
  kid: z.object({
    name: z.string().min(1),
    club: z.string().min(1),
    jersey: z.number().int().min(1).max(99),
    source: z.string().min(1),
  }),
  game: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    opponent: z.string().min(1),
    scoreFor: z.number().int().min(0),
    scoreAgainst: z.number().int().min(0),
    result: z.enum(['W', 'L', 'D']),
  }),
});

/**
 * Validate input at runtime via zod. Throws {@link TemplateError} on the
 * first shape violation. TypeScript catches most violations at compile time;
 * this guard exists for `as any` call sites and future callers that construct
 * the input from untyped sources (e.g. JSON.parse of manifest.json).
 */
function validateInput(input: TemplateInput): TemplateInput {
  const r = templateInputSchema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    const field = issue?.path.map(String).join('.') ?? '(root)';
    throw new TemplateError({
      field,
      reason: issue?.message ?? 'invalid',
      remediation: 'check manifest + channels.yaml',
    });
  }
  return r.data as TemplateInput;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

/**
 * Render the YouTube video title for a game episode.
 *
 * Format: `{Kid} · vs {Opponent} · {scoreFor}–{scoreAgainst} {result} · {date}`
 *
 * Uses U+00B7 MIDDLE DOT between sections and U+2013 EN DASH between scores.
 * `opponent` slug is pretty-printed via {@link prettyOpponent} (imported from
 * src/render/opponentPretty.ts — NOT redefined here).
 *
 * @throws {@link TemplateError} if `input` fails the defensive schema check.
 */
export function renderTitle(input: TemplateInput): string {
  const v = validateInput(input);
  const opp = prettyOpponent(v.game.opponent);
  return `${v.kid.name} · vs ${opp} · ${v.game.scoreFor}–${v.game.scoreAgainst} ${v.game.result} · ${v.game.date}`;
}

/**
 * Render the YouTube video description for a game episode.
 *
 * Five-line LF-separated block (no CRLF). Line 4 is an empty separator line.
 *
 * @throws {@link TemplateError} if `input` fails the defensive schema check.
 */
export function renderDescription(input: TemplateInput): string {
  const v = validateInput(input);
  const opp = prettyOpponent(v.game.opponent);
  return [
    `Match Day · ${v.game.date}`,
    `${v.kid.name} (#${v.kid.jersey}, ${v.kid.club}) vs ${opp}`,
    `Final: ${v.game.scoreFor}–${v.game.scoreAgainst}`,
    '',
    `Filmed via ${v.kid.source}. Edited with golazo.`,
  ].join('\n');
}

/**
 * Convenience wrapper: renders both title and description in one call.
 *
 * This is the function Plan 03-05's `runPublish` orchestrator calls:
 * ```
 * const { title, description } = renderTemplates({ kid: channelConfig, game: manifest.game });
 * ```
 *
 * @throws {@link TemplateError} if `input` fails the defensive schema check.
 */
export function renderTemplates(input: TemplateInput): TemplateOutput {
  const v = validateInput(input);
  return {
    title: renderTitle(v),
    description: renderDescription(v),
  };
}
