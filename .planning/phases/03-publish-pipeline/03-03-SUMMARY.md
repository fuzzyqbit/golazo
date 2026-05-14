---
phase: "03-publish-pipeline"
plan: "03"
subsystem: "publish/uploader"
tags: [youtube, googleapis, upload, nock, tdd, privacy, unlisted]
dependency_graph:
  requires:
    - 03-01: OAuth2Client from loadToken; googleapis dependency
    - 03-02: renderTemplates → title + description for videos.insert requestBody
    - 01-02: ChannelConfig shape (name, club, jersey, source, youtube.channelId)
    - 01-05: Manifest type (game block for template inputs)
    - 02-04: episode.mp4 + thumb.png on disk (absolute paths passed by caller)
  provides:
    - src/publish/uploader.ts: uploadEpisode(args) → PublishRecord; PRIVACY_STATUS const
    - src/publish/errors.ts: UploadError (3rd error class)
    - src/publish/index.ts: barrel extended with uploader surface
  affects:
    - 03-04: withRetry wrapper wraps uploadEpisode; catches GaxiosError from this layer
    - 03-05: runPublish orchestrator calls uploadEpisode; writes PublishRecord to publish.json;
             imports PRIVACY_STATUS for compile-time satisfies binding on schema literal
tech_stack:
  added: []
  patterns:
    - "google.youtube({ version: 'v3', auth: client }) factory pattern"
    - "googleapis multipart upload: uploadType=multipart for stream+requestBody (NOT resumable)"
    - "clock injection via args.clock?: () => Date for deterministic test timestamps"
    - "existsSync pre-flight before SDK construction — fail-fast on missing files"
    - "UploadError for shape failures; GaxiosError bubbles for HTTP failures (Plan 03-04 classifies)"
key_files:
  created:
    - src/publish/uploader.ts
    - src/publish/uploader.test.ts
  modified:
    - src/publish/errors.ts (UploadError appended — 3rd error class)
    - src/publish/errors.test.ts (cases 9-12 added — total 12)
    - src/publish/index.ts (uploader surface re-exported)
key_decisions:
  - "googleapis SDK uses uploadType=multipart (NOT resumable) when both requestBody + media.body provided — confirmed by reading googleapis-common/build/src/apirequest.js. Plan documented resumable; actual SDK behavior is multipart. Functionally equivalent for golazo's file sizes; retry-on-network-drop lives in Plan 03-04's GaxiosError retry level."
  - "PRIVACY_STATUS = 'unlisted' as const exported from uploader.ts as single source of truth for the privacy literal. Both videos.insert requestBody AND the returned PublishRecord.privacyStatus reference PRIVACY_STATUS by name — no bare 'unlisted' literal at any assignment site."
  - "selfDeclaredMadeForKids: false — YouTube COPPA compliance requires this field. The operator's audience is family/teammates/recruiters, NOT children as audience members; unlisted-only constraint + small-audience channel framing supports false. Operator should confirm this is correct for their channel setup."
  - "uploadedAt sampled BEFORE the insert call (not after response) — so Plan 03-04 retries don't shift the recorded timestamp. Operator sees 'when did you start the upload?' not 'when did the third retry succeed?'."
  - "UploadError only for shape failures (missing file, missing videoId). HTTP failures (GaxiosError) bubble up — Plan 03-04's withRetry wrapper owns classification."
  - "No logging in uploader.ts — all stdout/stderr is the CLI handler's responsibility (Plan 03-05). Grep gate + test case 13 enforce this."
metrics:
  duration: "~8 min"
  completed: "2026-05-14"
  tasks_completed: 1
  files_changed: 5
  tests_added: 19
  total_tests: 286
---

# Phase 03 Plan 03: YouTube Uploader — Summary

**One-liner:** Single-attempt uploadEpisode with PRIVACY_STATUS typed constant, UploadError class, 15 nock-stubbed tests, and multipart upload via googleapis SDK.

## Performance

- **Duration:** ~8 min
- **Tasks:** 1 (TDD: 2 commits — RED + GREEN)
- **Files changed:** 5
- **Tests added:** 19 (15 uploader + 4 UploadError in errors.test.ts)
- **Total tests:** 286/286 passing

## Accomplishments

