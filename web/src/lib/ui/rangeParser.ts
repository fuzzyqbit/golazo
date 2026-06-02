/**
 * rangeParser.ts — Pure RFC 7233 single-range header parser.
 *
 * Zero dependencies: no node:*, no React, no next/* imports.
 * This module is imported by the episode.mp4 route handler in Phase 8.
 *
 * Supports:
 *   bytes=start-end   — normal range (inclusive)
 *   bytes=start-      — open-ended (start to EOF)
 *   bytes=-N          — suffix (last N bytes)
 *
 * Rejects:
 *   - Multi-range comma forms (e.g. bytes=0-99,100-199)
 *   - Non-bytes units
 *   - Malformed / non-numeric values
 *   - end < start
 *
 * Returns:
 *   RangeRequest    — valid, satisfiable range (end clamped to totalSize-1 if needed)
 *   'unsatisfiable' — valid syntax but start >= totalSize, or zero-length suffix
 *   null            — no Range header, malformed, or unsupported form
 *
 * RFC 7233 §2.1 note: malformed Range headers MUST be treated as absent (→ null/200).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Inclusive byte range for a streaming response. */
export type RangeRequest = {
  start: number;
  end: number;
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Parse an HTTP Range header for a single byte range.
 *
 * @param header    The raw Range header value (or null/undefined if absent).
 * @param totalSize Total size of the resource in bytes.
 * @returns         RangeRequest if the range is satisfiable, 'unsatisfiable' if valid
 *                  syntax but out-of-bounds, null if absent or malformed.
 */
export function parseRangeHeader(
  header: string | null | undefined,
  totalSize: number,
): RangeRequest | 'unsatisfiable' | null {
  // Absent header → treat as no Range header
  if (header == null || header === '') return null;

  // Must start with 'bytes='
  if (!header.startsWith('bytes=')) return null;

  const rangeSpec = header.slice('bytes='.length);

  // Reject multi-range (comma present)
  if (rangeSpec.includes(',')) return null;

  // Suffix range: bytes=-N
  if (rangeSpec.startsWith('-')) {
    const suffixLenStr = rangeSpec.slice(1);
    if (!/^\d+$/.test(suffixLenStr)) return null;
    const suffixLen = parseInt(suffixLenStr, 10);
    // Zero-length suffix is unsatisfiable
    if (suffixLen === 0) return 'unsatisfiable';
    // Clamp to full file if suffix is larger than file
    const start = suffixLen >= totalSize ? 0 : totalSize - suffixLen;
    return { start, end: totalSize - 1 };
  }

  // Normal range: bytes=start-[end]
  const dashIdx = rangeSpec.indexOf('-');
  if (dashIdx === -1) return null;

  const startStr = rangeSpec.slice(0, dashIdx);
  const endStr = rangeSpec.slice(dashIdx + 1);

  // Start must be numeric
  if (!/^\d+$/.test(startStr)) return null;
  const start = parseInt(startStr, 10);

  // Open-ended range: bytes=start-
  if (endStr === '') {
    // Unsatisfiable if start is at or beyond file size
    if (start >= totalSize) return 'unsatisfiable';
    return { start, end: totalSize - 1 };
  }

  // Explicit end: bytes=start-end
  if (!/^\d+$/.test(endStr)) return null;
  const endRaw = parseInt(endStr, 10);

  // end must be >= start (RFC 7233 §2.1)
  if (endRaw < start) return null;

  // Unsatisfiable if start is at or beyond file size
  if (start >= totalSize) return 'unsatisfiable';

  // Clamp end to totalSize - 1
  const end = Math.min(endRaw, totalSize - 1);
  return { start, end };
}
