---
phase: "03-publish-pipeline"
plan: "05"
subsystem: "publish/runner + cli/publish"
tags:
  - orchestrator
  - idempotency
  - publishRecord
  - cli
  - nock
  - integration-test
  - unlisted-privacy
dependency_graph:
  requires:
    - 03-01: loadToken (OAuth2Client)
    - 03-02: renderTemplates (called inside uploadEpisode, transparent to runner)
    - 03-03: uploadEpisode + PRIVACY_STATUS const
    - 03-04: publishWithRetry + QuotaExceededError
    - 01-05: readManifest + writeManifest (PREP-07 invariant preserved)
    - 01-02: loadChannel (ChannelConfig)
    - 02-04: registerRenderCommand CLI pattern (mirrored for publish)
  provides:
    - src/publish/publishRecord.ts: publishRecordSchema (z.literal('unlisted') gate), readPublishRecord, writePublishRecord, PUBLISH_RECORD_FILE_NAME
    - src/publish/runner.ts: runPublish orchestrator (11-step algorithm); PublishReason, RunPublishOpts, RunPublishResult, PublishError
    - src/publish/errors.ts: PublishError (5th error class)
    - src/cli/commands/publish.ts: real golazo publish <folder> handler (replaces Plan 01-01 stub)
    - src/cli/publish.integration.test.ts: 8-case integration test file
  affects:
    - 04-convenience-qa-polish: golazo all chain consumes frozen output strings
tech_stack:
  added: []
  patterns:
    - "z.literal('unlisted') + const _binding = 'unlisted' satisfies typeof PRIVACY_STATUS — dual schema+typecheck privacy gate"
    - "publish.json written ONLY after publishWithRetry resolves (PUB-06 quota-no-write contract)"
    - "in-process nock tests (block 1) + shell-out spawn tests (block 2) split for nock boundary"
    - "vi.stubEnv('HOME', sandbox) for tilde-path resolution in channels.yaml during tests"
key_files:
  created:
    - src/publish/publishRecord.ts
    - src/publish/publishRecord.test.ts
    - src/publish/runner.ts
    - src/publish/runner.test.ts
    - src/cli/publish.integration.test.ts
  modified:
    - src/publish/errors.ts (PublishError — 5th error class appended)
    - src/publish/errors.test.ts (cases 17-20 added; total: 20)
    - src/publish/index.ts (publishRecord + runner surface exported)
    - src/cli/commands/publish.ts (Plan 01-01 stub replaced with real handler)
    - src/cli/index.test.ts (publish removed from stub-assertion table; registration-only test added)
decisions:
  - "const _privacyStatusBinding = 'unlisted' satisfies typeof PRIVACY_STATUS rather than type alias — oxc/vite parser requires value-level satisfies expression; the grep gate and compile-time check both work"
  - "publish.json written ONLY at step 10 (after publishWithRetry resolves) — quota/auth/retry errors skip the write entirely. PUB-06 contract enforced at orchestrator, not error handler"
  - "vi.stubEnv('HOME', sandbox) in runner.test.ts beforeEach — channels.yaml's tilde-path oauth_token requires HOME to resolve correctly via os.homedir()"
  - "In-process nock (block 1) vs shell-out spawn (block 2) split — nock does not propagate to child processes. In-process covers quota/force/idempotency; shell-out covers missing-files/stub-gate/token-safety"
  - "Fake token written to sandbox in makeSandbox() with far-future expiry_date — loadToken skips eager refresh when expiry_date > Date.now()"
  - "T-03-24 (idempotency-skip on deleted YouTube video) accepted risk — operator must delete publish.json manually if video was removed from YouTube Studio"
metrics:
  duration: "~12 min"
  completed: "2026-05-14"
  tasks_completed: 3
  files_changed: 10
  tests_added: 35
  total_tests: 367
---

# Phase 03 Plan 05: runPublish Orchestrator + CLI Handler — Summary

**One-liner:** End-to-end publish pipeline: publishRecordSchema with z.literal('unlisted') privacy gate, 11-step runPublish orchestrator with PUB-06/PUB-07 idempotency, and real `golazo publish <folder>` CLI handler replacing the Plan 01-01 stub; 367 tests pass.

## Performance

- **Duration:** ~12 min
- **Tasks:** 3
- **Files changed:** 10
- **Tests added:** 35 (15 publishRecord+errors + 12 runner + 8 integration)
- **Total tests:** 367/367 passing (28 test files)

## Accomplishments

### Task 1: PublishError + publishRecordSchema (commit aa38984)

