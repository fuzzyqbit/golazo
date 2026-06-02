/**
 * GET /api/asset/[kid]/[game]/episode.mp4
 *
 * STUB — Phase 08-01 RED phase. Returns 501 until implementation is complete.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return new Response(null, { status: 501 });
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
