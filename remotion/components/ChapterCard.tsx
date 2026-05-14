/**
 * ChapterCard component (REN-02).
 *
 * Minimal chapter divider: "Chapter N" in Cormorant Garamond Italic with an
 * accent-colored 2px divider above it. Rendered before each clip (or every
 * three clips) per the REN-02 chapter rhythm rule.
 *
 * Consumed by Episode.tsx inside a <Sequence> for each chapter segment.
 */
import React from 'react';
import { AbsoluteFill } from 'remotion';

import {
  COLORS,
  LAYOUT,
  TYPOGRAPHY,
  getCinematicGradeStyle,
  getVignetteOverlayStyle,
} from '../theme/index.js';

interface ChapterCardProps {
  kid: { accent: string };
  chapterIndex: number;
  nextClipIndex: number;
  totalClips: number;
}

export const ChapterCard: React.FC<ChapterCardProps> = ({ kid, chapterIndex }) => {
  const containerStyle: React.CSSProperties = {
    ...getCinematicGradeStyle(),
    backgroundColor: COLORS.chapterCardBg,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: LAYOUT.width,
    height: LAYOUT.height,
    paddingLeft: LAYOUT.cardPaddingX,
    paddingRight: LAYOUT.cardPaddingX,
    boxSizing: 'border-box',
  };

  const dividerStyle: React.CSSProperties = {
    width: 120,
    height: 2,
    backgroundColor: kid.accent,
    marginBottom: 24,
    borderRadius: 1,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.chapterCardBg }}>
      <div style={containerStyle}>
        <div style={dividerStyle} />
        <div style={{
          fontFamily: TYPOGRAPHY.display.family,
          fontWeight: TYPOGRAPHY.display.weight,
          fontStyle: TYPOGRAPHY.display.style,
          fontSize: TYPOGRAPHY.sizes.chapter,
          color: COLORS.foreground,
          letterSpacing: `${TYPOGRAPHY.letterSpacing.display}em`,
        }}>
          Chapter {chapterIndex + 1}
        </div>
      </div>
      <div style={getVignetteOverlayStyle()} />
    </AbsoluteFill>
  );
};
