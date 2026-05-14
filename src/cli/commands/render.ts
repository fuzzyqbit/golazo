import { Command, CommanderError } from 'commander';

import { runRender } from '../../render/index.js';

/**
 * Register the `render` subcommand on the given commander program.
 *
 * Plan 02-04 replaces the Plan 01-01 stub with this real handler.
 * It calls `runRender` against `<folder>`, distinguishes outcomes by
 * `RenderReason`, and surfaces any error by writing the message to stderr
 * then throwing a `CommanderError(1, ...)` so `.exitOverride()` propagates
 * the failure to in-process callers (tests) AND the parent process exits
 * non-zero.
 *
 * The Plan 01-01 smoke test (`src/cli/index.test.ts`) only asserts that
 * the `render` command is registered with a function action handler —
 * NOT what that handler does — so swapping the action body here requires
 * no edit to that test file.
 *
 * CLI output strings are frozen as a contract for Phase 3/4 chain parsing:
 *   first-render:        `episode rendered → <episodePath> + <thumbnailPath> (<durationSec>s)`
 *   hash-match:          `render up to date (hash matches)`
 *   hash-changed:        `episode re-rendered (content changed) → <episodePath>`
 *   force:               `episode re-rendered (force) → <episodePath>`
 *   missing-render-block: (aliased to first-render output)
 */
export function registerRenderCommand(program: Command): void {
  program
    .command('render')
    .description('Render episode.mp4 + thumb.png via Remotion')
    .argument('<folder>', 'path to a prepared game folder')
    .option('-f, --force', 'rewrite episode + thumb even when hash matches', false)
    .option(
      '--channels-config <path>',
      'path to channels.yaml',
      './channels.yaml',
    )
    .option('--low-res', 'render at ~1/6 scale for CI/integration speed', false)
    .action(
      async (folder: string, opts: { force: boolean; channelsConfig: string; lowRes: boolean }) => {
        try {
          const result = await runRender({
            folderPath: folder,
            channelsPath: opts.channelsConfig,
            force: opts.force,
            lowRes: opts.lowRes,
          });

          const durationSec = result.manifest.render?.durationSec ?? 0;

          switch (result.reason) {
            case 'first-render':
            case 'missing-render-block':
              process.stdout.write(
                `episode rendered → ${result.episodePath} + ${result.thumbnailPath} (${durationSec}s)\n`,
              );
              break;
            case 'hash-match':
              process.stdout.write('render up to date (hash matches)\n');
              break;
            case 'hash-changed':
              process.stdout.write(
                `episode re-rendered (content changed) → ${result.episodePath}\n`,
              );
              break;
            case 'force':
              process.stdout.write(
                `episode re-rendered (force) → ${result.episodePath}\n`,
              );
              break;
          }
        } catch (err) {
          // Every error class thrown by runRender (RenderError, ManifestError,
          // MusicPoolError, MusicPickError, ChannelsConfigError, UnknownKidError)
          // shapes its .message as a single operator-friendly line.
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`${message}\n`);
          throw new CommanderError(1, 'commander.renderFailed', 'render failed');
        }
      },
    );
}
