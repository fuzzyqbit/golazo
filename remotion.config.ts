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

// ---------------------------------------------------------------------------
// Webpack override: support NodeNext-style .js imports resolving to .ts files
//
// TypeScript with "moduleResolution": "NodeNext" requires explicit .js
// extensions in import specifiers (e.g. `import from './foo.js'`), but
// Remotion's webpack bundler does not remap `.js` -> `.ts` by default.
// This override adds a resolve plugin that strips the `.js` suffix so webpack
// can find the actual `.ts` / `.tsx` source file.
// ---------------------------------------------------------------------------
Config.overrideWebpackConfig((config) => {
  return {
    ...config,
    resolve: {
      ...config.resolve,
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js'],
        '.jsx': ['.tsx', '.jsx'],
      },
    },
  };
});
