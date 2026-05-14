import type { Command } from 'commander';

/**
 * Register the `auth` subcommand. Phase 3 will replace the stub with the
 * one-time-per-kid YouTube OAuth flow. For Phase 1, the action surfaces a
 * documented "not yet implemented" error with exit code 2.
 */
export function registerAuthCommand(program: Command): void {
  const cmd = program
    .command('auth')
    .description('One-time YouTube OAuth flow for a channel')
    .argument('<kid>', 'kid identifier (e.g. "leo" or "mateo")');

  cmd.action(() => {
    cmd.error('auth: not yet implemented', { exitCode: 2, code: 'auth.unimplemented' });
  });
}
