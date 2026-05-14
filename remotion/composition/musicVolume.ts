/**
 * REN-04 music ducking step-function.
 *
 * Pure module — no React, no Remotion runtime, no I/O. Importable by plain
 * vitest without any browser machinery.
 *
 * Episode.tsx imports `musicVolumeAtFrame` and passes it to the `<Audio>`
 * volume prop:
 *
 *   ```tsx
 *   import { musicVolumeAtFrame } from './composition/musicVolume.js';
 *   // ...
 *   <Audio src={'file://' + props.music.absPath}
 *          volume={(f) => musicVolumeAtFrame(f, timeline)} />
 *   ```
 *
 * The step-function returns a per-frame gain value from the three constants
 * below. Boundary semantics use a half-open interval [startFrame, startFrame+duration):
 * the boundary frame belongs to the STARTING segment, not the ending one.
 *
 * Boundary-ramp polish (REN-04 smoothing) is DEFERRED. The `fps` parameter
 * is already in the signature so a future PR can add a boundary ramp inside
 * this module without changing every call site. Phase 2 ships the step-function.
 */
import type { EpisodeTimeline } from './timing.js';

// ---------------------------------------------------------------------------
// Volume constants
// ---------------------------------------------------------------------------

/** Music is muted entirely during the first slo-mo clip (REN-04). */
export const MUSIC_VOLUME_MUTED = 0;

/** Music is ducked under subsequent clip audio (REN-04). */
export const MUSIC_VOLUME_DUCKED = 0.2;

/** Music plays at baseline during title / chapter / outro segments (REN-04). */
export const MUSIC_VOLUME_BASELINE = 0.7;

// ---------------------------------------------------------------------------
// Step-function
// ---------------------------------------------------------------------------

/**
 * Return the music gain for `frame` based on the episode timeline.
 *
 * Algorithm:
 *   1. Find the segment whose half-open interval [startFrame, startFrame+duration)
 *      contains `frame`. Out-of-bounds → MUSIC_VOLUME_BASELINE.
 *   2. If segment is 'clip' AND clipIndex === 0 → MUSIC_VOLUME_MUTED.
 *   3. If segment is 'clip' (any other clipIndex) → MUSIC_VOLUME_DUCKED.
 *   4. Otherwise ('title' | 'chapter' | 'outro') → MUSIC_VOLUME_BASELINE.
 *
 * @param frame     Current Remotion frame number.
 * @param timeline  Episode timeline from `computeEpisodeTimeline`.
 * @param _fps      UNUSED in step-function; reserved for future boundary-ramp.
 */
export function musicVolumeAtFrame(
  frame: number,
  timeline: EpisodeTimeline,
  _fps?: number,
): number {
  const seg = timeline.segments.find(
    (s) => frame >= s.startFrame && frame < s.startFrame + s.durationInFrames,
  );

  if (!seg) {
    // Out-of-bounds (before frame 0 or past totalDurationInFrames)
    return MUSIC_VOLUME_BASELINE;
  }

  if (seg.kind === 'clip' && seg.clipIndex === 0) {
    return MUSIC_VOLUME_MUTED;
  }

  if (seg.kind === 'clip') {
    return MUSIC_VOLUME_DUCKED;
  }

  // 'title' | 'chapter' | 'outro'
  return MUSIC_VOLUME_BASELINE;
}
