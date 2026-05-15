/**
 * QA-01 table-driven coverage audit.
 *
 * Asserts that the four mandated table-driven unit-test files exist and that
 * their case-count constants meet the minimums established by Plans 01-02,
 * 01-03, 02-02, and 03-02.
 *
 * Minimums (sourced from prior-phase plan SUMMARIES):
 *   - filename (valid + malformed combined): >= 8
 *     (Plan 01-03: valid >= 1 + malformed >= 7)
 *   - channels: >= 6  (Plan 01-02)
 *   - templates: >= 6  (Plan 03-02)
 *   - musicPicker determinism (inline it() blocks): >= 5  (Plan 02-02)
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo root relative to this file's location (tests/integration/ → ../..)
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(__filename, '..', '..', '..');

// ---------------------------------------------------------------------------
// Imports of table-driven case arrays
// ---------------------------------------------------------------------------

import {
  FILENAME_VALID_CASES,
  FILENAME_MALFORMED_CASES,
} from '../../src/prepare/filename.test-cases.js';

import { CHANNELS_TEST_CASES } from '../../src/config/channels.test-cases.js';

import { TEMPLATE_TEST_CASES } from '../../src/publish/templates.test-cases.js';

// ---------------------------------------------------------------------------
// Music-picker: cases are inline in the test file (no *.test-cases.ts sibling)
// Count `it(` occurrences excluding comment lines.
// ---------------------------------------------------------------------------

function countMusicPickerItBlocks(): number {
  const filePath = join(REPO_ROOT, 'src', 'render', 'musicPicker.test.ts');
  const content = readFileSync(filePath, 'utf8');
  const matches = content.match(/^\s*it\(/gm);
  return matches ? matches.length : 0;
}

// ---------------------------------------------------------------------------
// Minimums (pinned from prior-phase plan SUMMARIES)
// ---------------------------------------------------------------------------

const MIN_FILENAME_TOTAL = 8; // valid(>=1) + malformed(>=7) per Plan 01-03
const MIN_CHANNELS = 6; // Plan 01-02
const MIN_TEMPLATES = 6; // Plan 03-02
const MIN_MUSIC_PICKER_IT_BLOCKS = 5; // Plan 02-02

// ---------------------------------------------------------------------------
// describe block
// ---------------------------------------------------------------------------

describe('QA-01 table-driven coverage audit', () => {
  // Existence gate — all four test files must exist on disk
  it('all four QA-01 test files exist', () => {
    const testFiles = [
      'src/prepare/filename.test.ts',
      'src/config/channels.test.ts',
      'src/render/musicPicker.test.ts',
      'src/publish/templates.test.ts',
    ];
    for (const rel of testFiles) {
      const abs = join(REPO_ROOT, rel);
      expect(
        existsSync(abs),
        `QA-01: test file missing from repository: ${rel}`,
      ).toBe(true);
    }
  });

  // Filename: sum of valid + malformed cases
  it('filename test cases meet minimum (>= 8 total)', () => {
    const total = FILENAME_VALID_CASES.length + FILENAME_MALFORMED_CASES.length;
    expect(
      total,
      `QA-01: filename test cases below minimum (${MIN_FILENAME_TOTAL}); ` +
        `update src/prepare/filename.test-cases.ts (valid: ${FILENAME_VALID_CASES.length}, ` +
        `malformed: ${FILENAME_MALFORMED_CASES.length}, total: ${total})`,
    ).toBeGreaterThanOrEqual(MIN_FILENAME_TOTAL);
  });

  // Channels: CHANNELS_TEST_CASES array length
  it('channels test cases meet minimum (>= 6)', () => {
    expect(
      CHANNELS_TEST_CASES.length,
      `QA-01: channels test cases below minimum (${MIN_CHANNELS}); ` +
        `update src/config/channels.test-cases.ts`,
    ).toBeGreaterThanOrEqual(MIN_CHANNELS);
  });

  // Templates: TEMPLATE_TEST_CASES array length
  it('templates test cases meet minimum (>= 6)', () => {
    expect(
      TEMPLATE_TEST_CASES.length,
      `QA-01: templates test cases below minimum (${MIN_TEMPLATES}); ` +
        `update src/publish/templates.test-cases.ts`,
    ).toBeGreaterThanOrEqual(MIN_TEMPLATES);
  });

  // Music-picker: it() block count via readFileSync (cases are inline, no sibling)
  it('musicPicker determinism block has >= 5 it() cases', () => {
    const count = countMusicPickerItBlocks();
    expect(
      count,
      `QA-01: musicPicker.test.ts has fewer than ${MIN_MUSIC_PICKER_IT_BLOCKS} it() blocks ` +
        `(found ${count}); add more determinism cases to src/render/musicPicker.test.ts`,
    ).toBeGreaterThanOrEqual(MIN_MUSIC_PICKER_IT_BLOCKS);
  });
});