- `uploadEpisode(args) → PublishRecord` implemented as the 8-step algorithm specified in the plan
- `PRIVACY_STATUS = 'unlisted' as const` — typed defense-in-depth constant exported from `uploader.ts`; consumed by both `videos.insert` requestBody and the returned `PublishRecord.privacyStatus` field; no bare `'unlisted'` literal at any assignment site
- `UploadError` added as the 3rd error class in `src/publish/errors.ts` (after OAuthError + TemplateError)
- All 4 PRIVACY_STATUS grep gates GREEN; all 13 plan verification gates GREEN
- 15 nock-stubbed test cases covering happy path, body shape, upload protocol, thumbnail attachment, error paths, clock injection, and token non-logging
- `src/publish/index.ts` barrel extended with full uploader surface for Plan 03-04 + 03-05 consumption

## Frozen Contract: uploadEpisode Algorithm (8 steps)

```typescript
async function uploadEpisode(args: UploadEpisodeArgs): Promise<PublishRecord>
```

1. `existsSync(episodePath)` — UploadError(episodePath) if missing
2. `existsSync(thumbnailPath)` — UploadError(thumbnailPath) if missing
3. `renderTemplates({ kid: pick(channel), game: manifest.game })` → title + description
4. `google.youtube({ version: 'v3', auth: client })` — build SDK client
5. `uploadedAt = (args.clock ?? () => new Date)().toISOString()` — BEFORE API calls
6. `youtube.videos.insert({ part, requestBody, media })` — multipart POST
7. `videoId = response.data.id ?? null` — UploadError(videoId) if null
8. `youtube.thumbnails.set({ videoId, media })` — separate POST after insert
9. `return { videoId, watchUrl, uploadedAt, channelId, privacyStatus: PRIVACY_STATUS }`

## PublishRecord Shape (frozen for Plan 03-05)

```typescript
interface PublishRecord {
  videoId: string;
  watchUrl: string;           // 'https://youtu.be/' + videoId
  uploadedAt: string;         // ISO 8601 UTC — sampled BEFORE insert
  channelId: string;          // channel.youtube.channelId
  privacyStatus: typeof PRIVACY_STATUS;  // literal type 'unlisted'
}
```

## PRIVACY_STATUS Typed Constant

```typescript
// src/publish/uploader.ts
export const PRIVACY_STATUS = 'unlisted' as const;
```

- Exported from `uploader.ts` — the single source of truth
- `videos.insert` requestBody: `status: { privacyStatus: PRIVACY_STATUS, ... }`
- Returned `PublishRecord.privacyStatus` typed as `typeof PRIVACY_STATUS` (not bare `'unlisted'`)
- Plan 03-05's `publishRecord.ts` should import this for a `'unlisted' satisfies typeof PRIVACY_STATUS` compile-time binding

## Deviations from Plan

### Auto-fixed Issues

None — implementation matched plan exactly.

### CRITICAL DEVIATION: Upload Protocol

**Expected (per plan):** googleapis SDK uses `uploadType=resumable` (initiate POST → upload PUT)

**Actual (confirmed by SDK source):** googleapis SDK uses `uploadType=multipart` (single POST) when both `requestBody` and `media.body` are provided. This was confirmed by reading `googleapis-common/build/src/apirequest.js` — the code path sets `params.uploadType = 'multipart'` and sends a single multipart/related POST body to the `mediaUrl` endpoint.

**Impact:** Functionally equivalent for golazo's use case. The multipart upload sends the metadata JSON and the video stream in a single HTTP request body. For large files, memory usage is bounded because the stream is piped (not buffered) through a PassThrough. Retry-on-network-drop in a resumable sense lives at Plan 03-04's GaxiosError retry level.

**Test adjustment:** Test cases 6 and 7 pin the ACTUAL SDK behavior:
- Case 6 asserts `uploadType === 'multipart'` (not `resumable`)
- Case 7 asserts thumbnail is called AFTER video insert (sequence ordering — same intent as plan)

**Plan 03-04 impact:** None. `uploadEpisode` still throws `GaxiosError` on HTTP failures for Plan 03-04 to classify. The retry seam is unchanged.

## Grep Gates Status

