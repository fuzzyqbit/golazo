/**
 * GET /api/debug/discovery — returns the discovery runtime status snapshot.
 *
 * Used by:
 *   1. Plan 04 integration smoke test (polls episodeCount during startup)
 *   2. Future Phase 7 dev banner (surfaces WarningBag counts to the operator)
 *
 * Access control: localhost-bind is the gate (WEB-02 + WEB-03 from Plan 05-03).
 * No auth token required — this route is not reachable from the internet.
 *
 * Response shape: DiscoveryRuntimeStatus (from web/src/lib/discoveryRuntime.ts)
 *   { rootPath, dbPath, episodeCount, warnings: { brokenFolders, invalidManifests,
 *     invalidPublishRecords }, watcherReady, rootMissing }
 *
 * `export const runtime = 'nodejs'` is required: better-sqlite3 and chokidar
 * cannot run on the Edge runtime — the route handler must execute in Node.js.
 *
 * `export const dynamic = 'force-dynamic'` defeats Next.js route caching —
 * each call reflects the live state of the discovery runtime at that moment.
 */
import { getDiscoveryRuntimeStatus } from '@/lib/discoveryRuntime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const status = await getDiscoveryRuntimeStatus();
  return Response.json(status);
}
