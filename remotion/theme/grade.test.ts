import { describe, it, expect } from 'vitest';
import { getCinematicGradeStyle, getVignetteOverlayStyle } from './grade.js';

describe('cinematic grade helpers', () => {
  // 1. getCinematicGradeStyle returns filter with all three functions
  it('getCinematicGradeStyle has saturate, contrast, and brightness in filter', () => {
    const style = getCinematicGradeStyle();
    expect(style.filter).toMatch(/saturate\([0-9.]+\)/);
    expect(style.filter).toMatch(/contrast\([0-9.]+\)/);
    expect(style.filter).toMatch(/brightness\([0-9.]+\)/);
  });

  // 2. getCinematicGradeStyle is memoized — same object reference on repeated calls
  it('getCinematicGradeStyle returns same object on repeated calls (memoized)', () => {
    const a = getCinematicGradeStyle();
    const b = getCinematicGradeStyle();
    expect(a).toBe(b);
  });

  // 3. getVignetteOverlayStyle returns correct documented keys
  it('getVignetteOverlayStyle returns correct overlay style keys', () => {
    const style = getVignetteOverlayStyle();
    expect(style.position).toBe('absolute');
    expect(style.inset).toBe(0);
    expect(style.pointerEvents).toBe('none');
    expect(typeof style.background).toBe('string');
  });

  // 4. getVignetteOverlayStyle background is a radial-gradient
  it('getVignetteOverlayStyle background starts with radial-gradient(', () => {
    const style = getVignetteOverlayStyle();
    expect(style.background).toMatch(/^radial-gradient\(/);
  });

  // 5. getVignetteOverlayStyle is memoized — same object reference on repeated calls
  it('getVignetteOverlayStyle returns same object on repeated calls (memoized)', () => {
    const a = getVignetteOverlayStyle();
    const b = getVignetteOverlayStyle();
    expect(a).toBe(b);
  });
});
