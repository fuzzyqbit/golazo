/**
 * Type contract for the prepare pipeline. {@link GameMeta} is the structured
 * shape produced by `parseFilename(folderName)` in `./filename.ts` and is
 * consumed by the manifest builder in plans 04 + 05. All fields are derived
 * purely from the folder-name convention (`YYYY-MM-DD_vs_<slug>_<for>-<against>`)
 * — no I/O is required to produce a `GameMeta`.
 */

/** Match outcome derived from `scoreFor` vs `scoreAgainst`. */
export type MatchResult = 'W' | 'L' | 'D';

/**
 * Structured game metadata extracted from a folder name like
 * `2026-05-13_vs_united_3-1`. Result is derived: `scoreFor > scoreAgainst`
 * → `'W'`; `<` → `'L'`; `==` → `'D'`.
 */
export interface GameMeta {
  /** ISO date `YYYY-MM-DD`. Validated to be a real calendar date. */
  date: string;
  /** Opponent slug as it appears in the folder name (e.g. `united`, `city-sc`). */
  opponent: string;
  /** Non-negative integer 0..99. */
  scoreFor: number;
  /** Non-negative integer 0..99. */
  scoreAgainst: number;
  /** Derived match result: 'W' | 'L' | 'D'. */
  result: MatchResult;
}
