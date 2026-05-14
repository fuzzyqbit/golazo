/**
 * Outro component (REN-01, REN-03).
 *
 * Closing outro: kid name + club. Fades out over the last FADE_OUT_FRAMES.
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

import { COLORS, LAYOUT, TYPOGRAPHY, getCinematicGradeStyle, getVignetteOverlayStyle } from '../theme/index.js';

interface OutroProps {
  kid: { name: string; club: string };
}

const FADE_OUT_FRAMES = 15;

export const Outro: React.FC<OutroProps> = ({ kid }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [durationInFrames - FADE_OUT_FRAMES, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <div style={{
        ...getCinematicGradeStyle(),
        backgroundColor: COLORS.background,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        width: LAYOUT.width, height: LAYOUT.height, opacity,
        paddingLeft: LAYOUT.cardPaddingX, paddingRight: LAYOUT.cardPaddingX, boxSizing: 'border-box',
      }}>
        <div style={{
          fontFamily: TYPOGRAPHY.display.family, fontWeight: TYPOGRAPHY.display.weight,
          fontStyle: TYPOGRAPHY.display.style, fontSize: TYPOGRAPHY.sizes.hero,
          color: COLORS.foreground, letterSpacing: `${TYPOGRAPHY.letterSpacing.display}em`,
          lineHeight: 1.1, marginBottom: 16,
        }}>
          {kid.name}
        </div>
        <div style={{
          fontFamily: TYPOGRAPHY.label.family, fontWeight: TYPOGRAPHY.label.weight,
          fontSize: TYPOGRAPHY.sizes.sub, color: COLORS.foreground,
          letterSpacing: `${TYPOGRAPHY.letterSpacing.label}em`, opacity: 0.6,
        }}>
          {kid.club}
        </div>
      </div>
      <div style={getVignetteOverlayStyle()} />
    </AbsoluteFill>
  );
};
