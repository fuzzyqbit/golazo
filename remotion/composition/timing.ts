/**
 * Episode timeline computation (REN-01).
 *
 * Pure module — the only side-effect-free way to compute an EpisodeTimeline
 * from a clip list. No React, no Remotion runtime, no I/O.
 *
 * Imported by:
 *   - `remotion/Episode.tsx`   — to compute the total composition duration and
 *                                 render per-segment <Sequence> wrappers.
 *   - `remotion/Root.tsx`      — inside `calculateMetadata` to derive
 *                                 `durationInFrames` from resolved inputProps.
 *   - `remotion/composition/__tests__/musicVolume.test.ts` — to build a
 *                                 representative timeline for ducking tests.
 *
 * Frame conversion rule: `Math.ceil(durationSec * fps)`.
 * Ceil (not round) so the rendered clip never CUTS OFF — it may include up to
 * one extra blank frame at the end, which the cinematic grade hides.
 *
 * First clip durationInFrames is DOUBLED because `playbackRate=0.5` means the
 * source plays for 2× its natural duration in episode wall-clock time.
 */
import { MOTION } from '../theme/tokens.js';
import { shouldRenderChapterCardBefore } from './chapterRhythm.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Segment category within the episode timeline. */
export type EpisodeSegmentKind = 'title' | 'chapter' | 'clip' | 'outro';

/**
 * A single ordered time range within the episode timeline.
 *
 * `clipIndex` is only set for `kind === 'clip'` segments (0-based index into
 * the `input.clips` array).
 * `nextClipIndex` is only set for `kind === 'chapter'` segments (the clip
 * index of the clip this chapter card introduces).
 */
export interface EpisodeSegment {
  kind: EpisodeSegmentKind;
  startFrame: number;
  durationInFrames: number;
  /** For 'clip' segments: index into the input clips array. */
  clipIndex?: number;
  /** For 'chapter' segments: the clipIndex of the next clip this card heads. */
  nextClipIndex?: number;
}

/**
 * The computed timeline for an episode. Consumed by Episode.tsx to render
 * segments and by musicVolumeAtFrame to drive audio ducking.
 */
export interface EpisodeTimeline {
  fps: number;
  totalDurationInFrames: number;
  segments: EpisodeSegment[];
}

/** Playback parameters for a clip at `clipIndex`. */
export interface ClipPlayback {
  /** 0.5 for the first clip (slo-mo); 1.0 for all others. */
  playbackRate: number;
  /** true for the first clip (music carries); false for all others. */
  muted: boolean;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Compute the full episode timeline from a clip list.
 *
 * Segment order:
 *   1. TitleCard          (MOTION.titleCardFrames)
 *   2. Per clip:
 *      a. [ChapterCard]   (MOTION.chapterCardFrames) — when shouldRenderChapterCardBefore
 *      b. Clip            (ceil(durationSec * fps) * (c === 0 ? 2 : 1))
 *   3. Outro              (MOTION.outroFrames)
 *
 * @param input.clips      Array of clip descriptors with `durationSec`.
 * @param input.fps        Frames per second (defaults to MOTION.fps = 30).
 * @throws {Error}         If `clips` is empty.
 */
export function computeEpisodeTimeline(input: {
  clips: { durationSec: number }[];
  fps?: number;
}): EpisodeTimeline {
  if (input.clips.length === 0) {
    throw new Error('cannot render episode with zero clips');
  }

  const fps = input.fps ?? MOTION.fps;
  const segments: EpisodeSegment[] = [];
  let cursor = 0;

  // 1. Title card
  segments.push({ kind: 'title', startFrame: cursor, durationInFrames: MOTION.titleCardFrames });
  cursor += MOTION.titleCardFrames;

  // 2. Per-clip with optional preceding chapter card
  const totalClips = input.clips.length;
  for (let c = 0; c < totalClips; c++) {
    if (shouldRenderChapterCardBefore({ clipIndex: c, totalClips })) {
      segments.push({
        kind: 'chapter',
        startFrame: cursor,
        durationInFrames: MOTION.chapterCardFrames,
        nextClipIndex: c,
      });
      cursor += MOTION.chapterCardFrames;
    }

    const baseFrames = Math.ceil(input.clips[c]!.durationSec * fps);
    const clipFrames = c === 0 ? baseFrames * 2 : baseFrames;
    segments.push({
      kind: 'clip',
      startFrame: cursor,
      durationInFrames: clipFrames,
      clipIndex: c,
    });
    cursor += clipFrames;
  }

  // 3. Outro
  segments.push({ kind: 'outro', startFrame: cursor, durationInFrames: MOTION.outroFrames });
  cursor += MOTION.outroFrames;

  return { fps, totalDurationInFrames: cursor, segments };
}

/**
 * Return playback parameters for the clip at `clipIndex`.
 *
 * - clipIndex === 0 → slo-mo opener: `{ playbackRate: 0.5, muted: true }`
 * - clipIndex > 0   → normal: `{ playbackRate: 1, muted: false }`
 *
 * Uses `MOTION.firstClipPlaybackRate` (= 0.5) for the slo-mo rate so the
 * value is in one canonical place.
 */
export function getClipPlayback(clipIndex: number): ClipPlayback {
  if (clipIndex === 0) {
    return { playbackRate: MOTION.firstClipPlaybackRate, muted: true };
  }
  return { playbackRate: 1, muted: false };
}
