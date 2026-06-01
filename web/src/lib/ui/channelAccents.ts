/**
 * channelAccents.ts — server-side helper that loads channels.yaml once and
 * exposes a typed { [kidKey: string]: hexAccent } map for Server Components.
 *
 * Purpose: UI-02 requires per-kid accent color chips. The accent hex lives in
 * channels.yaml. Loading server-side (a) avoids shipping yaml parser to the
 * client, (b) lets page.tsx pass the typed map as a serializable prop to the
 * client component, (c) means a missing channels.yaml does NOT crash the list
 * view — it falls back to an empty map, and accentFor() falls back to the
 * COLORS.accentDefault token.
 *
 * Path resolution order:
 *   1. opts.channelsPath (explicit — for tests and one-off overrides)
 *   2. GOLAZO_CHANNELS_PATH env var (if set and non-empty)
 *   3. path.resolve('./channels.yaml') — default, resolved against process.cwd()
 *      (which is the repo root when running `npm run web:dev` from repo root)
 *
 * CRITICAL: loadChannelsFile is called with skipTokenCheck: true so the UI
 * does NOT require OAuth token files to exist on disk. Token files are only
 * needed for the CLI publish path, not for rendering the browse surface.
 *
 * Server-only: uses fs (via the cli loader). Do NOT import from a Client Component.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadChannelsFile } from '@golazo/cli/dist/config/channels.js';
import type { ChannelsFile } from '@golazo/cli/dist/config/types.js';

import { COLORS } from '../../theme/tokens';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Map of kid key → accent hex string (e.g. { leo: '#ffce5a', mateo: '#5acfff' }). */
export type ChannelAccentMap = Record<string, string>;

// ---------------------------------------------------------------------------
// resolveChannelsPath
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path to channels.yaml.
 *
 * Resolution order:
 *   1. env.GOLAZO_CHANNELS_PATH (if set and non-empty) — passed through as-is
 *      (path.resolve on an absolute path is a no-op; relative paths become
 *      absolute against process.cwd() if the caller passes one).
 *   2. path.resolve('./channels.yaml') — the default, relative to process.cwd().
 *
 * Accepts an explicit env map for testability; defaults to process.env.
 */
export function resolveChannelsPath(
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.GOLAZO_CHANNELS_PATH && env.GOLAZO_CHANNELS_PATH.trim() !== '') {
    return env.GOLAZO_CHANNELS_PATH;
  }
  return resolve('./channels.yaml');
}

// ---------------------------------------------------------------------------
// getChannelAccents
// ---------------------------------------------------------------------------

/**
 * Load channels.yaml and return a { [kidKey]: accentHex } map.
 *
 * Async to match the Server Component await pattern even though the underlying
 * loader is synchronous (allows future migration to async I/O without API churn).
 *
 * Error contract:
 *   - Missing channels.yaml: returns {} (graceful degradation — UI must not 500)
 *   - Malformed yaml or schema error: catches ChannelsConfigError, logs to
 *     console.error, returns {} (same graceful degradation)
 *   - Any other unexpected error: re-throws (not a known-graceful failure)
 *
 * @param opts.channelsPath - Override path for testing or explicit config.
 *   If omitted, resolveChannelsPath() is called with process.env.
 */
export async function getChannelAccents(opts?: {
  channelsPath?: string;
}): Promise<ChannelAccentMap> {
  const channelsPath = opts?.channelsPath ?? resolveChannelsPath();

  // Pre-check existence — avoids parsing the error message and gives us a
  // clean, deterministic fast path for the missing-file case.
  if (!existsSync(channelsPath)) {
    return {};
  }

  let channelsFile: ChannelsFile;
  try {
    channelsFile = loadChannelsFile({ path: channelsPath, skipTokenCheck: true });
  } catch (err) {
    // ChannelsConfigError covers: yaml parse error, zod validation failure.
    // Log to console.error so the operator can see it in Next.js server logs
    // without crashing the UI (mirrors discoveryRuntime error handling pattern).
    console.error('[channelAccents] failed to load channels.yaml:', err);
    return {};
  }

  // Reduce to { kidKey: accent } — only the accent hex is needed by the UI.
  const map: ChannelAccentMap = {};
  for (const [kidKey, entry] of Object.entries(channelsFile)) {
    if (entry) {
      map[kidKey] = entry.accent;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// accentFor
// ---------------------------------------------------------------------------

/**
 * Synchronous accent lookup with a guaranteed fallback.
 *
 * Returns map[kidKey] when present; falls back to COLORS.accentDefault (the
 * named token, never a magic inline hex) so the UI always renders a valid color.
 */
export function accentFor(map: ChannelAccentMap, kidKey: string): string {
  return map[kidKey] ?? COLORS.accentDefault;
}
