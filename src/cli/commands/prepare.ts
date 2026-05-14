import { Command, CommanderError } from 'commander';

import { runPrepare } from '../../prepare/index.js';

/**
 * Register the `prepare` subcommand on the given commander program.
 *
 * Plan 05 owns this handler's behaviour: it calls `runPrepare` against
 * `<folder>`, distinguishes first-run / hash-match / hash-changed /
 * force outcomes in its stdout output, and surfaces any error from the
 * prepare pipeline by writing the message to stderr and throwing a
 * `CommanderError(1, ...)` so `.exitOverride()` propagates the failure
 * to in-process callers (tests) AND the parent process exits non-zero.
 *
 * The Plan 01 smoke test (`src/cli/index.test.ts`) only asserts that the
 * `prepare` command is registered with a function action handler bound,
 * NOT what that handler does — so swapping the action body here does
 * not require any edit to that test file. The end-to-end behaviour of
 * the rewritten handler is covered by the CLI shell-out cases in
 * `src/prepare/index.test.ts` (cases 11-13, added in this commit).
 */
export function registerPrepareCommand(program: Command): void {
  program
    .command('prepare')
    .description('Parse metadata, scan clips, write manifest.json')
    .argument('<folder>', 'path to a game folder under ~/golazo/<kid>/...')
    .option('-f, --force', 'rewrite manifest even when hash matches', false)
    .option(
      '--channels-config <path>',
      'path to channels.yaml',
      './channels.yaml',
    )
    .action(async (folder: string, opts: { force: boolean; channelsConfig: string }) => {
      try {
        const result = await runPrepare({
          folderPath: folder,
          channelsPath: opts.channelsConfig,
          force: opts.force,
        });

        // Output strings are part of the public contract — the CLI
        // shell-out tests in src/prepare/index.test.ts assert on them.
        // Keep them stable across Phase 2/3 unless the entire contract
        // is renegotiated in a future plan.
        const clipCount = result.manifest.clips.length;
        const totalSec = result.manifest.totalDurationSec;
        const path = result.manifestPath;

        switch (result.reason) {
          case 'first-run':
            process.stdout.write(
              `manifest written to ${path} (${clipCount} clips, ${totalSec}s total)\n`,
            );
            break;
          case 'hash-match':
            process.stdout.write('manifest up to date (hash matches)\n');
            break;
          case 'hash-changed':
            process.stdout.write(
              `manifest updated (content changed) -> ${path} (${clipCount} clips, ${totalSec}s total)\n`,
            );
            break;
          case 'force':
            process.stdout.write(`manifest rewritten (force) -> ${path}\n`);
            break;
        }
      } catch (err) {
        // Every error class thrown by runPrepare (FilenameError,
        // KidPathError, UnknownKidError, ChannelsConfigError,
        // ClipDiscoveryError, ProbeError, ManifestError) already shapes
        // its `.message` as a single line carrying field/reason/
        // remediation, so writing the message verbatim is the right
        // contract. Non-Error throws fall back to String(err).
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`${message}\n`);
        throw new CommanderError(1, 'commander.prepareFailed', 'prepare failed');
      }
    });
}
