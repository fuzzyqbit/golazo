/**
 * hostGuard.ts — Pure host-binding validator (Layer 2, WEB-03).
 *
 * No Node.js runtime side effects at module-load time.
 * No Next.js imports. Safe to import in unit tests without a server context.
 *
 * Contract: throws an Error with the literal `WEB-03` token when the provided
 * HOST value is not a recognised loopback address. The token is pinned by the
 * integration test so future refactors MUST preserve it.
 */

export const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'] as const;

export type LoopbackHost = (typeof LOOPBACK_HOSTS)[number];

/**
 * Validate that the resolved HOST value is loopback-only.
 *
 * Allowed values (case-insensitive after trim):
 *   - undefined (Next.js default behaviour applies — combined with the
 *     -H 127.0.0.1 flag in package.json dev/start scripts, the effective
 *     bind is still loopback)
 *   - '' (empty string; treated the same as undefined)
 *   - any value in LOOPBACK_HOSTS
 *
 * Throws Error with message:
 *   `WEB-03: refusing to bind to non-loopback HOST '<host>'. Set HOST=127.0.0.1 (or unset) to start the web app.`
 *
 * The 'WEB-03' literal in the message is contractually pinned (integration
 * test asserts it). Future refactors MUST preserve this token.
 */
export function validateHostBinding(host: string | undefined): void {
  const normalised = (host ?? '').trim().toLowerCase();
  if (normalised === '') return;
  if (LOOPBACK_HOSTS.some((h) => h.toLowerCase() === normalised)) return;
  throw new Error(
    `WEB-03: refusing to bind to non-loopback HOST '${host ?? ''}'. Set HOST=127.0.0.1 (or unset) to start the web app.`,
  );
}
