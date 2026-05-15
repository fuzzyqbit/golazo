#!/usr/bin/env tsx
/**
 * Regenerate committed snapshot baselines for the Remotion compositions.
 *
 * WARNING: Running this script OVERWRITES the committed PNG baselines:
 *   - tests/snapshots/Episode-titlecard.png
 *   - tests/snapshots/Thumbnail.png
 *
 * Only invoke this after INTENTIONAL visual changes (theme update, typography
 * swap, composition layout change). Commit the rewritten PNGs as part of the
 * visual-change PR so CI snapshot tests pass against the new baseline.
 *
 * Usage:
 *   npx tsx scripts/regen-snapshots.ts
 */
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import {
  bundleRemotion,
  renderEpisodeTitlecard,
  renderThumbnail,
} from '../tests/snapshots/_helpers.ts';

const EPISODE_BASELINE = resolve(__dirname, '../tests/snapshots/Episode-titlecard.png');
const THUMBNAIL_BASELINE = resolve(__dirname, '../tests/snapshots/Thumbnail.png');

async function main(): Promise<void> {
  console.log('Golazo snapshot regeneration');
  console.log('WARNING: This overwrites committed PNG baselines.\n');

  console.log('Bundling remotion/Root.tsx...');
  const bundleLocation = await bundleRemotion();
  console.log('  Bundle ready:', bundleLocation, '\n');

  console.log('Rendering Episode title-card...');
  await renderEpisodeTitlecard(bundleLocation, EPISODE_BASELINE);
  const episodeStat = statSync(EPISODE_BASELINE);
  console.log(
    `  Written: ${EPISODE_BASELINE}`,
    `(${(episodeStat.size / 1024).toFixed(1)} KB)\n`,
  );

  console.log('Rendering Thumbnail...');
  await renderThumbnail(bundleLocation, THUMBNAIL_BASELINE);
  const thumbnailStat = statSync(THUMBNAIL_BASELINE);
  console.log(
    `  Written: ${THUMBNAIL_BASELINE}`,
    `(${(thumbnailStat.size / 1024).toFixed(1)} KB)\n`,
  );

  console.log('Done. Commit the updated PNGs as part of your visual-change PR.');
}

main().catch((err) => {
  console.error('regen-snapshots failed:', err);
  process.exit(1);
});
