/**
 * golden-path.spec.ts — E2E golden path: list → filter leo → click first → video plays
 *
 * Runs against the committed fixture at web/tests/fixtures/golazo/ via the
 * Playwright-managed webServer block in playwright.config.ts (GOLAZO_ROOT +
 * GOLAZO_CHANNELS_PATH injected via webServer.env).
 *
 * Fixture status after filter kid=leo (default sort=date.desc):
 *   Row 1: leo/2026-05-20_vs_rivers_2-2  (rendered — has episode.mp4 + thumb.png)
 *   Row 2: leo/2026-05-13_vs_united_3-1  (prepared — no video)
 *
 * Fixture decodability gate (run before authoring):
 *   hexdump -C web/tests/fixtures/golazo/leo/2026-05-20_vs_rivers_2-2/.golazo/episode.mp4 | head -1
 *   Result: bytes 4..7 = 66 74 79 70 (ftyp) — DECODABLE ISO BMFF MP4
 *   Decision: Step 11 (currentTime > 0) is ENABLED.
 */

import { test, expect } from '@playwright/test';

test('golden path: list → filter leo → click first → video plays', async ({ page }) => {
  // Step 1: navigate to list view
  await page.goto('/');

  // Step 2: assert at least 3 rows visible (3 fixture games + broken-folder ignored)
  await expect(page.locator('a[href^="/episodes/"]')).toHaveCount(3);

  // Step 3: click the Leo kid filter chip (EpisodeList renders buttons for kid chips)
  await page.getByRole('button', { name: 'Leo' }).click();
  // URL should change to include kid=leo
  await expect(page).toHaveURL(/kid=leo/);

  // Step 4: after filter, only 2 leo rows remain
  await expect(page.locator('a[href^="/episodes/"]')).toHaveCount(2);

  // Step 5: click first row (leo/2026-05-20_vs_rivers_2-2 — newer date, sorted first)
  await page.locator('a[href^="/episodes/"]').first().click();

  // Step 6: wait for detail page URL
  await page.waitForURL(/\/episodes\//);

  // Step 7: locate the video element
  const video = page.locator('video');

  // Step 8: assert src and poster attributes match the expected episode
  await expect(video).toHaveAttribute(
    'src',
    /\/api\/asset\/leo\/2026-05-20_vs_rivers_2-2\/episode\.mp4/,
  );
  await expect(video).toHaveAttribute('poster', /thumb\.png/);

  // Step 9: wait for metadata to load (preload="metadata" triggers Range requests via 08-01 route)
  await video.evaluate(
    (v: HTMLVideoElement) =>
      new Promise<void>((resolve, reject) => {
        v.addEventListener('loadedmetadata', () => resolve(), { once: true });
        v.addEventListener('error', () => reject(new Error('video error')), { once: true });
        setTimeout(() => reject(new Error('loadedmetadata timeout')), 15_000);
      }),
  );

  // Step 10: trigger play and assert the play event fires
  // NOTE: `play` fires when play() is invoked, regardless of whether decoding progresses —
  // this assertion holds for both decodable and stub fixtures and is the primary gate.
  await video.evaluate(
    (v: HTMLVideoElement) =>
      new Promise<void>((resolve, reject) => {
        v.addEventListener('play', () => resolve(), { once: true });
        v.play().catch(reject);
        setTimeout(() => reject(new Error('play timeout')), 10_000);
      }),
  );

  // Step 11: assert currentTime increments after play (enabled: fixture is decodable ISO BMFF MP4)
  // optional: skip if fixture is not a decodable MP4 — `play` event firing (Step 10) is sufficient
  await page.waitForTimeout(500);
  const t = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(t).toBeGreaterThan(0);
});