- `PublishError` added as the 5th error class in `errors.ts`; 4 test cases; `errors.test.ts` now has 20 cases total
- `publishRecord.ts`: `publishRecordSchema` with `z.literal('unlisted')` — the runtime hard gate for the unlisted-only constraint; case 6 explicitly rejects `'public'`
- Compile-time bridge: `const _privacyStatusBinding = 'unlisted' satisfies typeof PRIVACY_STATUS` — if `PRIVACY_STATUS` drifts, `npx tsc --noEmit` fails immediately
- `writePublishRecord` validates via `.parse()` BEFORE writing; `readPublishRecord` returns `null` on missing, throws `PublishError` on corrupt
- `index.ts` barrel extended; 11 test cases pass

### Task 2: runPublish Orchestrator (commit 9c25586)

- `runner.ts`: 11-step algorithm — manifest check → file checks → `loadChannel` → idempotency → `loadToken` → `publishWithRetry` → `writePublishRecord`
- `PRIVACY_STATUS` imported explicitly as grep gate; no bare `'unlisted'` string at orchestrator level
- PUB-06: `publish.json` written ONLY after `publishWithRetry` resolves (step 10); quota/auth/retry paths leave folder clean
- PUB-07: existing `videoId` short-circuits without any network call; `--force` overrides
- 12 test cases covering all paths; runner barrel extended

### Task 3: CLI Handler + Integration Tests (commit 2ded1cf)

- `publish.ts` stub replaced with real handler; frozen output strings for Phase 4 chain:
  - first-publish: `video published → <watchUrl> (channel: <channelId>)`
  - video-exists: `publish up to date (videoId: <videoId>)`
  - force: `video re-published (force) → <watchUrl>`
- `index.test.ts`: publish removed from stub-assertion table; registration-only test added; `all` row remains (Phase 4)
- `publish.integration.test.ts`: 8 cases — 4 in-process (nock) for happy/idempotency/force/quota, 4 shell-out for missing-manifest/missing-episode/stub-gate/token-safety

## Phase 3 Success Criteria Status

| Criterion | Status |
|-----------|--------|
| `golazo auth <kid>` OAuth flow | Plan 03-01 |
| `golazo publish <folder>` uploads unlisted + thumbnail + templates | Plans 03-02 + 03-03 + 03-05 |
| prettyOpponent reuse in templates | Plan 03-02 |
| 3x retry with 1s/4s/16s backoff; quota fails loudly | Plans 03-04 + 03-05 |
| publish.json idempotency; `--force` override | Plan 03-05 |

All 5 success criteria met. Phase 3 is fully shippable.

## Frozen Contract: runPublish Algorithm

```typescript
async function runPublish(opts: RunPublishOpts): Promise<RunPublishResult>
```

1. `resolve(opts.folderPath)` → `absFolder`
2. `readManifest(absFolder)` → null: `PublishError(manifestPath, 'manifest not found')`
3. `existsSync(episode.mp4)` → missing: `PublishError(episodePath, 'episode.mp4 not found')`
4. `existsSync(thumb.png)` → missing: `PublishError(thumbnailPath, 'thumb.png not found')`
5. `loadChannel(manifest.kid, { path: opts.channelsPath })`
6. `readPublishRecord(absFolder)` → if `existing.videoId && !opts.force`: return `skipped`
7. `loadToken(channel, { clientId, clientSecret })` — propagates `OAuthError`
8. Build `UploadEpisodeArgs`
9. `publishWithRetry(args, opts.retryOpts)` — propagates all errors
10. `writePublishRecord(absFolder, record)` ← ONLY on success
11. Return `{ skipped: false, reason, publishRecordPath, record }`

## Grep Gates: All GREEN

| Gate | Status |
|------|--------|
| `grep -q "import { PRIVACY_STATUS } from './uploader.js'" src/publish/publishRecord.ts` | GREEN |
| `grep -q "satisfies typeof PRIVACY_STATUS" src/publish/publishRecord.ts` | GREEN |
| `grep -q "PRIVACY_STATUS" src/publish/runner.ts` | GREEN |
| `! grep -q "publish: not yet implemented" src/cli/commands/publish.ts` | GREEN |
| `grep -q "z.literal('unlisted')" src/publish/publishRecord.ts` | GREEN |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `type` alias `satisfies` rejected by oxc/vite parser**

