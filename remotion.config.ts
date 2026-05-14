/**
 * Remotion configuration file.
 *
 * Read by `@remotion/cli` (npx remotion ...) and by Plan 02-04's render driver
 * (`@remotion/bundler`'s bundle() + @remotion/renderer's renderMedia()).
 *
 * The entry point registered here points the CLI at the Root.tsx composition
 * registration file. Per-composition settings (width, height, fps,
 * durationInFrames) are declared on the <Composition> component in Root.tsx —
 * not here — so overrides remain local to each composition.
 */
import { Config } from '@remotion/cli/config';

// Use JPEG frames for faster rendering (default is PNG which is slower)
Config.setVideoImageFormat('jpeg');

// Overwrite existing output files rather than erroring
Config.setOverwriteOutput(true);

// Point the CLI at the Remotion entrypoint
Config.setEntryPoint('remotion/Root.tsx');
