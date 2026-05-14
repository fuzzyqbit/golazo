import path from 'node:path';
import type { Command } from 'commander';

/**
 * Register the `prepare` subcommand on the given commander program.
 *
 * Phase 1 / Plan 01 status: This handler is a stub. It accepts `<folder>`,
 * resolves it to an absolute path, and logs a placeholder message. Plan 05
 * replaces this action body with the real `runPrepare` orchestrator that
 * scans clips, probes durations, and writes `.golazo/manifest.json`.
 *
 * Contract owned by Plan 05 (CLI-01 prepare half + PREP-07 output half).
 */
export function registerPrepareCommand(program: Command): void {
  program
    .command('prepare')
    .description('Parse metadata, scan clips, write manifest.json')
    .argument('<folder>', 'path to a game folder under ~/golazo/<kid>/...')
    .action((folder: string) => {
      const resolved = path.resolve(folder);
      console.log(`prepare: handler stub for ${resolved}`);
    });
}
