/**
 * Shared helpers for Remotion snapshot tests and the regen script.
 *
 * Exports:
 *   - FIXED_INPUT_PROPS_EPISODE  — deterministic episode props (decoupled from fixture manifests)
 *   - FIXED_INPUT_PROPS_THUMBNAIL — deterministic thumbnail props
 *   - EPISODE_TITLECARD_FRAME    — named frame index for the Episode title-card still
 *   - bundleRemotion()           — bundles remotion/Root.tsx (cached per-process)
 *   - renderEpisodeTitlecard()   — renderStill for the Episode title-card frame
 *   - renderThumbnail()          — renderStill for the Thumbnail composition
 */
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';

import { MOTION } from '../../remotion/theme/tokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

/**
 * Frame index used to capture the Episode title-card still.
 *
 * MOTION.titleCardFrames = 90 (verified from remotion/theme/tokens.ts).
 * Frame 30 sits in the first third of the 90-frame window — well inside the
 * title-card window, before any clip or chapter sequence begins.
 *
 * If titleCardFrames ever shrinks below 30, choose Math.floor(titleCardFrames / 2).
 * Current value: 30 (< 90 / 2 = 45 — safely inside the window).
 */
export const EPISODE_TITLECARD_FRAME: number =
  MOTION.titleCardFrames >= 60
    ? 30
    : Math.floor(MOTION.titleCardFrames / 2);

// ---------------------------------------------------------------------------
// Fixed input props (deterministic — NOT tied to fixture manifests)
// ---------------------------------------------------------------------------

/**
 * Absolute path to a committed fixture clip (01-clip.mp4).
 * Passed as `absPath` in the episode clips array so the inputProps schema
 * validates. The title-card frame (EPISODE_TITLECARD_FRAME) sits before any
 * clip sequence begins, so the clip file is NOT actually read by headless Chrome
 * during the renderStill call.
 */
const FIXTURE_CLIP_PATH = resolve(
  __dirname,
  '../fixtures/golazo/leo/2026-05-13_vs_united_3-1/01-clip.mp4',
);

/**
 * Absolute path to a committed music asset.
 * Used as `absPath` in the music object. The music element exists in the
 * Episode composition's tree, but for a still at EPISODE_TITLECARD_FRAME the
 * audio element is not decoded — the path must be a valid string but the file
 * does not need to serve bytes for the snapshot.
 */
const FIXTURE_MUSIC_PATH = resolve(__dirname, '../../remotion/assets/music/atmos-1.mp3');

/**
 * Fixed inputProps for the Episode composition snapshot.
 *
 * Kid: Leo / FC Eagles / #10 / accent #ffce5a
 * Game: 2026-05-13 vs united, 3-1, W
 *
 * These values are intentionally hardcoded here and NEVER read from a manifest,
 * fixture folder, or channel config — so a fixture rebuild does NOT invalidate
 * the committed baseline PNGs.
 */
export const FIXED_INPUT_PROPS_EPISODE = {
  kid: {
    name: 'Leo',
    club: 'FC Eagles',
    jersey: 10,
    accent: '#ffce5a',
  },
  game: {
    date: '2026-05-13',
    opponent: 'United',
    scoreFor: 3,
    scoreAgainst: 1,
    result: 'W' as const,
  },
  clips: [
    {
      file: '01-clip.mp4',
      absPath: FIXTURE_CLIP_PATH,
      durationSec: 5,
    },
  ],
  music: {
    absPath: FIXTURE_MUSIC_PATH,
    durationSec: 200.072,
    strategy: 'trim-fade' as const,
  },
};

/**
 * Fixed inputProps for the Thumbnail composition snapshot.
 * Same kid + game as FIXED_INPUT_PROPS_EPISODE; no clips or music required.
 */
export const FIXED_INPUT_PROPS_THUMBNAIL = {
  kid: FIXED_INPUT_PROPS_EPISODE.kid,
  game: FIXED_INPUT_PROPS_EPISODE.game,
};

// ---------------------------------------------------------------------------
// Bundle cache (per-process — avoids re-bundling across multiple test calls)
// ---------------------------------------------------------------------------

let _bundleCache: string | null = null;

/**
 * Bundle remotion/Root.tsx and return the serve URL.
 * Result is cached for the lifetime of the current Node.js process.
 */
export async function bundleRemotion(): Promise<string> {
  if (_bundleCache !== null) {
    return _bundleCache;
  }

  const entryPoint = resolve(__dirname, '../../remotion/Root.tsx');

  _bundleCache = await bundle({
    entryPoint,
    // Mirror the webpack override from remotion.config.ts so NodeNext
    // .js imports resolve to .ts/.tsx sources during bundling.
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        extensionAlias: {
          '.js': ['.ts', '.tsx', '.js'],
          '.jsx': ['.tsx', '.jsx'],
        },
      },
    }),
  });

  return _bundleCache;
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Render a still of the Episode composition at the title-card frame.
 * Writes a PNG to `outputPath`.
 */
export async function renderEpisodeTitlecard(
  bundleLocation: string,
  outputPath: string,
): Promise<void> {
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'Episode',
    inputProps: FIXED_INPUT_PROPS_EPISODE,
  });

  await renderStill({
    composition,
    serveUrl: bundleLocation,
    output: outputPath,
    inputProps: FIXED_INPUT_PROPS_EPISODE,
    frame: EPISODE_TITLECARD_FRAME,
    imageFormat: 'png',
  });
}

/**
 * Render a still of the Thumbnail composition (single frame, frame 0).
 * Writes a PNG to `outputPath`.
 */
export async function renderThumbnail(
  bundleLocation: string,
  outputPath: string,
): Promise<void> {
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'Thumbnail',
    inputProps: FIXED_INPUT_PROPS_THUMBNAIL,
  });

  await renderStill({
    composition,
    serveUrl: bundleLocation,
    output: outputPath,
    inputProps: FIXED_INPUT_PROPS_THUMBNAIL,
    frame: 0,
    imageFormat: 'png',
  });
}
