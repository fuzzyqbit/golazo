/**
 * Episode composition (REN-01, REN-04).
 *
 * Sequences the full episode as:
 *   TitleCard -> (ChapterCard -> Clip)* -> Outro
 *
 * With per-frame music ducking via <Audio volume={(f) => musicVolumeAtFrame(f, timeline)}.
 * The music volume step-function is IMPORTED from remotion/composition/musicVolume.ts
 * (NOT redefined inline — that was the Finding-3 anti-pattern).
 *
 * Timeline is computed by computeEpisodeTimeline from the inputProps clips.
 * Each segment is rendered inside a <Sequence from={...} durationInFrames={...}>.
 *
 * The absPath for clips and music are plain absolute filesystem paths.
 * The JSX wraps them as file:// URLs — see Clip.tsx and the inline comment below.
 */
import React from 'react';
import { AbsoluteFill, Audio, Sequence } from 'remotion';

import { COLORS, MOTION, getCinematicGradeStyle, getVignetteOverlayStyle } from './theme/index.js';
import { ChapterCard } from './components/ChapterCard.js';
import { Clip } from './components/Clip.js';
import { Outro } from './components/Outro.js';
import { TitleCard } from './components/TitleCard.js';
import { musicVolumeAtFrame } from './composition/musicVolume.js';
import { computeEpisodeTimeline } from './composition/timing.js';
import type { EpisodeInputProps } from './composition/inputProps.js';

export type { EpisodeInputProps };
export { episodeInputPropsSchema } from './composition/inputProps.js';

/**
 * Episode composition component.
 *
 * Called by Remotion for every frame. Computes the timeline once at render
 * time, then maps each segment to a <Sequence> containing the appropriate
 * component.
 */
export const Episode: React.FC<EpisodeInputProps> = (props) => {
  const timeline = computeEpisodeTimeline({ clips: props.clips, fps: MOTION.fps });

  // Music src — plain absolute path wrapped as file:// URL.
  // Plan 02-04's driver must pass a plain absolute path (NOT file://) so the
  // file:// convention lives here in one place.
  const musicSrc = props.music.absPath.startsWith('file://')
    ? props.music.absPath
    : `file://${props.music.absPath}`;

  // Count chapter segments to derive chapterIndex (0-based) per card
  let chapterCount = 0;

  const containerStyle: React.CSSProperties = {
    ...getCinematicGradeStyle(),
    backgroundColor: COLORS.background,
    width: '100%',
    height: '100%',
  };

  return (
    <AbsoluteFill style={containerStyle}>
      {/* Music track with per-frame ducking (REN-04) */}
      <Audio
        src={musicSrc}
        volume={(f) => musicVolumeAtFrame(f, timeline)}
      />

      {timeline.segments.map((seg, i) => {
        if (seg.kind === 'title') {
          return (
            <Sequence key={i} from={seg.startFrame} durationInFrames={seg.durationInFrames}>
              <TitleCard kid={props.kid} game={props.game} />
            </Sequence>
          );
        }

        if (seg.kind === 'chapter') {
          const ci = chapterCount++;
          return (
            <Sequence key={i} from={seg.startFrame} durationInFrames={seg.durationInFrames}>
              <ChapterCard
                kid={props.kid}
                chapterIndex={ci}
                nextClipIndex={seg.nextClipIndex ?? 0}
                totalClips={props.clips.length}
              />
            </Sequence>
          );
        }

        if (seg.kind === 'clip') {
          const clip = props.clips[seg.clipIndex ?? 0]!;
          return (
            <Sequence key={i} from={seg.startFrame} durationInFrames={seg.durationInFrames}>
              <Clip
                absPath={clip.absPath}
                clipIndex={seg.clipIndex ?? 0}
                durationInFrames={seg.durationInFrames}
              />
            </Sequence>
          );
        }

        if (seg.kind === 'outro') {
          return (
            <Sequence key={i} from={seg.startFrame} durationInFrames={seg.durationInFrames}>
              <Outro kid={props.kid} />
            </Sequence>
          );
        }

        return null;
      })}

      {/* Global vignette overlay — on top of all segments */}
      <div style={getVignetteOverlayStyle()} />
    </AbsoluteFill>
  );
};
