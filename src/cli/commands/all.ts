import { Command, CommanderError } from 'commander';

import { runAll, AllStageError } from '../all.js';
import type { PrepareResult } from '../../prepare/index.js';
import type { RenderResult } from '../../render/index.js';
import type { RunPublishResult } from '../../publish/runner.js';

/**
 * Register the `all` subcommand — chains prepare → render → publish.
 *
 * Replaces the Plan 01-01 stub. The handler:
 *   1. Calls runAll(opts) with an onStageComplete callback that emits each
 *      sub-stage's frozen stdout line incrementally (same strings as the
 *      individual prepare/render/publish handlers — not re-invented here).
 *   2. On AllStageError: writes originalError.message to stderr, then
 *      writes the stage label line `golazo all: stage '<stage>' failed`,
 *      then throws CommanderError(1, ...).
 *   3. On any other unexpected error: writes message to stderr and throws
 *      CommanderError(1, ...).
 *
 * Token bytes NEVER appear in stdout/stderr because this handler only
 * writes the frozen output strings or originalError.message (shaped to
 * omit raw token bytes per Plan 03-01's logging discipline).
 *
 * CLI output strings are frozen as stable contracts for Phase 4 regression
 * tests. DO NOT reword without coordinating integration test updates.
 */
export function registerAllCommand(program: Command): void {
  program
    .command('all')
    .description('Convenience: prepare → render → publish')
    .argument('<folder>', 'path to a game folder')
    .option('-f, --force', 're-run all sub-stages even when idempotent', false)
    .option('--channels-config <path>', 'path to channels.yaml', './channels.yaml')
    .option('--low-res', 'forward --low-res to render sub-stage', false)
    .action(
      async (
        folder: string,
        opts: { force: boolean; channelsConfig: string; lowRes: boolean },
      ) => {
        try {
          await runAll({
            folderPath: folder,
            channelsPath: opts.channelsConfig,
            force: opts.force,
            lowRes: opts.lowRes,
            onStageComplete: (
              stage,
              result: PrepareResult | RenderResult | RunPublishResult,
            ) => {
              switch (stage) {
                case 'prepare': {
                  const r = result as PrepareResult;
                  const clipCount = r.manifest.clips.length;
                  const totalSec = r.manifest.totalDurationSec;
                  const path = r.manifestPath;
                  switch (r.reason) {
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
                  break;
                }
                case 'render': {
                  const r = result as RenderResult;
                  const durationSec = r.manifest.render?.durationSec ?? 0;
                  switch (r.reason) {
                    case 'first-render':
                    case 'missing-render-block':
                      process.stdout.write(
                        `episode rendered → ${r.episodePath} + ${r.thumbnailPath} (${durationSec}s)\n`,
                      );
                      break;
                    case 'hash-match':
                      process.stdout.write('render up to date (hash matches)\n');
                      break;
                    case 'hash-changed':
                      process.stdout.write(
                        `episode re-rendered (content changed) → ${r.episodePath}\n`,
                      );
                      break;
                    case 'force':
                      process.stdout.write(
                        `episode re-rendered (force) → ${r.episodePath}\n`,
                      );
                      break;
                  }
                  break;
                }
                case 'publish': {
                  const r = result as RunPublishResult;
                  switch (r.reason) {
                    case 'first-publish':
                      process.stdout.write(
                        `video published → ${r.record.watchUrl} (channel: ${r.record.channelId})\n`,
                      );
                      break;
                    case 'video-exists':
                      process.stdout.write(
                        `publish up to date (videoId: ${r.record.videoId})\n`,
                      );
                      break;
                    case 'force':
                      process.stdout.write(
                        `video re-published (force) → ${r.record.watchUrl}\n`,
                      );
                      break;
                  }
                  break;
                }
              }
            },
          });
        } catch (err) {
          if (err instanceof AllStageError) {
            // Write the original error message first, then the stage label.
            // This gives the operator both the root cause and the pipeline context.
            const origMessage =
              err.originalError instanceof Error
                ? err.originalError.message
                : String(err.originalError);
            process.stderr.write(`${origMessage}\n`);
            process.stderr.write(`golazo all: stage '${err.stage}' failed\n`);
            throw new CommanderError(1, 'commander.allFailed', 'all failed');
          }
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`${message}\n`);
          throw new CommanderError(1, 'commander.allFailed', 'all failed');
        }
      },
    );
}
