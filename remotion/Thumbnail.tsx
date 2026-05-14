/**
 * Thumbnail composition (REN-05).
 *
 * Single-frame 1280x720 pure-typographic still. Score is the visual anchor.
 * Renders kid name, score, opponent, and date in cinematic typography.
 *
 * No animations (single frame). Registered in Root.tsx as durationInFrames=1.
 */
import React from 'react';
import { AbsoluteFill } from 'remotion';

import {
  COLORS,
  TYPOGRAPHY,
  getCinematicGradeStyle,
  getVignetteOverlayStyle,
} from './theme/index.js';
import type { ThumbnailInputProps } from './composition/inputProps.js';

export type { ThumbnailInputProps };
export { thumbnailInputPropsSchema } from './composition/inputProps.js';

// Thumbnail canvas is 1280x720 — scale typography down from 1920x1080 values
const SCALE = 1280 / 1920; // ≈ 0.667

const THUMBNAIL_PADDING = Math.round(96 * SCALE); // 64px

export const Thumbnail: React.FC<ThumbnailInputProps> = ({ kid, game }) => {
  const containerStyle: React.CSSProperties = {
    ...getCinematicGradeStyle(),
    backgroundColor: COLORS.background,
    width: 1280,
    height: 720,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: THUMBNAIL_PADDING,
    paddingRight: THUMBNAIL_PADDING,
    boxSizing: 'border-box',
  };

  const scoreUnderlineStyle: React.CSSProperties = {
    width: Math.round(80 * SCALE),
    height: 3,
    backgroundColor: kid.accent,
    marginTop: 6,
    borderRadius: 2,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <div style={containerStyle}>
        {/* Kid name */}
        <div style={{
          fontFamily: TYPOGRAPHY.display.family,
          fontWeight: TYPOGRAPHY.display.weight,
          fontStyle: TYPOGRAPHY.display.style,
          fontSize: Math.round(TYPOGRAPHY.sizes.hero * SCALE), // ≈ 64px
          color: COLORS.foreground,
          letterSpacing: `${TYPOGRAPHY.letterSpacing.display}em`,
          lineHeight: 1.1,
          marginBottom: 6,
        }}>
          {kid.name}
        </div>

        {/* vs Opponent */}
        <div style={{
          fontFamily: TYPOGRAPHY.display.family,
          fontWeight: TYPOGRAPHY.display.weight,
          fontStyle: TYPOGRAPHY.display.style,
          fontSize: Math.round(TYPOGRAPHY.sizes.sub * SCALE), // ≈ 24px
          color: COLORS.foreground,
          letterSpacing: `${TYPOGRAPHY.letterSpacing.display}em`,
          opacity: 0.8,
          marginBottom: 12,
        }}>
          vs {game.opponent}
        </div>

        {/* Score — visual anchor */}
        <div style={{
          fontFamily: TYPOGRAPHY.display.family,
          fontWeight: TYPOGRAPHY.display.weight,
          fontStyle: TYPOGRAPHY.display.style,
          fontSize: Math.round(TYPOGRAPHY.sizes.score * SCALE), // ≈ 96px
          color: COLORS.foreground,
          lineHeight: 1,
        }}>
          {game.scoreFor}–{game.scoreAgainst}
        </div>

        {/* Accent underline beneath score */}
        <div style={scoreUnderlineStyle} />

        {/* Date caption */}
        <div style={{
          fontFamily: TYPOGRAPHY.label.family,
          fontWeight: TYPOGRAPHY.label.weight,
          fontSize: Math.round(TYPOGRAPHY.sizes.caption * SCALE), // ≈ 12px
          color: COLORS.foreground,
          letterSpacing: `${TYPOGRAPHY.letterSpacing.label}em`,
          opacity: 0.5,
          marginTop: 12,
        }}>
          {game.date}
        </div>
      </div>
      <div style={getVignetteOverlayStyle()} />
    </AbsoluteFill>
  );
};
