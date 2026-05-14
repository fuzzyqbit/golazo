/**
 * Remotion entrypoint — registers Episode (1920x1080@30fps) and
 * Thumbnail (1280x720, 1 frame) compositions. Loads fonts via
 * delayRender/continueRender before any frame is captured.
 */
import React, { useEffect, useState } from 'react';
import { Composition, continueRender, delayRender, registerRoot } from 'remotion';

import { MOTION } from './theme/tokens.js';
import { loadFonts } from './theme/fonts.js';
import { Episode } from './Episode.js';
import { episodeInputPropsSchema } from './composition/inputProps.js';
import { Thumbnail } from './Thumbnail.js';
import { thumbnailInputPropsSchema } from './composition/inputProps.js';
import { computeEpisodeTimeline } from './composition/timing.js';

const EPISODE_DEFAULT_PROPS = episodeInputPropsSchema.parse({
  kid: { name: 'Player', club: 'Club FC', jersey: 9, accent: '#ffce5a' },
  game: { date: '2024-01-01', opponent: 'Opponent', scoreFor: 2, scoreAgainst: 1, result: 'W' },
  clips: [{ file: 'placeholder.mp4', absPath: '/tmp/placeholder.mp4', durationSec: 5 }],
  music: { absPath: '/tmp/music.mp3', durationSec: 200, strategy: 'trim-fade' },
});

const THUMBNAIL_DEFAULT_PROPS = thumbnailInputPropsSchema.parse({
  kid: { name: 'Player', club: 'Club FC', jersey: 9, accent: '#ffce5a' },
  game: { date: '2024-01-01', opponent: 'Opponent', scoreFor: 2, scoreAgainst: 1, result: 'W' },
});

export const RemotionRoot: React.FC = () => {
  const [fontHandle] = useState(() => delayRender('Loading fonts'));

  useEffect(() => {
    loadFonts()
      .then(() => continueRender(fontHandle))
      .catch((err: unknown) => {
        console.error('Failed to load fonts:', err);
        continueRender(fontHandle);
      });
  }, [fontHandle]);

  return (
    <>
      <Composition
        id="Episode"
        component={Episode}
        width={1920}
        height={1080}
        fps={MOTION.fps}
        durationInFrames={MOTION.titleCardFrames + MOTION.outroFrames}
        defaultProps={EPISODE_DEFAULT_PROPS}
        schema={episodeInputPropsSchema}
        calculateMetadata={({ props }) => ({
          durationInFrames: computeEpisodeTimeline({ clips: props.clips }).totalDurationInFrames,
        })}
      />
      <Composition
        id="Thumbnail"
        component={Thumbnail}
        width={1280}
        height={720}
        fps={1}
        durationInFrames={1}
        defaultProps={THUMBNAIL_DEFAULT_PROPS}
        schema={thumbnailInputPropsSchema}
      />
    </>
  );
};

registerRoot(RemotionRoot);
