import { Command, CommanderError } from 'commander';

import { runPublish } from '../../publish/index.js';

/**
 * Register the `publish` subcommand on the given commander program.
 *
 * Plan 03-05 replaces the Plan 01-01 stub with this real handler.
 * It calls `runPublish` against `<folder>`, distinguishes outcomes by
 * `PublishReason`, and surfaces any error by writing the message to stderr
 * then throwing a `CommanderError(1, ...)` so `.exitOverride()` propagates
 * the failure to in-process callers (tests) AND the parent process exits
 * non-zero.
 *
 * CLI output strings are frozen as a contract for Phase 4 `golazo all` chain:
 *   first-publish:  `video published → <watchUrl> (channel: <channelId>)`
 *   video-exists:   `publish up to date (videoId: <videoId>)`
 *   force:          `video re-published (force) → <watchUrl>`
 *
 * On error (PublishError, OAuthError, ChannelsConfigError, UnknownKidError,
 * QuotaExceededError, UploadError, retry-exhausted Error):
 *   - Write err.message to stderr (single-line, already remediation-shaped).
 *   - Throw CommanderError(1, 'commander.publishFailed', 'publish failed').
 *
 * Token bytes NEVER appear in stdout/stderr — this handler only writes the
 * frozen output strings above or the error's .message, which is shaped to
 * NOT contain raw token bytes per Plan 03-01's logging discipline.
 */
export function registerPublishCommand(program: Command): void {
  program
    .command('publish')
    .description('Upload episode.mp4 to YouTube as unlisted')
    .argument('<folder>', 'path to a rendered game folder')
    .option('-f, --force', 're-upload even when a videoId is already recorded', false)
    .option('--channels-config <path>', 'path to channels.yaml', './channels.yaml')
    .action(async (folder: string, opts: { force: boolean; channelsConfig: string }) => {
      try {
        const result = await runPublish({
          folderPath: folder,
          channelsPath: opts.channelsConfig,
          force: opts.force,
        });
        switch (result.reason) {
          case 'first-publish':
            process.stdout.write(
              `video published → ${result.record.watchUrl} (channel: ${result.record.channelId})\n`,
            );
            break;
          case 'video-exists':
            process.stdout.write(`publish up to date (videoId: ${result.record.videoId})\n`);
            break;
          case 'force':
            process.stdout.write(`video re-published (force) → ${result.record.watchUrl}\n`);
            break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`${message}\n`);
        throw new CommanderError(1, 'commander.publishFailed', 'publish failed');
      }
    });
}
