/**
 * Unit tests for the runAll orchestrator (Plan 04-01 Task 1).
 *
 * Uses dependency injection via RunAllOpts.runPrepare? / runRender? / runPublish?
 * so vi.fn() mocks can be passed directly without module-level hoisting.
 *
 * Test cases (7):
 *   1. Happy path — all three succeed; onStageComplete called 3× in order; result contains all three
 *   2. Prepare fails → runRender + runPublish never called → AllStageError with stage='prepare'
 *   3. Prepare succeeds, render fails → runPublish never called → AllStageError with stage='render'
 *   4. Prepare + render succeed, publish fails → AllStageError stage='publish' + onStageComplete×2
 *   5. --force forwarded to all three sub-stages
 *   6. lowRes forwarded ONLY to runRender (not runPrepare, not runPublish)
 *   7. AllStageError.message contains both stage label and original error message
 */

import { describe, it, expect, vi } from 'vitest';
import { runAll, AllStageError } from './all.js';
import type { RunAllOpts } from './all.js';
import type { PrepareResult } from '../prepare/index.js';
import type { RenderResult } from '../render/index.js';
import type { RunPublishResult } from '../publish/runner.js';

// ---------------------------------------------------------------------------
// Stub return values — minimal shapes matching the real return types
// ---------------------------------------------------------------------------

const PREPARE_RESULT: PrepareResult = {
  skipped: false,
  reason: 'first-run',
  manifest: {
    schemaVersion: 1,
    folderName: '2026-05-13_vs_united_3-1',
    kid: 'leo',
    game: {
      date: '2026-05-13',
      opponent: 'united',
      scoreFor: 3,
      scoreAgainst: 1,
      result: 'win',
    },
    clips: [],
    totalDurationSec: 0,
    manifestHash: 'abc123',
  },
  manifestPath: '/tmp/golazo/.golazo/manifest.json',
};

const RENDER_RESULT: RenderResult = {
  skipped: false,
  reason: 'first-render',
  episodePath: '/tmp/golazo/.golazo/episode.mp4',
  thumbnailPath: '/tmp/golazo/.golazo/thumb.png',
  manifest: {
    ...PREPARE_RESULT.manifest,
  },
};

const PUBLISH_RESULT: RunPublishResult = {
  skipped: false,
  reason: 'first-publish',
  publishRecordPath: '/tmp/golazo/.golazo/publish.json',
  record: {
    videoId: 'test-video-id',
    watchUrl: 'https://youtu.be/test-video-id',
    uploadedAt: '2026-05-13T10:00:00.000Z',
    channelId: 'UC_FIXTURE_LEO_CHANNEL_ID',
    privacyStatus: 'unlisted',
  },
};

// ---------------------------------------------------------------------------
// Test helper: build base opts with all three mocked
// ---------------------------------------------------------------------------

function makeOpts(overrides: Partial<RunAllOpts> = {}): RunAllOpts {
  return {
    folderPath: '/tmp/golazo/2026-05-13_vs_united_3-1',
    runPrepare: vi.fn().mockResolvedValue(PREPARE_RESULT),
    runRender: vi.fn().mockResolvedValue(RENDER_RESULT),
    runPublish: vi.fn().mockResolvedValue(PUBLISH_RESULT),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runAll orchestrator', () => {
  it('1. happy path: all three succeed, onStageComplete called 3× in order, result contains all three', async () => {
    const stages: string[] = [];
    const opts = makeOpts({
      onStageComplete: (stage) => { stages.push(stage); },
    });

    const result = await runAll(opts);

    expect(stages).toEqual(['prepare', 'render', 'publish']);
    expect(result.prepare).toBe(PREPARE_RESULT);
    expect(result.render).toBe(RENDER_RESULT);
    expect(result.publish).toBe(PUBLISH_RESULT);
    expect(opts.runPrepare).toHaveBeenCalledOnce();
    expect(opts.runRender).toHaveBeenCalledOnce();
    expect(opts.runPublish).toHaveBeenCalledOnce();
  });

  it('2. prepare fails: runRender + runPublish NOT called, throws AllStageError with stage="prepare"', async () => {
    const prepareError = new Error('FilenameError: bad folder name');
    const opts = makeOpts({
      runPrepare: vi.fn().mockRejectedValue(prepareError),
    });

    let caught: unknown;
    try {
      await runAll(opts);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AllStageError);
    const stageErr = caught as AllStageError;
    expect(stageErr.stage).toBe('prepare');
    expect(stageErr.originalError).toBe(prepareError);
    expect(opts.runRender).not.toHaveBeenCalled();
    expect(opts.runPublish).not.toHaveBeenCalled();
  });

  it('3. prepare succeeds, render fails: runPublish NOT called, throws AllStageError with stage="render"', async () => {
    const renderError = new Error('RenderError: missing manifest');
    const opts = makeOpts({
      runRender: vi.fn().mockRejectedValue(renderError),
    });

    let caught: unknown;
    try {
      await runAll(opts);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AllStageError);
    const stageErr = caught as AllStageError;
    expect(stageErr.stage).toBe('render');
    expect(stageErr.originalError).toBe(renderError);
    expect(opts.runPrepare).toHaveBeenCalledOnce();
    expect(opts.runPublish).not.toHaveBeenCalled();
  });

  it('4. prepare + render succeed, publish fails: AllStageError stage="publish", onStageComplete called ×2', async () => {
    const publishError = new Error('QuotaExceededError: daily limit');
    const stages: string[] = [];
    const opts = makeOpts({
      runPublish: vi.fn().mockRejectedValue(publishError),
      onStageComplete: (stage) => { stages.push(stage); },
    });

    let caught: unknown;
    try {
      await runAll(opts);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AllStageError);
    const stageErr = caught as AllStageError;
    expect(stageErr.stage).toBe('publish');
    expect(stageErr.originalError).toBe(publishError);
    expect(stages).toEqual(['prepare', 'render']);
  });

  it('5. --force forwarded to all three sub-stages', async () => {
    const opts = makeOpts({ force: true });

    await runAll(opts);

    expect((opts.runPrepare as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({ force: true });
    expect((opts.runRender as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({ force: true });
    expect((opts.runPublish as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({ force: true });
  });

  it('6. lowRes forwarded ONLY to runRender, NOT to runPrepare or runPublish', async () => {
    const opts = makeOpts({ lowRes: true });

    await runAll(opts);

    const prepareArg = (opts.runPrepare as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    const renderArg = (opts.runRender as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    const publishArg = (opts.runPublish as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;

    expect(prepareArg).not.toHaveProperty('lowRes');
    expect(renderArg).toMatchObject({ lowRes: true });
    expect(publishArg).not.toHaveProperty('lowRes');
  });

  it('7. AllStageError.message contains stage label AND original error message', async () => {
    const originalMessage = 'FilenameError: Expected format: YYYY-MM-DD_vs_<slug>_<for>-<against>';
    const opts = makeOpts({
      runPrepare: vi.fn().mockRejectedValue(new Error(originalMessage)),
    });

    let caught: unknown;
    try {
      await runAll(opts);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AllStageError);
    const stageErr = caught as AllStageError;
    expect(stageErr.message).toContain('prepare');
    expect(stageErr.message).toContain(originalMessage);
  });
});
