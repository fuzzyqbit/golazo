/**
 * TitleCard component (REN-01, REN-03).
 *
 * Opening title card: kid name, club/jersey, opponent, score.
 * Fades in over FADE_IN_FRAMES using interpolate + useCurrentFrame.
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { COLORS, LAYOUT, TYPOGRAPHY, getCinematicGradeStyle, getVignetteOverlayStyle } from '../theme/index.js';

interface TitleCardProps {
  kid: { name: string; club: string; jersey: number; accent: string };
  game: { date: string; opponent: string; scoreFor: number; scoreAgainst: number; result: string };
}

const FADE_IN_FRAMES = 15;

const displayStyle = (size: number, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: TYPOGRAPHY.display.family,
  fontWeight: TYPOGRAPHY.display.weight,
  fontStyle: TYPOGRAPHY.display.style,
  fontSize: size,
  color: COLORS.foreground,
  letterSpacing: `${TYPOGRAPHY.letterSpacing.display}em`,
  ...extra,
});

export const TitleCard: React.FC<TitleCardProps> = ({ kid, game }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <div style={{
        ...getCinematicGradeStyle(),
        backgroundColor: COLORS.background,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        width: LAYOUT.width, height: LAYOUT.height, opacity,
        paddingLeft: LAYOUT.cardPaddingX, paddingRight: LAYOUT.cardPaddingX, boxSizing: 'border-box',
      }}>
        <div style={displayStyle(TYPOGRAPHY.sizes.hero, { lineHeight: 1.1, marginBottom: 8 })}>
          {kid.name}
        </div>
        <div style={{
          fontFamily: TYPOGRAPHY.label.family, fontWeight: TYPOGRAPHY.labelBold.weight,
          fontSize: TYPOGRAPHY.sizes.sub, color: COLORS.foreground,
          letterSpacing: `${TYPOGRAPHY.letterSpacing.label}em`, opacity: 0.7, marginBottom: 32,
        }}>
          {kid.club} · #{kid.jersey}
        </div>
        <div style={displayStyle(TYPOGRAPHY.sizes.sub, { opacity: 0.8, marginBottom: 16 })}>
          vs {game.opponent}
        </div>
        <div style={displayStyle(TYPOGRAPHY.sizes.score, { lineHeight: 1 })}>
          {game.scoreFor}–{game.scoreAgainst}
        </div>
        <div style={{ width: 80, height: 3, backgroundColor: kid.accent, marginTop: 8, borderRadius: 2 }} />
      </div>
      <div style={getVignetteOverlayStyle()} />
    </AbsoluteFill>
  );
};
