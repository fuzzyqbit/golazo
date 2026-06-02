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
 *   RangeRequest  — valid, satisfiable range (end clamped to totalSize-1 if needed)
 *   'unsatisfiable' — valid syntax but start >= totalSize, or zero-length suffix
 *   null           — no Range header, malformed, or unsupported form
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
// STUB — implementation not yet written (RED phase)
// ---------------------------------------------------------------------------

export function parseRangeHeader(
  _header: string | null | undefined,
  _totalSize: number,
): RangeRequest | 'unsatisfiable' | null {
  throw new Error('parseRangeHeader: not implemented');
}
