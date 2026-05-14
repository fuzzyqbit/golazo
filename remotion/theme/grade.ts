/**
 * Cinematic-grade CSS helpers for Golazo Remotion compositions.
 *
 * Returns inline-style objects (React.CSSProperties) — NOT JSX.
 * The file uses only `import type` for React so it stays runtime-React-free
 * and is safe to import from the render driver without bundling React.
 *
 * Both helpers are module-level memoized so React reconciliation does not
 * allocate a new style object on every render.
 */
import type * as React from 'react';

/**
 * Cinematic-grade filter values.
 *
 * Tuned for soccer footage shot in mixed natural light:
 * - slight saturation bump (1.12) lifts grass greens and kit colours
 * - mild contrast lift (1.05) adds punch without harshness
 * - mild brightness drop (0.96) guards against blown highlights
 *
 * Plan 03 spreads this over each Clip layer: `<div style={getCinematicGradeStyle()}>`.
 * Do NOT change the values here without updating 02-01-SUMMARY.md — Plan 03
 * and Plan 04 pin these exact numbers in their snapshot tests.
 */
let cinematicGradeStyle: React.CSSProperties | null = null;

export function getCinematicGradeStyle(): React.CSSProperties {
  if (cinematicGradeStyle === null) {
    cinematicGradeStyle = { filter: 'saturate(1.12) contrast(1.05) brightness(0.96)' };
  }
  return cinematicGradeStyle;
}

/**
 * Radial-gradient vignette overlay.
 *
 * Plan 03 renders an absolute-positioned div with this style on top of every
 * Clip/Card layer to add a dark edge frame typical of broadcast highlight reels.
 */
let vignetteOverlayStyle: React.CSSProperties | null = null;

export function getVignetteOverlayStyle(): React.CSSProperties {
  if (vignetteOverlayStyle === null) {
    vignetteOverlayStyle = {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)',
    };
  }
  return vignetteOverlayStyle;
}
