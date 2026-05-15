/**
 * Remotion visual snapshot tests (Plan 04-04, QA-03).
 *
 * Each test:
 *   1. Bundles remotion/Root.tsx (cached across tests within this run)
 *   2. renderStill the composition with fixed deterministic inputProps
 *   3. Pixel-diffs the output against the committed baseline PNG
 *
 * Failure threshold: 1.0% of total pixels (diffPixels / totalPixels > 0.01).
 * On failure, the diff PNG is written to tests/snapshots/.diff/ (gitignored)
 * so the operator can inspect the regression locally.
 *
 * Remotion compositions are excluded from line coverage (Plan 04-02 vitest.config.ts
 * exclude for remotion/**). These snapshot tests are the regression gate instead.
 *
 * To regenerate baselines after an intentional visual change:
 *   npx tsx scripts/regen-snapshots.ts
 */
import { describe, it, beforeAll } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

import {
  EPISODE_TITLECARD_FRAME,
  bundleRemotion,
  renderEpisodeTitlecard,
  renderThumbnail,
} from './_helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum allowed pixel-diff ratio before test fails (1 %). */
const MAX_DIFF_RATIO = 0.01;

/** Per-pixel similarity threshold passed to pixelmatch (0 = exact, 1 = any). */
const PIXELMATCH_THRESHOLD = 0.1;

/** Baselines committed under tests/snapshots/ */
const BASELINE_EPISODE = resolve(__dirname, 'Episode-titlecard.png');
const BASELINE_THUMBNAIL = resolve(__dirname, 'Thumbnail.png');

/** Diff output dir (gitignored) — written only on test failure for inspection. */
const DIFF_DIR = resolve(__dirname, '.diff');

// ---------------------------------------------------------------------------
// Shared bundle
// ---------------------------------------------------------------------------

let bundleLocation: string;

beforeAll(async () => {
  bundleLocation = await bundleRemotion();
}, 180_000);

// ---------------------------------------------------------------------------
// Snapshot tests
// ---------------------------------------------------------------------------

describe('Remotion visual snapshots', () => {
  it(
    'Episode title-card frame matches committed baseline within 1% pixel-diff',
    async () => {
      // Render actual still to the gitignored .diff/ directory
      mkdirSync(DIFF_DIR, { recursive: true });
      const actualPath = resolve(DIFF_DIR, 'Episode-titlecard-actual.png');
      await renderEpisodeTitlecard(bundleLocation, actualPath);

      // Load baseline and actual
      const baseline = PNG.sync.read(readFileSync(BASELINE_EPISODE));
      const actual = PNG.sync.read(readFileSync(actualPath));

      // Dimensions must match exactly
      expect(baseline.width).toBe(actual.width);
      expect(baseline.height).toBe(actual.height);

      // Pixel-diff
      const diff = new PNG({ width: baseline.width, height: baseline.height });
      const diffPixels = pixelmatch(
        baseline.data,
        actual.data,
        diff.data,
        baseline.width,
        baseline.height,
        { threshold: PIXELMATCH_THRESHOLD },
      );
      const diffRatio = diffPixels / (baseline.width * baseline.height);

      if (diffRatio > MAX_DIFF_RATIO) {
        // Write diff PNG for operator inspection
        const diffPath = resolve(DIFF_DIR, 'Episode-titlecard-diff.png');
        writeFileSync(diffPath, PNG.sync.write(diff));
        throw new Error(
          `Episode title-card diff ratio ${(diffRatio * 100).toFixed(3)}% exceeds 1% threshold.\n` +
          `Diff PNG written to: ${diffPath}\n` +
          `To update baselines after an intentional visual change: npx tsx scripts/regen-snapshots.ts`,
        );
      }

      // EPISODE_TITLECARD_FRAME is the named constant for the captured frame
      expect(EPISODE_TITLECARD_FRAME).toBe(30);
    },
    120_000,
  );

  it(
    'Thumbnail still matches committed baseline within 1% pixel-diff',
    async () => {
      // Render actual still to the gitignored .diff/ directory
      mkdirSync(DIFF_DIR, { recursive: true });
      const actualPath = resolve(DIFF_DIR, 'Thumbnail-actual.png');
      await renderThumbnail(bundleLocation, actualPath);

      // Load baseline and actual
      const baseline = PNG.sync.read(readFileSync(BASELINE_THUMBNAIL));
      const actual = PNG.sync.read(readFileSync(actualPath));

      // Dimensions must match exactly
      expect(baseline.width).toBe(actual.width);
      expect(baseline.height).toBe(actual.height);

      // Pixel-diff
      const diff = new PNG({ width: baseline.width, height: baseline.height });
      const diffPixels = pixelmatch(
        baseline.data,
        actual.data,
        diff.data,
        baseline.width,
        baseline.height,
        { threshold: PIXELMATCH_THRESHOLD },
      );
      const diffRatio = diffPixels / (baseline.width * baseline.height);

      if (diffRatio > MAX_DIFF_RATIO) {
        // Write diff PNG for operator inspection
        const diffPath = resolve(DIFF_DIR, 'Thumbnail-diff.png');
        writeFileSync(diffPath, PNG.sync.write(diff));
        throw new Error(
          `Thumbnail diff ratio ${(diffRatio * 100).toFixed(3)}% exceeds 1% threshold.\n` +
          `Diff PNG written to: ${diffPath}\n` +
          `To update baselines after an intentional visual change: npx tsx scripts/regen-snapshots.ts`,
        );
      }
    },
    120_000,
  );
});
