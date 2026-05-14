/**
 * Self-hosted font registration for Golazo Remotion compositions.
 *
 * Loads three faces from committed TTF files under remotion/assets/fonts/:
 *   - Cormorant Garamond Italic (display role, weight 400)
 *   - Inter Regular (label role, weight 400)
 *   - Inter Bold (label role, weight 700)
 *
 * Uses `@remotion/fonts` `loadFont()` which automatically blocks the
 * Remotion renderer until each face is ready (no manual FontFace.load() required).
 *
 * URL resolution uses `new URL('../assets/fonts/<file>', import.meta.url).href`
 * so Remotion's webpack bundler (not tsc) resolves the path at bundle time.
 * This approach is correct because `staticFile()` only resolves paths under
 * the Remotion `public/` folder, not arbitrary subdirectories.
 */
import { loadFont } from '@remotion/fonts';

/** Resolved CSS font-family names to pass to `fontFamily` in style props. */
export const FONT_FAMILIES = {
  display: 'Cormorant Garamond',
  label: 'Inter',
} as const;

/** Module-level idempotency cache — repeated `loadFonts()` calls return the same Promise. */
let loadOnce: Promise<{ display: string; label: string }> | null = null;

/**
 * Register all three font faces via `@remotion/fonts` `loadFont()`.
 *
 * Returns the resolved family names (`display` and `label`) once all fonts are ready.
 * Idempotent: repeated calls return the same cached Promise.
 *
 * Call this once in the Remotion Root composition or in the render driver's
 * pre-bundle setup (Plan 04) before triggering `renderMedia`.
 */
export async function loadFonts(): Promise<{ display: string; label: string }> {
  if (loadOnce !== null) return loadOnce;

  loadOnce = (async () => {
    const cormorantUrl = new URL(
      '../assets/fonts/CormorantGaramond-Italic.ttf',
      import.meta.url,
    ).href;
    const interRegularUrl = new URL(
      '../assets/fonts/Inter-Regular.ttf',
      import.meta.url,
    ).href;
    const interBoldUrl = new URL(
      '../assets/fonts/Inter-Bold.ttf',
      import.meta.url,
    ).href;

    await Promise.all([
      loadFont({
        family: FONT_FAMILIES.display,
        url: cormorantUrl,
        weight: '400',
        style: 'italic',
        format: 'truetype',
      }),
      loadFont({
        family: FONT_FAMILIES.label,
        url: interRegularUrl,
        weight: '400',
        style: 'normal',
        format: 'truetype',
      }),
      loadFont({
        family: FONT_FAMILIES.label,
        url: interBoldUrl,
        weight: '700',
        style: 'normal',
        format: 'truetype',
      }),
    ]);

    return {
      display: FONT_FAMILIES.display,
      label: FONT_FAMILIES.label,
    };
  })();

  return loadOnce;
}
