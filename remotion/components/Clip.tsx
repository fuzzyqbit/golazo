/**
 * Clip component (REN-01, REN-04).
 *
 * Renders a single video clip via Remotion's OffthreadVideo component.
 * Applies cinematic grade and vignette overlay.
 *
 * Playback parameters come from `getClipPlayback(clipIndex)`:
 *   - clipIndex === 0: playbackRate=0.5 (slo-mo opener), muted=true
 *   - clipIndex > 0:  playbackRate=1.0 (normal), muted=false
 *
 * The `absPath` prop is a plain filesystem absolute path. The JSX wraps
 * it as `file://${absPath}` for Remotion's OffthreadVideo src — Plan 02-04's
 * render driver must pass plain absolute paths (NOT file:// URLs) so the
 * file:// convention lives in ONE place (here).
 *
 * `startFrom={0}` ensures the source clip starts at its native t=0.
 * Do NOT manually re-time via Sequence premultiplication — that path is
 * fragile across Remotion 4.x point releases.
 */
import React from 'react';
import { AbsoluteFill, OffthreadVideo } from 'remotion';

import {
  LAYOUT,
  getCinematicGradeStyle,
  getVignetteOverlayStyle,
} from '../theme/index.js';
import { getClipPlayback } from '../composition/timing.js';

interface ClipProps {
  /** Absolute filesystem path to the clip file (no file:// prefix). */
  absPath: string;
  /** 0-based index into the episode clips array. */
  clipIndex: number;
  durationInFrames: number;
}

export const Clip: React.FC<ClipProps> = ({ absPath, clipIndex }) => {
  const { playbackRate, muted } = getClipPlayback(clipIndex);

  // Wrap the absolute path as a file:// URL for Remotion's OffthreadVideo
  const src = absPath.startsWith('file://') ? absPath : `file://${absPath}`;

  const gradeWrapperStyle: React.CSSProperties = {
    ...getCinematicGradeStyle(),
    width: LAYOUT.width,
    height: LAYOUT.height,
    position: 'relative',
  };

  return (
    <AbsoluteFill>
      <div style={gradeWrapperStyle}>
        <OffthreadVideo
          src={src}
          playbackRate={playbackRate}
          muted={muted}
          startFrom={0}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={getVignetteOverlayStyle()} />
      </div>
    </AbsoluteFill>
  );
};
