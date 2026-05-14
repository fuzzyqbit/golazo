/**
 * Unit tests for computeEpisodeTimeline and getClipPlayback.
 *
 * Covers REN-01: Episode sequences TitleCard -> (ChapterCard -> Clip)* -> Outro.
 * First clip plays at 0.5x rate (doubled duration). Frame conversion uses Math.ceil.
 *
 * All tests use fps=30 unless explicitly overriding.
 * MOTION constants: titleCardFrames=90, chapterCardFrames=45, outroFrames=90.
 */
import { describe, expect, it } from 'vitest';

import { computeEpisodeTimeline, getClipPlayback } from './timing.js';

describe('computeEpisodeTimeline', () => {
  it('EMPTY CLIPS: throws Error when clips array is empty', () => {
    expect(() => computeEpisodeTimeline({ clips: [] })).toThrow(
      'cannot render episode with zero clips',
    );
  });

  it('SINGLE CLIP: produces correct segments for 1 clip of 4 seconds', () => {
    const timeline = computeEpisodeTimeline({ clips: [{ durationSec: 4 }], fps: 30 });
    // title=90, chapter=45, clip0=ceil(4*30)*2=240, outro=90 => total=465
    expect(timeline.totalDurationInFrames).toBe(465);
    expect(timeline.segments).toHaveLength(4);

    const [title, chapter, clip0, outro] = timeline.segments;
    expect(title).toMatchObject({ kind: 'title', startFrame: 0, durationInFrames: 90 });
    expect(chapter).toMatchObject({ kind: 'chapter', startFrame: 90, durationInFrames: 45, nextClipIndex: 0 });
    expect(clip0).toMatchObject({ kind: 'clip', startFrame: 135, durationInFrames: 240, clipIndex: 0 });
    expect(outro).toMatchObject({ kind: 'outro', startFrame: 375, durationInFrames: 90 });
  });

  it('THREE CLIPS (every-clip rhythm): correct segments for clips of 4, 3, 2 seconds', () => {
    const timeline = computeEpisodeTimeline({
      clips: [{ durationSec: 4 }, { durationSec: 3 }, { durationSec: 2 }],
      fps: 30,
    });
    // title=90, ch=45, clip0=240, ch=45, clip1=90, ch=45, clip2=60, outro=90 => total=705
    expect(timeline.totalDurationInFrames).toBe(705);
    expect(timeline.segments).toHaveLength(8);

    const segs = timeline.segments;
    expect(segs[0]).toMatchObject({ kind: 'title', startFrame: 0, durationInFrames: 90 });
    expect(segs[1]).toMatchObject({ kind: 'chapter', startFrame: 90, durationInFrames: 45 });
    expect(segs[2]).toMatchObject({ kind: 'clip', startFrame: 135, durationInFrames: 240, clipIndex: 0 });
    expect(segs[3]).toMatchObject({ kind: 'chapter', startFrame: 375, durationInFrames: 45 });
    expect(segs[4]).toMatchObject({ kind: 'clip', startFrame: 420, durationInFrames: 90, clipIndex: 1 });
    expect(segs[5]).toMatchObject({ kind: 'chapter', startFrame: 510, durationInFrames: 45 });
    expect(segs[6]).toMatchObject({ kind: 'clip', startFrame: 555, durationInFrames: 60, clipIndex: 2 });
    expect(segs[7]).toMatchObject({ kind: 'outro', startFrame: 615, durationInFrames: 90 });
  });

  it('SIX CLIPS (every-3 rhythm): 2 chapter cards, 10 total segments', () => {
    const clips = Array.from({ length: 6 }, () => ({ durationSec: 2 }));
    const timeline = computeEpisodeTimeline({ clips, fps: 30 });

    // every-3: chapter before clip0 and clip3 only
    // title=90, ch=45, clip0=ceil(2*30)*2=120, clip1=60, clip2=60, ch=45, clip3=60, clip4=60, clip5=60, outro=90
    // total = 90 + 45 + 120 + 60 + 60 + 45 + 60 + 60 + 60 + 90 = 690
    expect(timeline.segments).toHaveLength(10); // 1 title + 2 chapters + 6 clips + 1 outro
    const kinds = timeline.segments.map((s) => s.kind);
    expect(kinds.filter((k) => k === 'chapter')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'clip')).toHaveLength(6);
    expect(kinds[0]).toBe('title');
    expect(kinds[kinds.length - 1]).toBe('outro');
    expect(timeline.totalDurationInFrames).toBe(690);
  });

  it('STARTFRAME MONOTONICITY: segments are in order, each startFrame = previous end', () => {
    const timeline = computeEpisodeTimeline({
      clips: [{ durationSec: 4 }, { durationSec: 3 }, { durationSec: 2 }],
      fps: 30,
    });
    for (let i = 1; i < timeline.segments.length; i++) {
      const prev = timeline.segments[i - 1]!;
      const curr = timeline.segments[i]!;
      expect(curr.startFrame).toBe(prev.startFrame + prev.durationInFrames);
    }
  });

  it('TOTAL DURATION MATCHES SUM: totalDurationInFrames === sum of segment durations', () => {
    const timeline = computeEpisodeTimeline({
      clips: [{ durationSec: 5 }, { durationSec: 2 }, { durationSec: 3 }, { durationSec: 1 }],
      fps: 30,
    });
    const sum = timeline.segments.reduce((acc, s) => acc + s.durationInFrames, 0);
    expect(timeline.totalDurationInFrames).toBe(sum);
  });

  it('FIRST-CLIP DOUBLING: first clip segment has 2x base frames; others have 1x', () => {
    const clips = [{ durationSec: 4 }, { durationSec: 3 }, { durationSec: 2 }];
    const fps = 30;
    const timeline = computeEpisodeTimeline({ clips, fps });

    const clipSegs = timeline.segments.filter((s) => s.kind === 'clip');
    expect(clipSegs[0]!.durationInFrames).toBe(2 * Math.ceil(clips[0]!.durationSec * fps));
    expect(clipSegs[1]!.durationInFrames).toBe(Math.ceil(clips[1]!.durationSec * fps));
    expect(clipSegs[2]!.durationInFrames).toBe(Math.ceil(clips[2]!.durationSec * fps));
  });

  it('getClipPlayback: index 0 is slo-mo+muted, others are normal+unmuted', () => {
    expect(getClipPlayback(0)).toEqual({ playbackRate: 0.5, muted: true });
    expect(getClipPlayback(1)).toEqual({ playbackRate: 1, muted: false });
    expect(getClipPlayback(99)).toEqual({ playbackRate: 1, muted: false });
  });

  it('CUSTOM FPS: clip0 durationInFrames = ceil(4*60)*2 = 480 at 60fps', () => {
    const timeline = computeEpisodeTimeline({ clips: [{ durationSec: 4 }], fps: 60 });
    const clipSeg = timeline.segments.find((s) => s.kind === 'clip');
    expect(clipSeg!.durationInFrames).toBe(480);
  });
});
