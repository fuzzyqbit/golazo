/**
 * Visual theme token constants for Golazo Remotion compositions.
 *
 * Pure data — no imports, no runtime side effects, no React or Remotion runtime APIs.
 * Importable by both the Remotion composition bundle and the Node.js render driver.
 *
 * All values are `as const` so downstream consumers get narrow literal types.
 */

/**
 * Color palette. Near-black backdrop with warm-cream typography.
 * `accentDefault` is the fallback accent; each kid's ChannelConfig.accent overrides it.
 */
export const COLORS = {
  background: '#0a0a0a',
  foreground: '#f5f1e8',
  accentDefault: '#ffce5a',
  chapterCardBg: '#0e0e0e',
  vignetteEdge: 'rgba(0,0,0,0.6)',
} as const;

/**
 * Typography roles: display (Cormorant Garamond italic serif) + label (Inter sans-serif).
 * Size values are in px assuming the 1920×1080 canvas defined in LAYOUT.
 */
export const TYPOGRAPHY = {
  display: { family: 'Cormorant Garamond', weight: 400, style: 'italic' as const },
  label: { family: 'Inter', weight: 400, style: 'normal' as const },
  labelBold: { family: 'Inter', weight: 700, style: 'normal' as const },
  sizes: { hero: 96, sub: 36, chapter: 64, score: 144, caption: 18 },
  letterSpacing: { display: 0.02, label: 0.16 },
} as const;

/**
 * Canvas dimensions and safe-zone margins.
 * All compositions target 1920×1080 @ 30fps.
 */
export const LAYOUT = {
  width: 1920,
  height: 1080,
  safeMargin: 96,
  cardPaddingX: 160,
} as const;

/**
 * Frame-count constants and playback configuration.
 *
 * `firstClipPlaybackRate: 0.5` — the opening clip plays at half speed (slo-mo opener, REN-01).
 * All frame counts assume `fps: 30`.
 */
export const MOTION = {
  titleCardFrames: 90,
  chapterCardFrames: 45,
  outroFrames: 90,
  crossfadeFrames: 12,
  fps: 30,
  firstClipPlaybackRate: 0.5,
} as const;
