/**
 * Tests for `parseFilename` (PREP-01). Drives all cases via `it.each`
 * against named-const arrays exported from `./filename.test-cases.ts`
 * (and re-exported here for any importer that walks the test file).
 */
import { describe, expect, it } from 'vitest';

import { FilenameError } from './errors.js';
import { FILENAME_REGEX, parseFilename } from './filename.js';
import {
  FILENAME_MALFORMED_CASES,
  FILENAME_VALID_CASES,
  type FilenameMalformedCase,
  type FilenameValidCase,
} from './filename.test-cases.js';

// Re-export so any tooling that imports the test file transitively still
// sees the named consts. The canonical sibling import (used by the
// verify gate) is `./filename.test-cases.js`.
export {
  FILENAME_MALFORMED_CASES,
  FILENAME_VALID_CASES,
  type FilenameMalformedCase,
  type FilenameValidCase,
};

describe('parseFilename: meta-tests on case-array length', () => {
  it('valid cases >= 7', () => {
    expect(FILENAME_VALID_CASES.length).toBeGreaterThanOrEqual(7);
  });

  it('malformed cases >= 13', () => {
    expect(FILENAME_MALFORMED_CASES.length).toBeGreaterThanOrEqual(13);
  });
});

describe('parseFilename: VALID cases', () => {
  it.each(FILENAME_VALID_CASES.map((c) => [c.input, c] as const))(
    '%s',
    (_label, row) => {
      expect(parseFilename(row.input)).toEqual(row.expected);
    },
  );
});

describe('parseFilename: MALFORMED cases', () => {
  it.each(FILENAME_MALFORMED_CASES.map((c) => [c.input, c] as const))(
    '%s',
    (_label, row) => {
      expect(() => parseFilename(row.input)).toThrow(FilenameError);
      expect(() => parseFilename(row.input)).toThrow(
        /YYYY-MM-DD_vs_<slug>_<for>-<against>/,
      );
    },
  );
});

describe('FILENAME_REGEX', () => {
  it('matches the canonical example', () => {
    expect(FILENAME_REGEX.test('2026-05-13_vs_united_3-1')).toBe(true);
  });

  it('rejects the canonical malformed example', () => {
    expect(FILENAME_REGEX.test('badname')).toBe(false);
  });

  it('captures date, opponent, scoreFor, scoreAgainst', () => {
    const m = FILENAME_REGEX.exec('2026-05-12_vs_city-sc_2-2');
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe('2026-05-12');
    expect(m?.[2]).toBe('city-sc');
    expect(m?.[3]).toBe('2');
    expect(m?.[4]).toBe('2');
  });
});
