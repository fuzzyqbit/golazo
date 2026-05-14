/**
 * Chapter card rhythm decision module (REN-02).
 *
 * Pure module — no imports, no side effects, no React, no Remotion runtime.
 *
 * REN-02 rule:
 *   totalClips <= 5  ->  'every-clip'  (one chapter card per clip)
 *   totalClips >  5  ->  'every-3'    (chapter card before clips 0, 3, 6, 9, ...)
 *
 * Both exports are consumed by `remotion/composition/timing.ts` to build
 * the EpisodeTimeline. Tests live in `chapterRhythm.test.ts`.
 */

/** Chapter card cadence: one card per clip, or one card every three clips. */
export type ChapterRhythm = 'every-clip' | 'every-3';

/**
 * Decide the chapter card rhythm based on the total clip count.
 *
 * @param totalClips  Number of clips in the episode (0 is an edge case; rule still applies).
 * @returns `'every-clip'` when totalClips <= 5; `'every-3'` otherwise.
 */
export function computeChapterRhythm(totalClips: number): ChapterRhythm {
  return totalClips <= 5 ? 'every-clip' : 'every-3';
}

/**
 * Return true if a chapter card should be rendered immediately before the clip
 * at `clipIndex`.
 *
 * For `'every-clip'` rhythm: true for every clipIndex.
 * For `'every-3'` rhythm: true when `clipIndex === 0` or `clipIndex % 3 === 0`.
 * (Cards appear before clips 0, 3, 6, 9, ... — clips 1, 2, 4, 5, 7, 8, ...
 * share the previous card's context.)
 */
export function shouldRenderChapterCardBefore(opts: {
  clipIndex: number;
  totalClips: number;
}): boolean {
  const rhythm = computeChapterRhythm(opts.totalClips);
  if (rhythm === 'every-clip') {
    return true;
  }
  // every-3: card at clip 0, 3, 6, 9, ...
  return opts.clipIndex === 0 || opts.clipIndex % 3 === 0;
}
