/**
 * Unit tests for computeChapterRhythm and shouldRenderChapterCardBefore.
 *
 * Covers REN-02: Chapter card every clip when totalClips <= 5, every 3 clips otherwise.
 * Cases 1-7 test boundary values. Case 8 is the BLOCKING success-criterion-4 gate:
 * verifies the CARD COUNT for a <=5-clip fixture vs a >5-clip fixture.
 */
import { describe, expect, it } from 'vitest';

import { computeChapterRhythm, shouldRenderChapterCardBefore } from './chapterRhythm.js';

describe('computeChapterRhythm', () => {
  it('returns every-clip for 0 clips (edge — no clips, rule still applies)', () => {
    expect(computeChapterRhythm(0)).toBe('every-clip');
  });

  it('returns every-clip for 1 clip', () => {
    expect(computeChapterRhythm(1)).toBe('every-clip');
  });

  it('returns every-clip for 5 clips (boundary — equal to 5 keeps every-clip rhythm)', () => {
    expect(computeChapterRhythm(5)).toBe('every-clip');
  });

  it('returns every-3 for 6 clips (boundary — first value of every-3 rhythm)', () => {
    expect(computeChapterRhythm(6)).toBe('every-3');
  });

  it('returns every-3 for 12 clips', () => {
    expect(computeChapterRhythm(12)).toBe('every-3');
  });
});

describe('shouldRenderChapterCardBefore', () => {
  it('returns true for all clipIndex 0..4 when totalClips=5 (every-clip rhythm)', () => {
    const results = [0, 1, 2, 3, 4].map((clipIndex) =>
      shouldRenderChapterCardBefore({ clipIndex, totalClips: 5 }),
    );
    expect(results).toEqual([true, true, true, true, true]);
  });

  it('returns true for clipIndex 0, 3, 6 and false for others when totalClips=9 (every-3 rhythm)', () => {
    const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const results = indices.map((clipIndex) =>
      shouldRenderChapterCardBefore({ clipIndex, totalClips: 9 }),
    );
    expect(results).toEqual([true, false, false, true, false, false, true, false, false]);
  });

  it('SUCCESS CRITERION 4: totalClips=5 yields 5 chapter cards; totalClips=6 yields 2 chapter cards', () => {
    // every-clip: card before each of the 5 clips
    const count5 = [0, 1, 2, 3, 4].filter((c) =>
      shouldRenderChapterCardBefore({ clipIndex: c, totalClips: 5 }),
    ).length;
    expect(count5).toBe(5);

    // every-3: cards before clip 0 and clip 3 only
    const count6 = [0, 1, 2, 3, 4, 5].filter((c) =>
      shouldRenderChapterCardBefore({ clipIndex: c, totalClips: 6 }),
    ).length;
    expect(count6).toBe(2);
  });
});
