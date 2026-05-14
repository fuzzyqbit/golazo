import { Command, CommanderError } from 'commander';

import { runAuth } from '../../publish/index.js';

/**
 * Register the `auth` subcommand on the given commander program.
 *
 * Plan 03-01 replaces the Plan 01-01 stub with this real handler.
 * Drives the one-time YouTube OAuth2 authorization flow for a kid:
 *   1. Loads channels.yaml (permissively — token may not exist yet)
 *   2. Prints the Google consent URL to stdout
 *   3. Reads the authorization code from stdin
 *   4. Exchanges the code for tokens and persists them to oauthTokenPath
 *
 * On success, prints: `token written to <tokenPath> for channel <channelId>`
 * On error, writes err.message to stderr and throws CommanderError(1, ...).
 * NEVER logs token contents.
 */
export function registerAuthCommand(program: Command): void {
  program
    .command('auth')
    .description('One-time YouTube OAuth flow for a channel')
    .argument('<kid>', 'kid identifier (e.g. "leo" or "mateo")')
    .option('--channels-config <path>', 'path to channels.yaml', './channels.yaml')
    .action(async (kid: string, opts: { channelsConfig: string }) => {
      try {
        const result = await runAuth({
          kid,
          channelsPath: opts.channelsConfig,
        });
        process.stdout.write(
          `token written to ${result.tokenPath} for channel ${result.channelId}\n`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`${message}\n`);
        throw new CommanderError(1, 'commander.authFailed', 'auth failed');
      }
    });
}
