/**
 * rangeParser.test.ts — Table-driven unit tests for parseRangeHeader.
 *
 * Covers all branches of RFC 7233 single-range semantics:
 *   - Normal range (start-end)
 *   - Open-ended range (start-)
 *   - Suffix range (-N last bytes)
 *   - End clamping (end > totalSize-1 → clamped)
 *   - Unsatisfiable (start >= totalSize, or zero-length suffix)
 *   - Malformed / rejected: non-bytes unit, multi-range, end < start,
 *     non-numeric, empty string, undefined/null
 */

import { describe, it, expect } from 'vitest';
import { parseRangeHeader } from './rangeParser.js';
import type { RangeRequest } from './rangeParser.js';

// ---------------------------------------------------------------------------
// Test table
// ---------------------------------------------------------------------------

type Case = {
  name: string;
  header: string | null | undefined;
  totalSize: number;
  expected: RangeRequest | 'unsatisfiable' | null;
};

const CASES: Case[] = [
  // Normal single range
  {
    name: 'normal range bytes=0-99 out of 1000',
    header: 'bytes=0-99',
    totalSize: 1000,
    expected: { start: 0, end: 99 },
  },
  {
    name: 'normal range bytes=500-599 out of 1000',
    header: 'bytes=500-599',
    totalSize: 1000,
    expected: { start: 500, end: 599 },
  },

  // Open-ended range (start-)
  {
    name: 'open-ended bytes=0- returns full range',
    header: 'bytes=0-',
    totalSize: 1000,
    expected: { start: 0, end: 999 },
  },
  {
    name: 'open-ended bytes=100- returns start to end-of-file',
    header: 'bytes=100-',
    totalSize: 1000,
    expected: { start: 100, end: 999 },
  },

  // Suffix range (-N)
  {
    name: 'suffix bytes=-500 out of 1000 returns last 500 bytes',
    header: 'bytes=-500',
    totalSize: 1000,
    expected: { start: 500, end: 999 },
  },
  {
    name: 'suffix bytes=-1 returns last byte',
    header: 'bytes=-1',
    totalSize: 1000,
    expected: { start: 999, end: 999 },
  },
  {
    name: 'suffix bytes=-1500 with totalSize 1000 clamps to full file',
    header: 'bytes=-1500',
    totalSize: 1000,
    expected: { start: 0, end: 999 },
  },

  // End clamping
  {
    name: 'end clamp: bytes=0-9999 with totalSize 1000 clamps end to 999',
    header: 'bytes=0-9999',
    totalSize: 1000,
    expected: { start: 0, end: 999 },
  },

  // Unsatisfiable
  {
    name: 'unsatisfiable: start >= totalSize (bytes=1000-2000, size=1000)',
    header: 'bytes=1000-2000',
    totalSize: 1000,
    expected: 'unsatisfiable',
  },
  {
    name: 'unsatisfiable: start exactly at size (bytes=999-999, size=999)',
    header: 'bytes=999-999',
    totalSize: 999,
    expected: 'unsatisfiable',
  },
  {
    name: 'unsatisfiable: zero-length suffix bytes=-0',
    header: 'bytes=-0',
    totalSize: 1000,
    expected: 'unsatisfiable',
  },

  // Malformed → null
  {
    name: 'null input returns null (no Range header)',
    header: null,
    totalSize: 1000,
    expected: null,
  },
  {
    name: 'undefined input returns null',
    header: undefined,
    totalSize: 1000,
    expected: null,
  },
  {
    name: 'empty string returns null',
    header: '',
    totalSize: 1000,
    expected: null,
  },
  {
    name: 'wrong unit (items=0-99) returns null',
    header: 'items=0-99',
    totalSize: 1000,
    expected: null,
  },
  {
    name: 'multi-range (bytes=0-99,100-199) returns null (multi-range not supported)',
    header: 'bytes=0-99,100-199',
    totalSize: 1000,
    expected: null,
  },
  {
    name: 'end < start (bytes=100-99) returns null',
    header: 'bytes=100-99',
    totalSize: 1000,
    expected: null,
  },
  {
    name: 'non-numeric start (bytes=abc-99) returns null',
    header: 'bytes=abc-99',
    totalSize: 1000,
    expected: null,
  },
  {
    name: 'non-numeric end (bytes=0-xyz) returns null',
    header: 'bytes=0-xyz',
    totalSize: 1000,
    expected: null,
  },
  {
    name: 'missing equals sign (bytes 0-99) returns null',
    header: 'bytes 0-99',
    totalSize: 1000,
    expected: null,
  },
];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('parseRangeHeader', () => {
  it.each(CASES)('$name', ({ header, totalSize, expected }) => {
    const result = parseRangeHeader(header, totalSize);
    expect(result).toEqual(expected);
  });
});
