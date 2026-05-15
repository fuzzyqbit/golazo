---
phase: 04-convenience-qa-polish
plan: "01"
subsystem: cli
tags: [orchestrator, integration-test, all-command, stage-error]
dependency_graph:
  requires:
    - 01-05 # runPrepare orchestrator
    - 02-04 # runRender orchestrator
    - 03-05 # runPublish orchestrator
  provides:
    - runAll orchestrator (src/cli/all.ts)
    - golazo all CLI handler (src/cli/commands/all.ts)
    - all integration tests (src/cli/all.integration.test.ts)
  affects:
    - src/cli/index.test.ts (stub-error row removed, registration-only row added)
tech_stack:
  added: []
  patterns:
    - dependency-injection-orchestrator # runPrepare/runRender/runPublish injectable for tests
    - onStageComplete-callback # incremental stdout emission without buffering
    - AllStageError-wrapping # stage-labeled error propagation
key_files:
  created:
    - src/cli/all.ts
    - src/cli/all.test.ts
    - src/cli/all.integration.test.ts
  modified:
    - src/cli/commands/all.ts
    - src/cli/index.test.ts
decisions:
  - "AllStageError.message = `stage '<stage>' failed: <originalError.message>` — CLI handler extracts originalError.message separately so it can write the error first, then the stage label"
  - "Dependency injection pattern: runPrepare/runRender/runPublish injectable via RunAllOpts so unit tests use vi.fn() without module-level hoisting"
  - "onStageComplete callback allows CLI handler to emit each sub-stage's frozen stdout line incrementally (not after all three finish)"
  - "lowRes forwarded ONLY to runRender; force + channelsPath forwarded to all three sub-stages"
  - "clientId, clientSecret, retryOpts, clock forwarded ONLY to runPublish"
  - "Stage label format frozen as: golazo all: stage '<stage>' failed (per PLAN must_have truths)"
  - "No artifact cleanup on failure — earlier stages' side-effects (manifest.json, episode.mp4, thumb.png) persist after a later-stage failure"
  - "In-process tests with nock (Block 1) chosen for happy path, idempotent, force, prepare-fail, publish-fail cases — nock does not cross process boundaries"
metrics:
  duration: "9 min 54 s"
  completed: "2026-05-14"
  tasks: 2
  files: 5
---

# Phase 04 Plan 01: golazo all Orchestrator Summary

**One-liner:** Sequential prepare→render→publish chain via AllStageError stage-labeling, incremental stdout via onStageComplete, 380 tests green.

## What Was Built

### Task 1: runAll orchestrator + unit tests

`src/cli/all.ts` exports:

- `AllStage` — union type `'prepare' | 'render' | 'publish'`
- `AllStageError` — extends Error; fields: `stage: AllStage`, `originalError: Error`. Message format: `stage '<stage>' failed: <originalError.message>`
- `RunAllOpts` — `folderPath, channelsPath?, force?, lowRes?, clientId?, clientSecret?, retryOpts?, clock?, onStageComplete?, runPrepare?, runRender?, runPublish?`
- `RunAllResult` — `{ prepare: PrepareResult, render: RenderResult, publish: RunPublishResult }`
- `runAll(opts)` — async orchestrator

**Algorithm:**
1. Call `runPrepare({ folderPath, channelsPath, force })` — catch → `AllStageError('prepare', err)`
2. `onStageComplete('prepare', result)`
3. Call `runRender({ folderPath, channelsPath, force, lowRes })` — catch → `AllStageError('render', err)`
4. `onStageComplete('render', result)`
5. Call `runPublish({ folderPath, channelsPath, force, clientId, clientSecret, retryOpts, clock })` — catch → `AllStageError('publish', err)`
6. `onStageComplete('publish', result)`
7. Return `RunAllResult`

7 unit tests in `src/cli/all.test.ts`: happy path, prepare-fail, render-fail, publish-fail, force forwarding, lowRes routing, AllStageError.message content.

### Task 2: CLI handler swap + integration tests

`src/cli/commands/all.ts` — Plan 01-01 stub replaced:
- Options: `--force`, `--channels-config`, `--low-res`
- `onStageComplete` emits frozen stdout lines per sub-stage (verbatim from prepare/render/publish handlers)
- On `AllStageError`: writes `originalError.message\n` then `golazo all: stage '<stage>' failed\n` to stderr, throws `CommanderError(1, ...)`

`src/cli/index.test.ts` — stub-error row removed; `all` registration-only assertion added.

`src/cli/all.integration.test.ts` — 6 integration test cases (in-process with nock + shell-out):
1. Happy path: exit 0, three frozen stdout lines in order, all 4 artifacts present, nock consumed
2. Idempotent re-run: skip lines emitted, no YouTube calls
3. `--force` re-runs all three: force output strings, nock consumed
4. Prepare stage failure: exit 1, FilenameError + stage label in stderr, no `.golazo/` dir
5. Publish stage failure (quota): exit 1, quota message + stage label, earlier artifacts preserved
6. Stub removal gate + token leakage: `all: not yet implemented` absent; mock token bytes absent from output

## Frozen Contracts

### Stage label format

```
golazo all: stage 'prepare' failed
golazo all: stage 'render' failed
golazo all: stage 'publish' failed
```

Written to stderr after `originalError.message` (which appears on the preceding line).

### Prepare stdout strings (forwarded from prepare handler)

```
manifest written to <path> (<n> clips, <s>s total)
manifest up to date (hash matches)
manifest updated (content changed) -> <path> (<n> clips, <s>s total)
manifest rewritten (force) -> <path>
```

### Render stdout strings (forwarded from render handler)

```
episode rendered → <episodePath> + <thumbnailPath> (<s>s)
render up to date (hash matches)
episode re-rendered (content changed) → <episodePath>
episode re-rendered (force) → <episodePath>
```

### Publish stdout strings (forwarded from publish handler)

```
video published → <watchUrl> (channel: <channelId>)
publish up to date (videoId: <videoId>)
video re-published (force) → <watchUrl>
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all stub lines removed. `grep -rn "not yet implemented" src/` returns only test assertion strings, no active stubs.

## Test Results

- Task 1: 7/7 unit tests passing
- Task 2: 6/6 integration tests passing
- Full suite: 380/380 tests passing (367 prior + 7 unit + 6 integration)
- TypeScript: `npx tsc --noEmit -p tsconfig.check.json` exits 0

## Notes for Plan 04-03

Plan 04-03 integration tests can reuse the `all.integration.test.ts` shell-out pattern:
- `runCli(['all', folder, '--channels-config', channels, '--low-res'], env)` for shell-out cases
- `main(['node', 'golazo', 'all', folder, ...])` for in-process nock cases
- `GOLAZO_OAUTH_MOCK=1` + `nock.disableNetConnect()` + `nock.enableNetConnect('127.0.0.1')` for YouTube API stubbing
- Sandbox pattern: `makeSandbox()` → copies fixture dir + writes fake tokens → returns tmpdir root
- Nock does NOT cross process boundaries — in-process Block 1 for HTTP-intercepted cases, shell-out Block 2 for pre-network failures

## Self-Check: PASSED

All files present on disk. Both task commits verified in git log:
- `4b486e8` — feat(04-01): implement runAll orchestrator + unit tests
- `81cab03` — feat(04-01): swap all CLI stub; add integration tests
