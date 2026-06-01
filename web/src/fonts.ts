import localFont from 'next/font/local';

/**
 * Display font — Cormorant Garamond Italic.
 *
 * Source: remotion/assets/fonts/CormorantGaramond-Italic.ttf — the SAME
 * .ttf file Remotion compositions use; committed by Plan 02-01. next/font/local
 * resolves the `src` path relative to THIS file (web/src/fonts.ts) — so
 * `../../remotion/assets/fonts/CormorantGaramond-Italic.ttf` traverses up to
 * the repo root and into the shared assets directory. No duplication.
 *
 * The Cormorant Garamond Italic weight-400 face is the same one Plan 02-01
 * documented in remotion/assets/fonts/README.md.
 *
 * display: 'block' — headlines should wait for the typographically-distinctive
 * Cormorant Garamond Italic; a flash of fallback serif is more disruptive than
 * a brief invisible slot while the font loads (D-15).
 */
export const displayFont = localFont({
  src: '../../remotion/assets/fonts/CormorantGaramond-Italic.ttf',
  weight: '400',
  style: 'italic',
  variable: '--font-display',
  display: 'block',
  preload: true,
});

/**
 * Label font — Inter Regular (400) + Inter Bold (700).
 *
 * next/font/local accepts an array for multiple weight/style combinations.
 * Both Inter-Regular.ttf and Inter-Bold.ttf are committed under
 * remotion/assets/fonts/ by Plan 02-01.
 *
 * display: 'swap' — body text can flash from a fallback (system-ui) to Inter
 * without visual jarring; legibility during the preload window matters more
 * than typographic fidelity (D-15).
 */
export const labelFont = localFont({
  src: [
    {
      path: '../../remotion/assets/fonts/Inter-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../remotion/assets/fonts/Inter-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-label',
  display: 'swap',
  preload: true,
});

/**
 * Convenience: concatenated CSS class names for both font variables.
 * Apply to <html> in the root layout so all descendant elements can use
 * `font-family: var(--font-display)` or `var(--font-label)`.
 */
export const fontVariables = `${displayFont.variable} ${labelFont.variable}`;
