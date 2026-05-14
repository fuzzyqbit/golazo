/**
 * Pure parser for the per-game folder naming convention:
 *
 *   YYYY-MM-DD_vs_<opponent-slug>_<scoreFor>-<scoreAgainst>
 *
 * Implements PREP-01 (filename parser). The function is pure (no I/O): it
 * runs a strict regex, validates the date is a real calendar date (via a
 * round-trip through `new Date(...).toISOString()`), validates each score
 * is 0..99, and derives `result` from the score comparison. Any failure
 * mode throws {@link FilenameError} with the expected format echoed back
 * to the operator.
 *
 * See `./filename.test-cases.ts` for the table-driven case list (7 valid
 * rows + 13 malformed rows).
 */

import { FilenameError } from './errors.js';
import type { GameMeta, MatchResult } from './types.js';

/**
 * Canonical folder-name regex. Capture groups:
 *  1. date `YYYY-MM-DD` (each component fixed-width digits — month / day
 *     calendar validity is enforced separately because the regex alone
 *     accepts e.g. `2026-13-01` and `2026-02-30`)
 *  2. opponent slug — one or more lowercase-alphanumeric groups separated
 *     by single hyphens (no leading/trailing hyphen, no consecutive
 *     hyphens, no uppercase)
 *  3. scoreFor — one or more digits (range further enforced to 0..99)
 *  4. scoreAgainst — one or more digits (range further enforced to 0..99)
 */
export const FILENAME_REGEX =
  /^(\d{4}-\d{2}-\d{2})_vs_([a-z0-9]+(?:-[a-z0-9]+)*)_(\d+)-(\d+)$/;

/** Inclusive upper bound on either score component. */
const MAX_SCORE = 99;

/**
 * Determine whether `dateStr` (already in `YYYY-MM-DD` shape per the regex)
 * is a real calendar date. We rely on the round-trip property: constructing
 * `new Date(dateStr + 'T00:00:00Z')` and projecting back to ISO yields the
 * same `YYYY-MM-DD` substring iff the date was valid. This catches month
 * 13, day 30 of February, day 31 of June, etc.
 */
function isRealCalendarDate(dateStr: string): boolean {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === dateStr;
}

/**
 * Derive the match result from the two scores. Pure function over numbers.
 */
function deriveResult(scoreFor: number, scoreAgainst: number): MatchResult {
  if (scoreFor > scoreAgainst) return 'W';
  if (scoreFor < scoreAgainst) return 'L';
  return 'D';
}

/**
 * Parse a folder name into structured {@link GameMeta}. Throws
 * {@link FilenameError} on any failure (regex mismatch, invalid calendar
 * date, or score component > 99).
 */
export function parseFilename(folderName: string): GameMeta {
  const match = FILENAME_REGEX.exec(folderName);
  if (!match) {
    throw new FilenameError({
      folderName,
      reason: 'does not match required pattern',
    });
  }

  // With noUncheckedIndexedAccess, indexed access on RegExpExecArray returns
  // `string | undefined`. The regex has exactly 4 capture groups; a
  // successful match guarantees all 4 are present, but TS doesn't know
  // that, so we assert via a runtime check (defensive — should never fire).
  const date = match[1];
  const opponent = match[2];
  const scoreForStr = match[3];
  const scoreAgainstStr = match[4];
  if (
    date === undefined ||
    opponent === undefined ||
    scoreForStr === undefined ||
    scoreAgainstStr === undefined
  ) {
    /* c8 ignore next 4 -- defensive; unreachable on a successful regex match */
    throw new FilenameError({
      folderName,
      reason: 'internal: regex match missing capture groups',
    });
  }

  if (!isRealCalendarDate(date)) {
    throw new FilenameError({
      folderName,
      reason: `'${date}' is not a real calendar date`,
    });
  }

  const scoreFor = Number(scoreForStr);
  const scoreAgainst = Number(scoreAgainstStr);
  if (scoreFor > MAX_SCORE || scoreAgainst > MAX_SCORE) {
    throw new FilenameError({
      folderName,
      reason: `score '${scoreForStr}-${scoreAgainstStr}' has a component > ${MAX_SCORE}`,
    });
  }

  return {
    date,
    opponent,
    scoreFor,
    scoreAgainst,
    result: deriveResult(scoreFor, scoreAgainst),
  };
}
