# Visual Snapshots

Pinned baselines for Remotion compositions. Pixel-diff tested at a 1% threshold.

## Files

| File | Composition | Dimensions | Notes |
|------|-------------|------------|-------|
| Episode-titlecard.png | Episode | 1920x1080 | Frame EPISODE_TITLECARD_FRAME (=30, first-third of 90-frame title-card window) |
| Thumbnail.png | Thumbnail | 1280x720 | Single frame composition (frame 0) |

## Inputs

Both snapshots use fixed input props committed in `_helpers.ts`:
- kid: Leo / FC Eagles / #10 / accent #ffce5a
- game: 2026-05-13 vs united, 3-1, W

The fixed props are deliberately decoupled from `tests/fixtures/` so a fixture-clip rebuild
does NOT invalidate the visual baselines.

## Regenerating baselines

On INTENTIONAL visual changes (theme update, typography swap, composition layout change):

    npx tsx scripts/regen-snapshots.ts

This overwrites both PNGs in place. Commit the rewritten baselines as part of the visual
change PR. The CI diff test will then pass against the new baseline until the next
intentional change.

## Threshold

Pixelmatch per-pixel similarity threshold: 0.1 (default — absorbs sub-pixel anti-aliasing
drift across macOS / libc versions).

Test-level diffRatio threshold: 1.0% (diffPixels / totalPixels). Tight enough to catch
typography or layout regressions; loose enough to absorb known sub-pixel noise from the
cinematic-grade CSS filter (`saturate(1.12) contrast(1.05) brightness(0.96)` — pinned by
Plan 02-01).

On a failing test, the diff PNG is written under `tests/snapshots/.diff/<name>-diff.png`
(gitignored). Open it locally to inspect the regression.

## Coverage exclusion

`remotion/` source is excluded from line coverage (Plan 04-02 vitest.config.ts exclude).
These snapshots are the regression gate for the Remotion compositions.
