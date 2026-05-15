import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommanderError } from 'commander';

import { program, main } from './index.js';

const EXPECTED_COMMANDS = ['all', 'auth', 'prepare', 'publish', 'render'] as const;

describe('cli/index — commander wiring', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Silence commander's "Error: ..." stderr emission and any stdout writes
    // from stub action handlers during invocation-based assertions. We only
    // care about the thrown CommanderError shape, not the console output.
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('registers exactly the five expected subcommands', () => {
    const names = program.commands
      .map((c) => c.name())
      .sort()
      .join(',');
    expect(names).toBe(EXPECTED_COMMANDS.join(','));
  });

  // Rationale: Plan 01 only contracts the `prepare` scaffold (CLI-01 scaffold
  // half). Plan 05 owns the prepare execution contract and tests it
  // end-to-end via `src/prepare/index.test.ts`. We assert here ONLY that the
  // command is registered AND has an action handler bound, so Plan 05's swap
  // of the stub action body for `runPrepare` does not invalidate this test.
  it('registers prepare with an action handler bound (registration-only)', () => {
    const prepareCmd = program.commands.find((c) => c.name() === 'prepare');
    expect(prepareCmd).toBeDefined();
    // commander stores the action callback under the private `_actionHandler`
    // property; access via an unsafe cast to keep this assertion robust to
    // future internal renames while still verifying that an action is bound.
    const internal = prepareCmd as unknown as { _actionHandler?: unknown };
    expect(typeof internal._actionHandler).toBe('function');
  });

  // Plan 04-01 replaced the all stub with a real handler chaining prepare→render→publish.
  it('registers all command with an action handler (Plan 04-01 replaced stub)', () => {
    const allCmd = program.commands.find((c) => c.name() === 'all');
    expect(allCmd).toBeDefined();
    expect(typeof (allCmd as unknown as { _actionHandler: unknown })._actionHandler).toBe('function');
  });

  it('registers render with an action handler bound (Plan 02-04 replaced stub)', () => {
    const renderCmd = program.commands.find((c) => c.name() === 'render');
    expect(renderCmd).toBeDefined();
    const internal = renderCmd as unknown as { _actionHandler?: unknown };
    expect(typeof internal._actionHandler).toBe('function');
  });

  it('registers auth command with an action handler (Plan 03-01 replaced stub)', () => {
    const authCmd = program.commands.find((c) => c.name() === 'auth');
    expect(authCmd).toBeDefined();
    expect(typeof (authCmd as unknown as { _actionHandler: unknown })._actionHandler).toBe('function');
  });

  it('registers publish command with an action handler (Plan 03-05 replaced stub)', () => {
    const publishCmd = program.commands.find((c) => c.name() === 'publish');
    expect(publishCmd).toBeDefined();
    expect(typeof (publishCmd as unknown as { _actionHandler: unknown })._actionHandler).toBe('function');
  });
});
