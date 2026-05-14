import { describe, it, expect } from 'vitest';
import { renderTitle, renderDescription, renderTemplates } from './templates.js';
import { TemplateError } from './errors.js';
import { TEMPLATE_TEST_CASES } from './templates.test-cases.js';

// ---------------------------------------------------------------------------
// Table-driven: 10 cases covering opponent slug shapes, results, jersey sizes,
// special chars in kid names, and multi-word clubs.
// ---------------------------------------------------------------------------

describe('renderTitle + renderDescription (table-driven)', () => {
  it.each(TEMPLATE_TEST_CASES)('$name', ({ input, expected }) => {
    expect(renderTitle(input)).toBe(expected.title);
    expect(renderDescription(input)).toBe(expected.description);
    expect(renderTemplates(input)).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Non-table assertions (cases 11–19)
// ---------------------------------------------------------------------------

const case1Input = TEMPLATE_TEST_CASES[0]!.input;

describe('renderTitle — character sanity', () => {
  it('11. title uses U+00B7 MIDDLE DOT (not period)', () => {
    const title = renderTitle(case1Input);
    expect(title.includes('·')).toBe(true);
    // Must NOT contain the period-with-spaces pattern
    expect(title.includes(' . ')).toBe(false);
  });

  it('12. title uses U+2013 EN DASH (not hyphen-minus)', () => {
    const title = renderTitle(case1Input);
    expect(title.includes('3–1')).toBe(true);
    expect(title.includes('3-1')).toBe(false);
  });
});

describe('renderDescription — line endings', () => {
  it('13. description uses LF only (no CR)', () => {
    const desc = renderDescription(case1Input);
    expect(desc.includes('\r')).toBe(false);
  });
});

describe('title length sanity', () => {
  it('14. realistic longest-opponent title fits within YouTube 100-char limit (informational)', () => {
    // Use case 5 (SC FC AC) with a longer kid name to probe the upper bound
    const longInput = {
      ...TEMPLATE_TEST_CASES[4]!.input,
      kid: { ...TEMPLATE_TEST_CASES[4]!.input.kid, name: 'Leonardo' },
    };
    const title = renderTitle(longInput);
    expect(title.length).toBeLessThanOrEqual(100);
  });
});

describe('purity', () => {
  it('15. same input twice yields identical output (referential — no clock/random)', () => {
    expect(renderTitle(case1Input)).toBe(renderTitle(case1Input));
    expect(renderDescription(case1Input)).toBe(renderDescription(case1Input));
  });
});

describe('row-count gate', () => {
  it('16. TEMPLATE_TEST_CASES has exactly 10 cases (explicit additions required)', () => {
    expect(TEMPLATE_TEST_CASES.length).toBe(10);
  });
});

describe('defensive shape validation (TemplateError)', () => {
  it('17. empty kid.name throws TemplateError with field kid.name', () => {
    const badInput = {
      ...case1Input,
      kid: { ...case1Input.kid, name: '' },
    };
    expect(() => renderTitle(badInput as Parameters<typeof renderTitle>[0])).toThrow(TemplateError);
    try {
      renderTitle(badInput as Parameters<typeof renderTitle>[0]);
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateError);
      if (err instanceof TemplateError) {
        expect(err.field).toBe('kid.name');
      }
    }
  });

  it('18. invalid game.result throws TemplateError with field game.result', () => {
    const badInput = {
      ...case1Input,
      game: { ...case1Input.game, result: 'X' as 'W' | 'L' | 'D' },
    };
    expect(() => renderDescription(badInput)).toThrow(TemplateError);
    try {
      renderDescription(badInput);
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateError);
      if (err instanceof TemplateError) {
        expect(err.field).toBe('game.result');
      }
    }
  });

  it('19. negative scoreFor throws TemplateError with field game.scoreFor', () => {
    const badInput = {
      ...case1Input,
      game: { ...case1Input.game, scoreFor: -1 },
    };
    expect(() => renderTemplates(badInput)).toThrow(TemplateError);
    try {
      renderTemplates(badInput);
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateError);
      if (err instanceof TemplateError) {
        expect(err.field).toBe('game.scoreFor');
      }
    }
  });
});
