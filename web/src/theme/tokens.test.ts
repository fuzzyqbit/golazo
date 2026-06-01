/**
 * Theme tokens unit tests — pins COLORS, TYPOGRAPHY, and SPACING values.
 *
 * Cases 1-6: Assert mirrored values match remotion/theme/tokens.ts counterparts.
 * Cases 7-8: Assert SPACING is a monotone-increasing rem scale.
 * Cases 9-10: Mirror-detection — read web/src/fonts.ts as text and assert
 *   the font family name strings appear (does NOT import fonts.ts at test time,
 *   which would require a Next.js runtime; reads as text to detect name drift).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COLORS, TYPOGRAPHY, SPACING } from './tokens.js';

const fontsPath = fileURLToPath(new URL('../fonts.ts', import.meta.url));
const fontsSource = readFileSync(fontsPath, 'utf8');

describe('COLORS — mirrored from remotion/theme/tokens.ts', () => {
  it('case 1: COLORS.background matches remotion value', () => {
    expect(COLORS.background).toBe('#0a0a0a');
  });

  it('case 2: COLORS.foreground matches remotion value', () => {
    expect(COLORS.foreground).toBe('#f5f1e8');
  });

  it('case 3: COLORS.accentDefault matches remotion value', () => {
    expect(COLORS.accentDefault).toBe('#ffce5a');
  });
});

describe('TYPOGRAPHY — web uses CSS variables (not literal family names)', () => {
  it('case 4: TYPOGRAPHY.display.family is the CSS variable, not a literal family name', () => {
    expect(TYPOGRAPHY.display.family).toBe('var(--font-display)');
  });

  it('case 5: TYPOGRAPHY.label.family is the CSS variable for the label font', () => {
    expect(TYPOGRAPHY.label.family).toBe('var(--font-label)');
  });

  it('case 6: TYPOGRAPHY.display.style is italic', () => {
    expect(TYPOGRAPHY.display.style).toBe('italic');
  });
});

describe('SPACING — monotone-increasing rem scale', () => {
  it('case 7: SPACING values are monotone-increasing (xs < sm < md < lg < xl < xxl)', () => {
    const values = Object.values(SPACING).map((v) =>
      parseFloat((v as string).replace('rem', '')),
    );
    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1];
      const curr = values[i];
      if (prev === undefined || curr === undefined) {
        throw new Error(`SPACING value at index ${i} or ${i - 1} is undefined`);
      }
      expect(curr).toBeGreaterThan(prev);
    }
  });

  it('case 8: every SPACING value matches /^[0-9.]+rem$/ and parses to > 0', () => {
    for (const [key, value] of Object.entries(SPACING)) {
      expect(value).toMatch(/^[0-9.]+rem$/);
      const parsed = parseFloat((value as string).replace('rem', ''));
      expect(parsed, `SPACING.${key} should parse as > 0`).toBeGreaterThan(0);
    }
  });
});

describe('Mirror-detection — fonts.ts must contain the expected family name strings', () => {
  it('case 9: fonts.ts contains "Cormorant Garamond" (same family name Remotion uses)', () => {
    expect(fontsSource).toContain('Cormorant Garamond');
  });

  it('case 10: fonts.ts contains "Inter" (family name for Inter Regular + Bold)', () => {
    expect(fontsSource).toContain('Inter');
  });
});
