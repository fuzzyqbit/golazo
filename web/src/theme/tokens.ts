/**
 * Web-side theme constants. Values for COLORS and TYPOGRAPHY are deliberately
 * mirrored from remotion/theme/tokens.ts — NOT imported across the boundary,
 * because the two trees compile under different tsconfig contexts (Remotion's
 * NodeNext + React vs web's bundler + Next.js). Drift detection lives in
 * web/src/theme/tokens.test.ts, which asserts the mirrored values explicitly.
 *
 * Omissions (deliberate):
 *   - LAYOUT (1920×1080) — render-only; web is responsive/viewport-driven
 *   - MOTION (fps, frame counts) — render-only; web doesn't animate at
 *     frame-granular precision
 *   - TYPOGRAPHY.sizes (px-at-1920×1080) — web uses rem-based scale
 *
 * Additions (web-only):
 *   - SPACING (rem-based scale) — web's layout spacing rhythm; Phase 6+
 *     list-view padding, gap, and card-spacing all pull from here.
 */

/**
 * Color palette — mirrors remotion/theme/tokens.ts for the subset web uses.
 * cardBg, border, and muted are web-specific additions (no Remotion equivalent).
 */
export const COLORS = {
  background: '#0a0a0a',
  foreground: '#f5f1e8',
  accentDefault: '#ffce5a',
  cardBg: '#0e0e0e',
  border: 'rgba(245, 241, 232, 0.12)',  // foreground at 12% — divider lines
  muted: 'rgba(245, 241, 232, 0.6)',    // secondary text
} as const;

/**
 * Typography roles — web uses CSS variables (next/font injects the @font-face
 * and resolves the variable to the loaded font family at runtime).
 * Values deliberately reference var(--font-display) / var(--font-label) instead
 * of the literal family names 'Cormorant Garamond' / 'Inter' to ensure all CSS
 * lookups go through next/font's variable mechanism.
 */
export const TYPOGRAPHY = {
  display: { family: 'var(--font-display)', weight: 400, style: 'italic' as const },
  label: { family: 'var(--font-label)', weight: 400, style: 'normal' as const },
  labelBold: { family: 'var(--font-label)', weight: 700, style: 'normal' as const },
  letterSpacing: { display: '0.02em', label: '0.16em' },
} as const;

/**
 * Spacing scale — rem-based, monotone-increasing.
 * Phase 6+ list-view padding, gap, and card-spacing pull from here.
 * CSS Modules hand-mirror these values (CSS can't import TS); SPACING is
 * the TypeScript source of truth for Phase 7 component props.
 */
export const SPACING = {
  xs:  '0.25rem',  //  4px
  sm:  '0.5rem',   //  8px
  md:  '1rem',     // 16px
  lg:  '1.5rem',   // 24px
  xl:  '2.5rem',   // 40px
  xxl: '4rem',     // 64px
} as const;
