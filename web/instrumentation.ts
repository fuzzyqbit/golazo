/**
 * instrumentation.ts — Next.js server startup hook (Layer 2 of two-layer
 * localhost-only defense, WEB-03).
 *
 * Next.js calls register() once on server startup for each runtime that
 * boots (Node.js and Edge separately). We only validate HOST in the Node.js
 * runtime: Edge runtime does not process the same HOST env var and aborting
 * in the Edge bootstrap produces confusing dev errors.
 *
 * Layer 1 (CLI flag): `next dev -H 127.0.0.1` in web/package.json scripts.
 * Layer 2 (this file): validateHostBinding(process.env.HOST) at startup.
 *
 * If validateHostBinding throws (HOST is non-loopback), Next.js reports the
 * error to stderr and exits non-zero — the process terminates cleanly with
 * the WEB-03-tagged message visible to the operator.
 *
 * Decision D-09: Edge runtime skipped — see SUMMARY.md.
 * Decision D-10: WEB-03 token in error message is contractually pinned.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { validateHostBinding } = await import('./src/lib/hostGuard');
  validateHostBinding(process.env.HOST);
}
