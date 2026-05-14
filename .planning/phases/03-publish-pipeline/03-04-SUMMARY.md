---
phase: 03-publish-pipeline
plan: "04"
subsystem: publish
tags:
  - retry
  - backoff
  - quota
  - error-classification
  - tdd
dependency_graph:
  requires:
    - 03-03-SUMMARY.md  # uploadEpisode signature (wrapped by publishWithRetry)
    - 03-01-SUMMARY.md  # OAuthError (classified as fatal)
    - 03-02-SUMMARY.md  # TemplateError (implicitly loaded via errors.ts)
  provides:
    - publishWithRetry(args, retryOpts) — production entry point for Plan 03-05
    - classifyError(err) — pure classifier for Plan 03-05's CLI handler
    - withRetry(fn, opts) — generic retry wrapper
    - QuotaExceededError — distinct error class for "rerun tomorrow" remediation
    - DEFAULT_RETRY_DELAYS_MS — frozen [1000, 4000, 16000] ms contract
  affects:
    - src/publish/index.ts  # barrel extended with retry surface
tech_stack:
  added: []
  patterns:
    - injectable sleep for test determinism (no real delays in tests)
    - injectable clock for resumeAtHint computation
    - pure error classifier (no I/O)
    - onAttemptFail observer hook for CLI logging
key_files:
  created:
    - src/publish/retry.ts
    - src/publish/retry.test.ts
  modified:
    - src/publish/errors.ts   # added QuotaExceededError (4th error class)
    - src/publish/errors.test.ts  # added 4 QuotaExceededError cases (13-16; total 16)
    - src/publish/index.ts    # barrel extended with retry surface
decisions:
  - "classifyError checks two googleapis error-body shapes for 403 quotaExceeded: err.errors[0].reason AND err.response.data.error.errors[0].reason — SDK version variance prevented"
  - "CLASSIFY_TEST_CASES table has 20 rows (not 19) because A11 tests both quota shapes; plan specified 19 but A11 split into A11a/A11b for completeness"
  - "lastErr must be a retriable error (5xx) for exhaustion test B5 — plain Error classified as fatal and re-thrown immediately, not wrapped"
  - "resumeAtHint = next UTC midnight (conservative; actual YouTube quota reset is midnight PT = 08:00 UTC PST / 07:00 UTC PDT)"
  - "publishWithRetry lambda re-invokes uploadEpisode on each retry so createReadStream is called fresh (fresh-stream semantics per Plan 03-03 contract)"
  - "__test_nextUtcMidnight exported with underscore prefix for test access only; Plan 03-05 does NOT import it"
metrics:
  duration: "5min 50s"
  completed: "2026-05-14"
  tasks: 1
  files: 5
---

# Phase 3 Plan 4: Retry Policy + Quota Classification Summary

**One-liner:** Retry wrapper with 1s/4s/16s backoff, QuotaExceededError on 403-quotaExceeded, and pure classifyError classifier; all 58 tests pass sub-second via injected sleep.

## What Was Built

### src/publish/retry.ts (NEW)

Production retry module. Exports:

| Export | Type | Purpose |
|--------|------|---------|
| `DEFAULT_RETRY_DELAYS_MS` | `readonly number[]` | `[1000, 4000, 16000]` — PUB-05 contract |
| `classifyError(err)` | pure function | Classify any thrown value as retriable / quota / fatal |
| `withRetry(fn, opts)` | async function | Generic retry wrapper; injectable sleep + clock |
| `publishWithRetry(args, retryOpts)` | async function | Wraps `uploadEpisode` with retry policy |
| `__test_nextUtcMidnight(now)` | function | Internal helper exported for tests (D1-D4) |
| `ErrorClassification` | interface | `{ kind, reason, detail? }` |
| `WithRetryOpts` | interface | `{ delaysMs?, sleep?, clock?, onAttemptFail? }` |

### Retry Policy (PUB-05 closed)

- **Attempts:** 4 total (initial + 3 retries)
- **Backoff delays:** 1000ms → 4000ms → 16000ms (cumulative worst-case: 21000ms)
- **Retriable:** HTTP 5xx, 429, network drops (ECONNRESET/ETIMEDOUT/ENOTFOUND/EAI_AGAIN/EPIPE)
- **Exhaustion:** Throws `Error` with message `upload failed after N attempts: ...` and `{ cause: lastErr }`
- **Threat T-03-16:** Hard cap enforced by `attempt >= delaysMs.length` — no code path extends limit

### Quota Handling (PUB-06 closed)

- **Trigger:** HTTP 403 + `errors[0].reason === 'quotaExceeded'` (checks TWO error-body shapes)
- **Action:** Immediate `QuotaExceededError` throw — NO retry
- **Shape 1:** `err.errors[0].reason === 'quotaExceeded'`
- **Shape 2:** `err.response.data.error.errors[0].reason === 'quotaExceeded'`
- **Threat T-03-17:** Both shapes tested by cases A11a and A11b
- **CRITICAL:** Quota path does NOT result in `publish.json` being written — enforced by Plan 03-05's orchestrator (which never reaches the write step when `publishWithRetry` throws)

### QuotaExceededError (src/publish/errors.ts — extended)