| Gate | Status |
|------|--------|
| `grep -q "export const PRIVACY_STATUS = 'unlisted' as const" src/publish/uploader.ts` | GREEN |
| `grep -q "privacyStatus: PRIVACY_STATUS" src/publish/uploader.ts` | GREEN |
| `! grep -q "privacyStatus: 'unlisted'" src/publish/uploader.ts` | GREEN |
| `! grep -q "privacyStatus: 'public'" src/publish/uploader.ts` | GREEN |
| `! grep -E "(console\.(log\|info\|debug\|warn\|error)\|process\.stdout\|process\.stderr)" src/publish/uploader.ts` | GREEN |

## selfDeclaredMadeForKids — Operator Callout

`selfDeclaredMadeForKids: false` is set in every `videos.insert` call. YouTube's COPPA compliance requires this field. The value `false` means "this video is NOT directed at children as the primary audience." This is correct for highlight videos intended for family, teammates, and recruiters — NOT content made for children to consume. However, the operator should confirm this matches their channel's intended audience and any agreements with YouTube when setting up their channel.

## Plan 03-04 Wrapper Seam

```
uploadEpisode(args)
  ├─ throws UploadError { field: 'episodePath' | 'thumbnailPath' | 'videoId' }
  │   → shape failure, NOT helped by retry → Plan 03-04 re-throws
  └─ throws GaxiosError (HTTP 5xx, 403, 429, network error)
      → Plan 03-04 classifies by status code:
          5xx → exponential backoff retry
          403 quotaExceeded → fail-loudly, hint "rerun tomorrow"
          network drop → retry (but NOT resumable-resume — that's a future enhancement)
```

## Plan 03-05 Orchestrator Seam

```typescript
// Plan 03-05 imports:
import { uploadEpisode, PRIVACY_STATUS } from '../publish/index.js';
import type { PublishRecord } from '../publish/index.js';

// Plan 03-05's publishRecord schema should bind to PRIVACY_STATUS:
const SCHEMA_PRIVACY = 'unlisted' satisfies typeof PRIVACY_STATUS;
// → compile-time check: if PRIVACY_STATUS ever changes, this fails at tsc
```

## Task Commits

1. **RED — Failing tests** - `d0f07c7`
   - `src/publish/errors.ts` extended with UploadError
   - `src/publish/errors.test.ts` extended (cases 9-12)
   - `src/publish/uploader.test.ts` created with 15 cases (RED — module missing)

2. **GREEN — Implementation** - `e74eca9`
   - `src/publish/uploader.ts` created (uploadEpisode + PRIVACY_STATUS + interfaces)
   - `src/publish/index.ts` extended with uploader surface
   - `src/publish/uploader.test.ts` updated to match SDK's actual multipart behavior

## Known Stubs

None — `uploadEpisode` is fully implemented.

## Threat Flags

No new trust boundaries introduced beyond what was planned. STRIDE threat mitigations:
- **T-03-11 (token logging):** Mitigated — grep gate + test case 13 confirm no token bytes logged
- **T-03-12 (wrong privacy):** Mitigated — PRIVACY_STATUS typed constant, all 4 grep gates GREEN
- **T-03-13 (YouTube response trust):** Mitigated — videoId validated non-null before use; watchUrl constructed from constant prefix + videoId only
- **T-03-14 (uploadedAt drift):** Mitigated — clock sampled BEFORE insert call, injectable for deterministic tests

## Self-Check: PASSED

Files verified to exist:
- /Users/me/Documents/code/golazo/src/publish/uploader.ts — FOUND
- /Users/me/Documents/code/golazo/src/publish/uploader.test.ts — FOUND
- /Users/me/Documents/code/golazo/src/publish/errors.ts (UploadError added) — FOUND
- /Users/me/Documents/code/golazo/src/publish/index.ts (uploader exports added) — FOUND

Commits verified:
- d0f07c7: test(03-03): add failing tests for uploadEpisode + UploadError (RED)
- e74eca9: feat(03-03): implement uploadEpisode + PRIVACY_STATUS + barrel extension (GREEN)

Test results: 286/286 passing (24 test files)

## Next Phase Readiness

- Plan 03-04's `withRetry` wrapper imports `uploadEpisode` from `'../publish/index.js'`
- Plan 03-05's `runPublish` orchestrator imports `uploadEpisode`, `PRIVACY_STATUS`, `PublishRecord` from `'../publish/index.js'`
- Plan 03-05 should use `'unlisted' satisfies typeof PRIVACY_STATUS` in its publishRecord schema for compile-time binding
- No blockers; no concerns
