/**
 * Table-driven test cases for `filename.test.ts`. Extracted to a sibling
 * (non-test) module so the named-const arrays can be imported by tooling
 * (`tsx -e` row-count gates, future codegen) without dragging vitest's
 * runner context into scope. Mirrors the Plan 02 `channels.test-cases.ts`
 * pattern.
 */

import type { GameMeta } from './types.js';

/** A single VALID parse case: input string → expected `GameMeta`. */
export interface FilenameValidCase {
  readonly input: string;
  readonly expected: GameMeta;
}

/** A single MALFORMED parse case: input + human-readable hint. */
export interface FilenameMalformedCase {
  readonly input: string;
  /** Free-form note describing why this row exists — not asserted on the error. */
  readonly reasonHint: string;
}

/**
 * VALID cases. Each row covers a distinct slice of the parser's contract:
 * win / loss / draw result derivation, single-word and hyphenated opponent
 * slugs, zero scores, double-digit scores, and the minimum 1-char slug.
 *
 * Length asserted by a meta-test (>= 7) and re-checkable from any importer
 * without spinning up vitest.
 */
export const FILENAME_VALID_CASES: readonly FilenameValidCase[] = [
  {
    input: '2026-05-13_vs_united_3-1',
    expected: {
      date: '2026-05-13',
      opponent: 'united',
      scoreFor: 3,
      scoreAgainst: 1,
      result: 'W',
    },
  },
  {
    input: '2026-05-13_vs_united_1-3',
    expected: {
      date: '2026-05-13',
      opponent: 'united',
      scoreFor: 1,
      scoreAgainst: 3,
      result: 'L',
    },
  },
  {
    input: '2026-05-13_vs_united_2-2',
    expected: {
      date: '2026-05-13',
      opponent: 'united',
      scoreFor: 2,
      scoreAgainst: 2,
      result: 'D',
    },
  },
  {
    input: '2026-05-12_vs_city-sc_2-2',
    expected: {
      date: '2026-05-12',
      opponent: 'city-sc',
      scoreFor: 2,
      scoreAgainst: 2,
      result: 'D',
    },
  },
  {
    input: '2026-05-13_vs_ac-milan_0-0',
    expected: {
      date: '2026-05-13',
      opponent: 'ac-milan',
      scoreFor: 0,
      scoreAgainst: 0,
      result: 'D',
    },
  },
  {
    input: '2026-05-13_vs_united_10-9',
    expected: {
      date: '2026-05-13',
      opponent: 'united',
      scoreFor: 10,
      scoreAgainst: 9,
      result: 'W',
    },
  },
  {
    input: '2026-12-31_vs_a_0-1',
    expected: {
      date: '2026-12-31',
      opponent: 'a',
      scoreFor: 0,
      scoreAgainst: 1,
      result: 'L',
    },
  },
] as const;

/**
 * MALFORMED cases. Every row MUST throw `FilenameError` whose message
 * contains the substring `YYYY-MM-DD_vs_<slug>_<for>-<against>` (the
 * expected format echoed back to the operator).
 *
 * Length asserted by a meta-test (>= 13).
 */
export const FILENAME_MALFORMED_CASES: readonly FilenameMalformedCase[] = [
  { input: 'badname', reasonHint: 'no underscores at all' },
  { input: '2026-05-13_united_3-1', reasonHint: 'missing _vs_' },
  { input: '2026-5-13_vs_united_3-1', reasonHint: 'date not zero-padded' },
  {
    input: '2026-05-13_vs_united_three-1',
    reasonHint: 'non-numeric score',
  },
  {
    input: '2026-13-01_vs_united_3-1',
    reasonHint: 'invalid calendar month (13)',
  },
  {
    input: '2026-02-30_vs_united_3-1',
    reasonHint: 'invalid calendar day (Feb 30)',
  },
  {
    input: '2026-05-13_vs_United_3-1',
    reasonHint: 'uppercase opponent slug',
  },
  {
    input: '2026-05-13_vs_-united_3-1',
    reasonHint: 'leading hyphen on opponent',
  },
  {
    input: '2026-05-13_vs_united-_3-1',
    reasonHint: 'trailing hyphen on opponent',
  },
  {
    input: '2026-05-13_vs_united--sc_3-1',
    reasonHint: 'consecutive hyphens in opponent',
  },
  {
    input: '2026-05-13_vs_united_3-1_extra',
    reasonHint: 'trailing junk after scores',
  },
  {
    input: '2026-05-13_vs_united_3',
    reasonHint: 'missing scoreAgainst',
  },
  {
    input: '2026-05-13_vs_united_100-1',
    reasonHint: 'score out of range (>99)',
  },
] as const;