```
message: "publish: quota: <reason>. Rerun after <resumeAtHint>."
reason: string  // default 'YouTube daily upload quota exhausted'
resumeAtHint: string  // ISO 8601 UTC next-midnight
cause?: unknown  // underlying GaxiosError
```

**Timezone note:** YouTube's actual quota reset is midnight Pacific Time (08:00 UTC PST, 07:00 UTC PDT). The `resumeAtHint` is next UTC midnight — a conservative estimate. The operator may need to wait a few additional hours in the worst case. Plan 03-05's help text should document this timezone reality so the operator isn't confused when a 1 AM UTC retry is still rejected.

### Error Classification Matrix (pinned for Plan 03-05)

| Input | kind | reason | detail |
|-------|------|--------|--------|
| ECONNRESET/ETIMEDOUT/ENOTFOUND/EAI_AGAIN/EPIPE | retriable | 'network' | err.code |
| HTTP 5xx | retriable | '5xx' | String(status) |
| HTTP 429 | retriable | 'rate-limited' | '429' |
| HTTP 403 + quotaExceeded | quota | 'quotaExceeded' | — |
| HTTP 403 other reason | fatal | '4xx' | '403' |
| HTTP 4xx (non-403) | fatal | '4xx' | String(status) |
| instanceof UploadError | fatal | err.message | — |
| instanceof OAuthError | fatal | err.message | — |
| instanceof QuotaExceededError | quota | err.message | — |
| anything else | fatal | 'unclassified' | String(err) |

### Resumable Upload Pattern

`publishWithRetry` uses a lambda `() => uploadEpisode(args)` so `createReadStream(episodePath)` is re-invoked fresh on each retry attempt. The googleapis SDK's multipart upload issues a clean HTTP request per attempt — fresh-stream semantics confirmed by Plan 03-03's note that `createReadStream` is called inside the function body, not at args binding time.

### onAttemptFail Observer (Threat T-03-19)

Plan 03-05's CLI handler MAY register an observer to emit retry progress:
```
retry 1/3 after 1s: 5xx (503)
retry 2/3 after 4s: 5xx (502)
```

**SECURITY constraint:** The observer MUST log only `classification.kind` + `classification.detail`, NEVER `err.message` — the latter may contain auth tokens or response headers from the googleapis SDK. This is documented as Threat T-03-19 in the plan's threat model.

## Test Coverage

| Section | Cases | Description |
|---------|-------|-------------|
| classifyError (PART A) | 21 | 20 table-driven + 1 undefined case |
| withRetry (PART B) | 13 | Success paths, exhaustion, quota, fatal, mixed, observer |
| publishWithRetry (PART C) | 3 | Passthrough success/retries/quota via vi.mock |
| nextUtcMidnight (PART D) | 4 | Mid-day, at-midnight, end-of-month |
| **errors.test.ts added** | 4 | QuotaExceededError cases 13-16 |
| **Total new** | **45** | (42 in retry.test.ts + 4 in errors.test.ts; 1 PART A re-used A19b adds 1) |

Full suite: **332 tests passing** (up from 287 before this plan).

All retry tests complete in ~11ms — injected sleep means no real 21-second waits.

## Deviations from Plan

### 1. [Rule 1 - Bug] CLASSIFY_TEST_CASES row-count gate updated to 20

**Found during:** Task 1 GREEN phase
**Issue:** The plan specified 19 classify cases, but A11 was split into two sub-cases (A11a and A11b) to test both googleapis error-body shapes. The table naturally has 20 rows.
**Fix:** Updated the row-count gate assertion from 19 to 20 with an explanatory comment.
**Files modified:** src/publish/retry.test.ts
**Commit:** ed9296d

### 2. [Rule 1 - Bug] B5 test used plain Error for lastErr (classified fatal, not retriable)

**Found during:** Task 1 GREEN phase
**Issue:** Initial B5 test used `new Error('last failure')` for all 4 rejections, but plain `Error` objects are classified as `fatal` and re-thrown immediately — the test never reached the exhaustion path. Additionally the test structure was needlessly complex (two separate withRetry calls with shared recorder).
**Fix:** All 4 rejections in B5 use `{ response: { status: 5xx } }` shapes so they're correctly classified as retriable and the retry exhaustion wrapper is triggered.
**Files modified:** src/publish/retry.test.ts
**Commit:** ed9296d

### 3. [Rule 1 - Bug] C3 sleep assertion used non-spy function

**Found during:** Task 1 GREEN phase
**Issue:** `makeSleepRecorder()` returns a plain `async function`, not a vitest spy — `expect(sleep).not.toHaveBeenCalled()` fails with "not a spy" error.
**Fix:** C3 uses `vi.fn(async (_ms) => {})` directly instead of `makeSleepRecorder()`.
**Files modified:** src/publish/retry.test.ts
**Commit:** ed9296d

## Known Stubs

None — this plan adds no UI-facing rendering paths and no data source wiring.

## Threat Flags

None. This plan adds policy on top of Plan 03-03's upload boundary; no new external surfaces. Existing threats T-03-16 through T-03-19 are documented in the plan's threat model and mitigated by implementation + tests.

## Self-Check: PASSED
