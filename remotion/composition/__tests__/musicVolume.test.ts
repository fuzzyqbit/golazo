/**
 * Unit tests for musicVolumeAtFrame (REN-04 music ducking step-function).
 *
 * Cases 1-4 are BLOCKING (Finding-3 requirement: ≥4 dedicated unit tests pinning
 * the REN-04 step function). Cases 5-8 cover outro + out-of-bounds + boundary semantics.
 *
 * Test timeline: 3 clips at 4s, 3s, 2s (fps=30):
 *   title:    [0, 90)
 *   chapter:  [90, 135)    (before clip 0)
 *   clip 0:   [135, 375)   slo-mo doubled: ceil(4*30)*2 = 240
 *   chapter:  [375, 420)   (before clip 1)
 *   clip 1:   [420, 510)   ceil(3*30) = 90
 *   chapter:  [510, 555)   (before clip 2)
 *   clip 2:   [555, 615)   ceil(2*30) = 60
 *   outro:    [615, 705)
 *   total = 705
 */
import { describe, expect, it } from 'vitest';

import { computeEpisodeTimeline } from '../timing.js';
import {
  MUSIC_VOLUME_BASELINE,
  MUSIC_VOLUME_DUCKED,
  MUSIC_VOLUME_MUTED,
  musicVolumeAtFrame,
} from '../musicVolume.js';

const timeline = computeEpisodeTimeline({
  clips: [{ durationSec: 4 }, { durationSec: 3 }, { durationSec: 2 }],
  fps: 30,
});

describe('musicVolumeAtFrame — REN-04 ducking step-function', () => {
  it('1. SLO-MO FIRST CLIP IS MUTED: frame 150 is inside clip0 [135, 375)', () => {
    expect(musicVolumeAtFrame(150, timeline)).toBe(MUSIC_VOLUME_MUTED);
    expect(musicVolumeAtFrame(150, timeline)).toBe(0);
  });

  it('2. NON-FIRST CLIP IS DUCKED: frame 450 is inside clip1 [420, 510)', () => {
    expect(musicVolumeAtFrame(450, timeline)).toBe(MUSIC_VOLUME_DUCKED);
    expect(musicVolumeAtFrame(450, timeline)).toBe(0.2);
  });

  it('3. TITLE CARD IS BASELINE: frame 30 is inside title [0, 90)', () => {
    expect(musicVolumeAtFrame(30, timeline)).toBe(MUSIC_VOLUME_BASELINE);
    expect(musicVolumeAtFrame(30, timeline)).toBe(0.7);
  });

  it('4. CHAPTER CARD IS BASELINE: frame 100 is inside chapter [90, 135)', () => {
    expect(musicVolumeAtFrame(100, timeline)).toBe(MUSIC_VOLUME_BASELINE);
    expect(musicVolumeAtFrame(100, timeline)).toBe(0.7);
  });

  it('5. OUTRO IS BASELINE: frame 700 is inside outro [615, 705)', () => {
    expect(musicVolumeAtFrame(700, timeline)).toBe(MUSIC_VOLUME_BASELINE);
    expect(musicVolumeAtFrame(700, timeline)).toBe(0.7);
  });

  it('6. OUT-OF-BOUNDS FRAME FALLS BACK TO BASELINE: -1 and 99999', () => {
    expect(musicVolumeAtFrame(-1, timeline)).toBe(MUSIC_VOLUME_BASELINE);
    expect(musicVolumeAtFrame(99999, timeline)).toBe(MUSIC_VOLUME_BASELINE);
  });

  it('7. BOUNDARY FRAME 135 belongs to clip0 (half-open [start, start+duration))', () => {
    // Frame 135 is the FIRST frame of clip0 — the previous chapter ends at 135
    expect(musicVolumeAtFrame(135, timeline)).toBe(MUSIC_VOLUME_MUTED);
  });

  it('8. BOUNDARY FRAME 90 belongs to the chapter card (not the title)', () => {
    // Frame 90 is the first frame of the chapter segment [90, 135) — title ended at 90
    expect(musicVolumeAtFrame(90, timeline)).toBe(MUSIC_VOLUME_BASELINE);
  });
});
