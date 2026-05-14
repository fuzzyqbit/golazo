import { describe, it, expect } from 'vitest';
import { COLORS, TYPOGRAPHY, LAYOUT, MOTION } from './tokens.js';

describe('theme tokens', () => {
  // 1. Pinned color defaults
  it('COLORS has correct pinned default values', () => {
    expect(COLORS.background).toBe('#0a0a0a');
    expect(COLORS.foreground).toBe('#f5f1e8');
    expect(COLORS.accentDefault).toBe('#ffce5a');
  });

  // 2. Typography families and styles
  it('TYPOGRAPHY display is Cormorant Garamond italic', () => {
    expect(TYPOGRAPHY.display.family).toBe('Cormorant Garamond');
    expect(TYPOGRAPHY.display.style).toBe('italic');
    expect(TYPOGRAPHY.label.family).toBe('Inter');
  });

  // 3. Visual hierarchy: hero font size must be larger than sub
  it('TYPOGRAPHY hero size is larger than sub (visual hierarchy)', () => {
    expect(TYPOGRAPHY.sizes.hero).toBeGreaterThan(TYPOGRAPHY.sizes.sub);
  });

  // 4. Layout output resolution pinned to 1920x1080
  it('LAYOUT pins 1920x1080 output resolution', () => {
    expect(LAYOUT.width).toBe(1920);
    expect(LAYOUT.height).toBe(1080);
  });

  // 5. Motion fps and firstClipPlaybackRate (REN-01 slo-mo opener)
  it('MOTION fps is 30 and firstClipPlaybackRate is 0.5 (slo-mo opener)', () => {
    expect(MOTION.fps).toBe(30);
    expect(MOTION.firstClipPlaybackRate).toBe(0.5);
  });

  // 6. Non-zero frame counts sanity check
  it('MOTION titleCardFrames and outroFrames are positive', () => {
    expect(MOTION.titleCardFrames).toBeGreaterThan(0);
    expect(MOTION.outroFrames).toBeGreaterThan(0);
  });

  // 7. Table-driven: every COLORS value is a valid CSS color string
  const colorPattern = /^(#[0-9a-fA-F]{6}|rgba?\([^)]+\))$/;

  it.each(
    Object.entries(COLORS).filter(([, v]) => typeof v === 'string') as [string, string][]
  )('COLORS.%s (%s) is a valid CSS color string', (_key, value) => {
    expect(value).toMatch(colorPattern);
  });

  // 8. Compile-time-only assertion: tokens are `as const` (mutation is rejected by TS)
  it('COLORS is exported (compile-time const assertion covered by ts-expect-error below)', () => {
    expect(COLORS).toBeDefined();
  });
});

// Compile-time-only assertion that tokens are `as const`.
// @ts-expect-error - mutation should be rejected at the type layer
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
if (false) { COLORS.background = 'oops'; }
