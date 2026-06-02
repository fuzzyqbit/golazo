/**
 * GET /api/asset/[kid]/[game]/episode.mp4
 *
 * Streams the on-disk episode.mp4 for a valid (kid, game) pair under the
 * golazo storage root. Supports HTTP Range requests (RFC 7233 single-range)
 * for browser video seeking via the <video> element.
 *
 * Path safety (D-19, T-08-01):
 *   - kid and game segments are validated by assertSafeAssetPath (Phase 7)
 *   - Any '..' / '/' / '\\' / '\0' or absolute-path attempt → 403
 *   - Resolved candidate must be strictly inside resolveGolazoRoot() → 403
 *   - Unknown (kid, game) combinations or missing episode.mp4 → 404
 *
 * Range support (T-08-02):
 *   - No Range header → 200 full file with Accept-Ranges: bytes
 *   - Range: bytes=start-end → 206 Partial Content with Content-Range
 *   - Unsatisfiable Range → 416 Range Not Satisfiable with Content-Range: bytes star/size
 *   - Malformed Range → 200 full (RFC 7233 s2.1: treat as absent)
 *
 * HTTP surface:
 *   200  OK                  — full bytes + video/mp4
 *   206  Partial Content     — byte range + Content-Range
 *   403  Forbidden           — path-safety violation (T-08-01, T-08-03)
 *   404  Not Found           — game folder or episode.mp4 does not exist
 *   405  Method Not Allowed  — non-GET method (T-08-04)
 *   416  Range Not Satisfiable — valid but unsatisfiable Range header (T-08-02)
 *
 * Runtime: nodejs (file system access — cannot run on Edge)
 * Caching: private, max-age=60 — matches thumb.png policy; operator sees re-renders quickly
 */

import { existsSync, statSync, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { resolveGolazoRoot } from '@/lib/discoveryRuntime';
import { assertSafeAssetPath, AssetPathError } from '@/lib/ui/assetPath';
import { parseRangeHeader } from '@/lib/ui/rangeParser';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  ctx: { params: Promise<{ kid: string; game: string }> },
): Promise<Response> {
  const { kid, game } = await ctx.params;

  // --- Path safety (T-08-01) ---
  let episodePath: string;
  try {
    episodePath = assertSafeAssetPath(resolveGolazoRoot(), kid, game, 'episode.mp4');
  } catch (err) {
    if (err instanceof AssetPathError) {
      return new Response(null, { status: 403 });
    }
    throw err;
  }

  // --- File existence check ---
  if (!existsSync(episodePath)) {
    return new Response(null, { status: 404 });
  }

  const size = statSync(episodePath).size;

  // --- Range header parsing (T-08-02) ---
  const rangeHeader = req.headers.get('range');
  const rangeResult = parseRangeHeader(rangeHeader, size);

  // Unsatisfiable range → 416
  if (rangeResult === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${size}`,
      },
    });
  }

  // Valid partial range → 206
  if (rangeResult !== null) {
    const { start, end } = rangeResult;
    const chunkSize = end - start + 1;

    const nodeStream = createReadStream(episodePath, { start, end });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=60',
      },
    });
  }

  // No Range header (or malformed → treated as null → 200 full) — stream full file
  const nodeStream = createReadStream(episodePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=60',
    },
  });
}

// ---------------------------------------------------------------------------
// Non-GET method stubs (T-08-04)
// ---------------------------------------------------------------------------

export async function POST(): Promise<Response> {
  return new Response(null, { status: 405 });
}

export async function PUT(): Promise<Response> {
  return new Response(null, { status: 405 });
}

export async function DELETE(): Promise<Response> {
  return new Response(null, { status: 405 });
}