- **Found during:** Task 1 GREEN phase
- **Issue:** `type _PrivacyStatusBinding = 'unlisted' satisfies typeof PRIVACY_STATUS;` is not valid TypeScript type alias syntax (satisfies is a value-level operator). oxc rejected it with PARSE_ERROR.
- **Fix:** Changed from `type _PrivacyStatusBinding =` to `const _privacyStatusBinding =` — a value-level expression statement that both oxc and tsc accept. The satisfies operator works identically and both grep gates pass.
- **Files modified:** `src/publish/publishRecord.ts`
- **Commit:** aa38984

**2. [Rule 1 - Bug] `vi.stubEnv('HOME', ...)` needed in runner.test.ts beforeEach**

- **Found during:** Task 2 GREEN phase
- **Issue:** `loadChannel` in `runner.ts` calls `homedir()` internally to expand tilde-paths. Without `vi.stubEnv('HOME', sandbox)`, `~/tests/fixtures/golazo/leo.token.json` resolved to the real user's home, failing with `ChannelsConfigError` (token file not found).
- **Fix:** Added `vi.stubEnv('HOME', sandbox)` in `beforeEach` and `vi.unstubAllEnvs()` in `afterEach`.
- **Files modified:** `src/publish/runner.test.ts`
- **Commit:** 9c25586

**3. [Rule 1 - Bug] In-process integration tests need fake token in sandbox**

- **Found during:** Task 3 GREEN phase
- **Issue:** `leo.token.json` is `{}` (empty). `loadToken` calls `client.setCredentials({})` then the googleapis SDK throws "No access, refresh token, API key..." when the API is called.
- **Fix:** `makeSandbox()` writes a fake token with `expiry_date: Date.now() + 365 days` so `loadToken` constructs the client without triggering eager refresh.
- **Files modified:** `src/cli/publish.integration.test.ts`
- **Commit:** 2ded1cf

**4. [Rule 1 - Bug] Shell-out tests needed HOME set before `runPrepare`**

- **Found during:** Task 3 GREEN phase
- **Issue:** Shell-out integration tests (cases 6, 8) called `runPrepare` without setting `process.env.HOME` to the sandbox first. `resolveKidFromPath` → `loadChannelsFile` expanded the tilde-path to `/Users/me/tests/fixtures/...` instead of the sandbox.
- **Fix:** Temporarily set/restore `process.env.HOME = sandbox` around each `runPrepare` call in cases 6 and 8.
- **Files modified:** `src/cli/publish.integration.test.ts`
- **Commit:** 2ded1cf

## T-03-24 Accepted Risk Documentation

If an operator deletes the YouTube video from YouTube Studio AND does NOT specify `--force`, the next `golazo publish` run will short-circuit (idempotency check sees existing `publish.json` with `videoId`) and NOT re-upload. Detection would require a `youtube.videos.list` API call on each run — out of scope for v1.

**Operator remediation:** delete `.golazo/publish.json` to force re-upload on the next run.

## Known Stubs

None — `golazo publish <folder>` is fully implemented end-to-end.

## Threat Flags

No new trust boundaries introduced. Threat mitigations from plan:

| Threat | Component | Status |
|--------|-----------|--------|
| T-03-20 (public record) | publishRecordSchema z.literal('unlisted') | Mitigated — case 6 rejects 'public' |
| T-03-21 (overwrite on retry) | runner.ts step 10 | Mitigated — only written on success |
| T-03-22 (CLI token logging) | integration test case 8 | Mitigated — tokens absent from stdout/stderr |
| T-03-23 (uploadedAt on --force) | clock forwarded via args | Mitigated — fresh timestamp per run |
| T-03-24 (deleted-video skip) | accepted | Documented above |

## Self-Check: PASSED

Files verified:

- `/Users/me/Documents/code/golazo/src/publish/publishRecord.ts` — FOUND
- `/Users/me/Documents/code/golazo/src/publish/publishRecord.test.ts` — FOUND
- `/Users/me/Documents/code/golazo/src/publish/runner.ts` — FOUND
- `/Users/me/Documents/code/golazo/src/publish/runner.test.ts` — FOUND
- `/Users/me/Documents/code/golazo/src/cli/commands/publish.ts` (stub replaced) — FOUND
- `/Users/me/Documents/code/golazo/src/cli/publish.integration.test.ts` — FOUND
- `/Users/me/Documents/code/golazo/src/publish/errors.ts` (PublishError added) — FOUND

Commits verified:
- aa38984: feat(03-05): Task 1
- 9c25586: feat(03-05): Task 2
- 2ded1cf: feat(03-05): Task 3

Test results: 367/367 passing (28 test files)
