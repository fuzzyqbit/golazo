import type { Command } from 'commander';

/**
 * Register the `all` subcommand. Phase 4 will replace the stub with a
 * sequential `prepare → render → publish` driver. For Phase 1, the action
 * surfaces a documented "not yet implemented" error with exit code 2.
 */
export function registerAllCommand(program: Command): void {
  const cmd = program
    .command('all')
    .description('Convenience: prepare → render → publish')
    .argument('<folder>', 'path to a game folder');

  cmd.action(() => {
    cmd.error('all: not yet implemented', { exitCode: 2, code: 'all.unimplemented' });
  });
}
