import type { Command } from 'commander';

/**
 * Register the `publish` subcommand. Phase 3 will replace the stub action
 * body with the YouTube `videos.insert` upload driver. For Phase 1, the
 * action surfaces a documented "not yet implemented" error with exit
 * code 2.
 */
export function registerPublishCommand(program: Command): void {
  const cmd = program
    .command('publish')
    .description('Upload episode.mp4 to YouTube as unlisted')
    .argument('<folder>', 'path to a rendered game folder');

  cmd.action(() => {
    cmd.error('publish: not yet implemented', {
      exitCode: 2,
      code: 'publish.unimplemented',
    });
  });
}
