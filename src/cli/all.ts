/**
 * runAll orchestrator — composes runPrepare → runRender → runPublish in sequence.
 *
 * Algorithm:
 *   1. Await runPrepare(opts) → on success, call onStageComplete('prepare', result)
 *   2. Await runRender(opts) → on success, call onStageComplete('render', result)
 *   3. Await runPublish(opts) → on success, call onStageComplete('publish', result)
 *
 * On any sub-stage rejection, wraps the error in AllStageError and re-throws.
 * Later sub-stages are NOT invoked after a failure.
 *
 * Dependency injection pattern (mirrors runPublish orchestrator from Plan 03-05):
 * opts.runPrepare?, opts.runRender?, opts.runPublish? default to the real imports,
 * so tests can pass vi.fn() mocks without module-level vi.mock() hoisting.
 *
 * Option routing:
 *   - folderPath, channelsPath, force → forwarded to ALL three sub-stages
 *   - lowRes → forwarded ONLY to runRender (prepare + publish have no equivalent)
 *   - clientId, clientSecret, retryOpts, clock → forwarded ONLY to runPublish
 */

import {
  runPrepare as defaultRunPrepare,
  type PrepareResult,
  type RunPrepareOpts,
} from '../prepare/index.js';
import {
  runRender as defaultRunRender,
  type RenderResult,
  type RunRenderOpts,
} from '../render/index.js';
import { runPublish as defaultRunPublish } from '../publish/runner.js';
import type { RunPublishResult, RunPublishOpts } from '../publish/runner.js';
import type { WithRetryOpts } from '../publish/retry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which sub-stage of the `all` pipeline failed. */
export type AllStage = 'prepare' | 'render' | 'publish';

/** Injected sub-orchestrator signatures for testing. */
type RunPrepareFn = (opts: RunPrepareOpts) => Promise<PrepareResult>;
type RunRenderFn = (opts: RunRenderOpts) => Promise<RenderResult>;
type RunPublishFn = (opts: RunPublishOpts) => Promise<RunPublishResult>;

/** Options for {@link runAll}. */
export interface RunAllOpts {
  /** Path to the game folder (relative or absolute). */
  folderPath: string;
  /** Path to channels.yaml. Forwarded to all three sub-stages. */
  channelsPath?: string;
  /** When true, re-run all sub-stages even when idempotent. */
  force?: boolean;
  /** Forward --low-res to runRender only. */
  lowRes?: boolean;
  /** Google OAuth client ID. Forwarded to runPublish only. */
  clientId?: string;
  /** Google OAuth client secret. Forwarded to runPublish only. */
  clientSecret?: string;
  /** Retry policy override. Forwarded to runPublish only. */
  retryOpts?: WithRetryOpts;
  /** Clock injection. Forwarded to runPublish only. */
  clock?: () => Date;
  /**
   * Called after each sub-stage succeeds, before the next sub-stage starts.
   * Allows the CLI handler to emit frozen stdout lines incrementally.
   */
  onStageComplete?: (stage: AllStage, result: PrepareResult | RenderResult | RunPublishResult) => void;
  /** Injected runPrepare for unit tests. Defaults to the real runPrepare. */
  runPrepare?: RunPrepareFn;
  /** Injected runRender for unit tests. Defaults to the real runRender. */
  runRender?: RunRenderFn;
  /** Injected runPublish for unit tests. Defaults to the real runPublish. */
  runPublish?: RunPublishFn;
}

/** Return value from a successful {@link runAll}. */
export interface RunAllResult {
  prepare: PrepareResult;
  render: RenderResult;
  publish: RunPublishResult;
}

// ---------------------------------------------------------------------------
// AllStageError
// ---------------------------------------------------------------------------

/**
 * Thrown by runAll when a sub-stage rejects.
 *
 * message format: `stage '<stage>' failed: <originalError.message>`
 * so the CLI handler can write originalError.message to stderr AND the stage
 * label without double-printing the composed message.
 */
export class AllStageError extends Error {
  readonly stage: AllStage;
  readonly originalError: Error;

  constructor(stage: AllStage, originalError: Error) {
    super(`stage '${stage}' failed: ${originalError.message}`);
    this.name = 'AllStageError';
    this.stage = stage;
    this.originalError = originalError;
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Chain runPrepare → runRender → runPublish in sequence.
 *
 * Short-circuits on the first failure: the failing sub-stage's error is
 * wrapped in AllStageError and re-thrown; subsequent sub-stages are NOT
 * invoked. Any side-effects from successful earlier stages (manifest.json,
 * episode.mp4, thumb.png) are preserved on disk — no cleanup.
 */
export async function runAll(opts: RunAllOpts): Promise<RunAllResult> {
  const prepare = opts.runPrepare ?? defaultRunPrepare;
  const render = opts.runRender ?? defaultRunRender;
  const publish = opts.runPublish ?? defaultRunPublish;

  const { folderPath, channelsPath, force, onStageComplete } = opts;

  // Stage 1: prepare
  let prepareResult: PrepareResult;
  try {
    prepareResult = await prepare({ folderPath, channelsPath, force });
  } catch (err) {
    const original = err instanceof Error ? err : new Error(String(err));
    throw new AllStageError('prepare', original);
  }
  onStageComplete?.('prepare', prepareResult);

  // Stage 2: render
  let renderResult: RenderResult;
  try {
    renderResult = await render({
      folderPath,
      channelsPath,
      force,
      lowRes: opts.lowRes,
    });
  } catch (err) {
    const original = err instanceof Error ? err : new Error(String(err));
    throw new AllStageError('render', original);
  }
  onStageComplete?.('render', renderResult);

  // Stage 3: publish
  let publishResult: RunPublishResult;
  try {
    publishResult = await publish({
      folderPath,
      channelsPath,
      force,
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      retryOpts: opts.retryOpts,
      clock: opts.clock,
    });
  } catch (err) {
    const original = err instanceof Error ? err : new Error(String(err));
    throw new AllStageError('publish', original);
  }
  onStageComplete?.('publish', publishResult);

  return {
    prepare: prepareResult,
    render: renderResult,
    publish: publishResult,
  };
}
