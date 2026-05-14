/**
 * Barrel re-export for the remotion/theme module.
 *
 * Single import point for Remotion compositions and the render driver:
 *   import { COLORS, TYPOGRAPHY, LAYOUT, MOTION, loadFonts, getCinematicGradeStyle, getVignetteOverlayStyle } from '../theme/index.js';
 *
 * NodeNext module resolution requires the `.js` extension in import specifiers
 * even though the source files are `.ts`.
 */
export * from './tokens.js';
export * from './fonts.js';
export * from './grade.js';
