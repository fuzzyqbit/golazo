/**
 * GET /api/asset/[kid]/[game]/thumb.png
 *
 * Serves the on-disk thumb.png for a valid (kid, game) pair under the
 * golazo storage root. Phase 8 will add episode.mp4/route.ts next to
 * this file using the same [kid]/[game] dynamic segments and the same
 * assertSafeAssetPath helper — drop-in extension, no rewrite needed.
 *
 * Path safety (D-19):
 *   - kid and game segments are validated by assertSafeAssetPath
 *   - Any '..' / '/' / '\\' / '\0' or absolute-path attempt → 403
 *   - Resolved candidate must be strictly inside resolveGolazoRoot() → 403
 *   - Unknown (kid, game) combinations → 404 (file not found on disk)
 *
 * Runtime: nodejs (file system access — cannot run on Edge)
 * Caching: private, max-age=60 (thumb rarely changes; operator sees updates quickly)
 *
 * HTTP surface:
 *   200  OK            — bytes + Content-Type: image/png
 *   403  Forbidden     — path-safety violation
 *   404  Not Found     — game folder or thumb does not exist
 *   405  Method Not Allowed — non-GET method
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolveGolazoRoot } from '@/lib/discoveryRuntime';
import { assertSafeAssetPath, AssetPathError } from '@/lib/ui/assetPath';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ kid: string; game: string }> },
): Promise<Response> {
  const { kid, game } = await ctx.params;

  let thumbPath: string;
  try {
    thumbPath = assertSafeAssetPath(resolveGolazoRoot(), kid, game, 'thumb.png');
  } catch (err) {
    if (err instanceof AssetPathError) {
      return new Response(null, { status: 403 });
    }
    throw err;
  }

  if (!existsSync(thumbPath)) {
    return new Response(null, { status: 404 });
  }

  const bytes = readFileSync(thumbPath);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=60',
    },
  });
}

export async function POST(): Promise<Response> {
  return new Response(null, { status: 405 });
}

export async function PUT(): Promise<Response> {
  return new Response(null, { status: 405 });
}

export async function DELETE(): Promise<Response> {
  return new Response(null, { status: 405 });
}
