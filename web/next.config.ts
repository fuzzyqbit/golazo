import type { NextConfig } from 'next';

const config: NextConfig = {
  /**
   * serverExternalPackages: tell Turbopack/webpack NOT to bundle these packages.
   * They are required for the server-side discovery runtime (Plan 04):
   *
   * - better-sqlite3: native Node.js addon (.node binary) — cannot be bundled
   * - chokidar: depends on fsevents (macOS native .node) — ESM chunk incompatible
   *
   * Both packages are Node.js-only and run exclusively on the server (in the
   * Node.js runtime). Marking them external causes Next.js to require() them
   * at runtime from node_modules instead of statically inlining them into the
   * build output. This is the standard Next.js pattern for native addons.
   *
   * Reference: https://nextjs.org/docs/app/api-reference/next-config-js/serverExternalPackages
   */
  serverExternalPackages: ['better-sqlite3', 'chokidar'],
};

export default config;
