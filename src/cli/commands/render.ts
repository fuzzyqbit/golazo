import type { Command } from 'commander';

/**
 * Register the `render` subcommand. Phase 2 will replace the stub action
 * body with the Remotion render driver. For Phase 1, the action surfaces a
 * documented "not yet implemented" error with exit code 2 so downstream
 * tooling (and the smoke test) can detect the unimplemented branch.
 */
export function registerRenderCommand(program: Command): void {
  const cmd = program
    .command('render')
    .description('Render episode.mp4 + thumb.png via Remotion')
    .argument('<folder>', 'path to a prepared game folder');

  cmd.action(() => {
    // `program.error(...)` raises a CommanderError; combined with
    // `program.exitOverride()` on the root command, this is catchable from
    // the test harness instead of calling process.exit() directly.
    cmd.error('render: not yet implemented', { exitCode: 2, code: 'render.unimplemented' });
  });
}
