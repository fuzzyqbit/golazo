#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { Command, CommanderError } from 'commander';

import { registerPrepareCommand } from './commands/prepare.js';
import { registerRenderCommand } from './commands/render.js';
import { registerPublishCommand } from './commands/publish.js';
import { registerAuthCommand } from './commands/auth.js';
import { registerAllCommand } from './commands/all.js';

/**
 * Root commander program. Configured once at module load so tests can
 * introspect registered subcommands without running the binary.
 *
 * `.exitOverride()` is set so action handlers that call `program.error(...)`
 * (or any built-in failure path) throw a CommanderError instead of calling
 * `process.exit()` — vital for vitest's in-process invocation.
 */
export const program = new Command();

program
  .name('golazo')
  .description('Local-Mac CLI: clip folder → branded YouTube episode')
  .version('0.1.0')
  .exitOverride();

registerPrepareCommand(program);
registerRenderCommand(program);
registerPublishCommand(program);
registerAuthCommand(program);
registerAllCommand(program);

/**
 * Programmatic CLI entry. Pass `argv` directly so tests can drive the
 * parser without touching `process.argv`. Throws on parse failure or when
 * an action handler raises a CommanderError.
 */
export async function main(argv: string[] = process.argv): Promise<void> {
  await program.parseAsync(argv);
}

// Direct-invocation guard: only run `main()` when this file is the entry
// module (i.e. `node ./dist/cli/index.js ...`), not when imported by tests
// or other modules.
const invokedDirectly =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

/**
 * Commander error codes that represent *successful* termination paths
 * (--help / --version etc.) when `.exitOverride()` is active. These should
 * exit silently with code 0 instead of printing the error message.
 */
const SUCCESS_EXIT_CODES = new Set([
  'commander.helpDisplayed',
  'commander.help',
  'commander.version',
]);

if (invokedDirectly) {
  main().catch((err: unknown) => {
    const errCode =
      err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
        ? err.code
        : '';
    const exitCode =
      err && typeof err === 'object' && 'exitCode' in err && typeof err.exitCode === 'number'
        ? err.exitCode
        : 1;

    if (SUCCESS_EXIT_CODES.has(errCode)) {
      process.exit(exitCode);
    }

    // Commander's `program.error(...)` (and built-in argument/option
    // failures) already write the message to its configured stderr output
    // before throwing a CommanderError. Re-printing here would duplicate
    // the line. Only echo the message for non-CommanderError failures
    // (e.g. unexpected runtime crashes inside an action handler).
    if (!(err instanceof CommanderError)) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
    }
    process.exit(exitCode);
  });
}
