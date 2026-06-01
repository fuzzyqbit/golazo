/**
 * instrumentation.ts — Next.js server startup hook.
 *
 * Layer 2 of two-layer localhost-only defense (WEB-03):
 *   Layer 1 (CLI flag): `next dev -H 127.0.0.1` in web/package.json scripts.
 *   Layer 2 (this file): validateHostBinding(process.env.HOST) at startup.
 *
 * Phase 6 Plan 04 addition:
 *   After the HOST guard, this file fire-and-forgets the discovery runtime init
 *   (getDiscoveryRuntime from discoveryRuntime.ts). register() must return
 *   promptly so Next.js finishes booting. Any route that needs the runtime
 *   awaits getDiscoveryRuntime() which returns the in-flight or resolved
 *   singleton. Init failures are logged to console.error — they do NOT crash
 *   the server; non-discovery routes continue to serve normally.
 *
 * Next.js calls register() once on server startup for each runtime that
 * boots (Node.js and Edge separately). We only validate HOST and initialize
 * discovery in the Node.js runtime: Edge runtime does not process the same
 * HOST env var and cannot run better-sqlite3 or chokidar.
 *
 * If validateHostBinding throws (HOST is non-loopback), Next.js reports the
 * error to stderr and exits non-zero — the process terminates cleanly with
 * the WEB-03-tagged message visible to the operator.
 *
 * Decision D-09: Edge runtime skipped — NEXT_RUNTIME guard on line 1 of body.
 * Decision D-10: WEB-03 token in error message is contractually pinned.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Layer 2 of WEB-03: abort startup if HOST is not a loopback address.
  const { validateHostBinding } = await import('./src/lib/hostGuard');
  validateHostBinding(process.env.HOST);

  // Phase 6 Plan 04: initialize the discovery runtime (fire-and-forget).
  // register() must return promptly; discovery init completes asynchronously.
  // Routes that need the runtime await getDiscoveryRuntime() directly.
  const { getDiscoveryRuntime } = await import('./src/lib/discoveryRuntime');
  void getDiscoveryRuntime().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('[discoveryRuntime] init failed:', message);
  });
}
