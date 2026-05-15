---
phase: 03-publish-pipeline
verified: 2026-05-14T15:15:00Z
status: passed
score: 5/5 must-haves verified (1 with override)
overrides_applied: 1
overrides:
  - must_have: "mid-upload drops resume via the YouTube resumable upload protocol"
    reason: "Episodes are ~50-200 MB on home/club network. Multipart upload + 3-retry-from-zero policy is functionally adequate for the v1 operator workflow. The googleapis SDK upload path is well-tested and stable. Resumable session refactor (raw HTTP, drop SDK) is mechanical and can be revisited in v2 if real-world fail rates warrant it."
    accepted_by: "operator (golazo v1 milestone close)"
    accepted_at: "2026-05-14T00:00:00Z"
gaps:
  - truth: "Mid-upload drops resume via the YouTube resumable upload protocol (SC #4 / PUB-05)"
    status: override_accepted
    resolution: "Accepted as override. See overrides block above. Multipart upload with 3-retry-from-zero is functionally adequate for v1 (episodes ~50-200 MB, home/club network). Resumable session support deferred to v2 if real-world fail rates warrant it."
---

# Phase 3: Publish Pipeline — Verification Report

**Phase Goal:** Operator can run `golazo auth <kid>` once per channel and then `golazo publish <folder>` to upload `episode.mp4` as unlisted to the correct YouTube channel, with idempotent re-runs.
**Verified:** 2026-05-14T15:15:00Z
**Status:** gaps_found — 1 gap blocking full SC compliance
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP.md Success Criteria)

| #  | Truth                                                                                          | Status    | Evidence                                                                                                                    |
|----|-----------------------------------------------------------------------------------------------|-----------|-----------------------------------------------------------------------------------------------------------------------------|
| 1  | `golazo auth <kid>` performs OAuth, writes refreshable token; publish runs refresh silently; refresh failure prompts rerun auth | VERIFIED  | `src/publish/oauth.ts`: runAuth → exchangeCode → saveToken (0o600). loadToken registers 'tokens' listener for auto-refresh; refresh failure throws OAuthError with "run 'golazo auth <kid>'" remediation. CLI handler wired in `src/cli/commands/auth.ts`. 4 integration tests pass. |
| 2  | `golazo publish <folder>` uploads unlisted with thumbnail + templates; publish.json has videoId/watchUrl/uploadedAt/channelId/privacyStatus | VERIFIED  | `src/publish/uploader.ts` L65: `PRIVACY_STATUS = 'unlisted' as const`. `videos.insert` sends `privacyStatus: PRIVACY_STATUS`. `thumbnails.set` called after insert (test case 7). `publishRecordSchema` has all 5 fields. 15 nock-stubbed uploader tests pass. CLI integration test case 1 asserts publish.json written with correct videoId. |
| 3  | Opponent slugs render pretty: `city-sc` → `City SC`, `united` → `United`, `ac-milan` → `AC Milan` | VERIFIED  | `src/render/opponentPretty.ts`: `ACRONYM_ALLOW_LIST = new Set(['sc', 'fc', 'ac'])`. Imported in `src/publish/templates.ts` L18. Title + description renderers call `prettyOpponent(v.game.opponent)`. PUB-03 algorithm confirmed correct. Template tests exercise slug transformations. |
| 4  | Transient 5xx/network retry 3x with 1s/4s/16s backoff; mid-upload drops RESUME via YouTube resumable protocol; quota 403 fails loudly; no publish.json on quota | FAILED    | Backoff [1000, 4000, 16000] ms VERIFIED (`retry.ts` L55). QuotaExceededError with "Rerun after" hint VERIFIED. publish.json NOT written on quota VERIFIED (runner.test.ts case 9, publish.integration.test.ts case 4). **BLOCKER: resumable upload NOT implemented.** SDK uses `uploadType=multipart` (test case 6 pins this). Network drop retries from byte 0, not last-acknowledged chunk. See gap detail below. |
| 5  | Re-running publish on a folder with publish.json videoId exits early without re-uploading; `--force` overrides | VERIFIED  | `src/publish/runner.ts` L156-164: existing.videoId && !force → return skipped. runner.test.ts cases 2 and 3. publish.integration.test.ts cases 2 (idempotency) and 3 (force). nock.pendingMocks() assertion confirms no HTTP call on skip path. |

**Score: 4/5 truths verified**

---

### Gap Detail: SC #4 — Resumable Upload Protocol (BLOCKER)

**ROADMAP SC #4 states:** "mid-upload drops resume via the YouTube resumable upload protocol"

**PUB-05 states:** "large uploads use the YouTube resumable upload protocol so a mid-upload network drop resumes from the last chunk"

**What is implemented:** `publishWithRetry` wraps `uploadEpisode` with up to 3 retries. On a network drop (ECONNRESET/ETIMEDOUT etc.), `classifyError` classifies the error as `retriable`, sleeps the backoff delay, then calls `uploadEpisode(args)` again. This re-calls `createReadStream(episodePath)` from byte 0 and issues a brand-new multipart POST. The previous partial upload is abandoned.

**Why this is NOT "resumable":** YouTube's resumable upload protocol (https://developers.google.com/youtube/v3/guides/using_requests#resumable) requires:
1. An initiation POST to `/upload/youtube/v3/videos?uploadType=resumable` that returns a session URI in the `Location` header
2. On interruption, a status request to get the last acknowledged byte offset
3. A resume PUT with `Content-Range: bytes <offset>-<end>/<total>` to the session URI

None of these three steps exist anywhere in the Phase 3 codebase. The deviation is documented and self-acknowledged in `03-03-SUMMARY.md` under "CRITICAL DEVIATION: Upload Protocol" with the note that "network drop → retry (but NOT resumable-resume — that's a future enhancement)".

**Phase 4 scope check:** Phase 4 (Convenience & QA Polish) covers CLI-02, QA-01, QA-02, QA-03 — no resumable upload work is planned.

**Operator impact:** For typical golazo episode files (~100 MB, per SUMMARY estimate), a mid-upload network drop results in the full upload restarting from the beginning on the next retry rather than from the last-acknowledged chunk. All three retries exhaust independently. This means a flaky connection could fail to publish even though 90% of the data was already transferred.

---

### Required Artifacts

| Artifact                             | Expected                                  | Status   | Details                                                       |
|--------------------------------------|-------------------------------------------|----------|---------------------------------------------------------------|
| `src/publish/oauth.ts`               | OAuth2 helpers + runAuth                  | VERIFIED | createOAuth2Client, buildAuthUrl, exchangeCode, saveToken, loadToken, runAuth all implemented. YOUTUBE_UPLOAD_SCOPE, OOB redirect. |
| `src/publish/errors.ts`              | OAuthError, TemplateError, UploadError, QuotaExceededError, PublishError | VERIFIED | 5 error classes confirmed. errors.test.ts has 20 cases.      |
| `src/publish/templates.ts`           | Title + description renderers             | VERIFIED | renderTitle, renderDescription, renderTemplates. Imports prettyOpponent from render/opponentPretty.ts. |
| `src/publish/uploader.ts`            | uploadEpisode + PRIVACY_STATUS            | VERIFIED | PRIVACY_STATUS = 'unlisted' as const (L65). No bare 'unlisted' assignments. No bare 'public'. thumbnails.set wired after videos.insert. |
| `src/publish/retry.ts`               | classifyError + withRetry + publishWithRetry | VERIFIED | DEFAULT_RETRY_DELAYS_MS = [1000, 4000, 16000]. Network codes ECONNRESET/ETIMEDOUT/ENOTFOUND/EAI_AGAIN/EPIPE classified retriable. Two quota error shapes checked. |
| `src/publish/publishRecord.ts`       | publishRecordSchema + read/write          | VERIFIED | z.literal('unlisted') at L74. `_privacyStatusBinding = 'unlisted' satisfies typeof PRIVACY_STATUS` at L92. writePublishRecord validates before write. |
| `src/publish/runner.ts`              | runPublish orchestrator (11-step)         | VERIFIED | All 11 steps present. publish.json written ONLY at step 10 (after publishWithRetry resolves). PRIVACY_STATUS imported as grep gate. |
| `src/cli/commands/auth.ts`           | Real auth handler (stub removed)          | VERIFIED | registerAuthCommand calls runAuth. No "not yet implemented" text. |
| `src/cli/commands/publish.ts`        | Real publish handler (stub removed)       | VERIFIED | registerPublishCommand calls runPublish. Frozen output strings for Phase 4. No "not yet implemented" text. |
| `src/publish/index.ts`               | Complete barrel export                    | VERIFIED | All 03-01..03-05 surfaces exported. runPublish, runAuth, publishWithRetry, PRIVACY_STATUS, publishRecordSchema all present. |

---

### Key Link Verification

| From                         | To                               | Via                                              | Status   | Details                                                        |
|------------------------------|----------------------------------|--------------------------------------------------|----------|----------------------------------------------------------------|
| `runner.ts`                  | `uploader.ts/PRIVACY_STATUS`     | `import { PRIVACY_STATUS } from './uploader.js'` | WIRED    | Line 43 in runner.ts. `void PRIVACY_STATUS` at L191 as grep gate. |
| `publishRecord.ts`           | `uploader.ts/PRIVACY_STATUS`     | `'unlisted' satisfies typeof PRIVACY_STATUS`     | WIRED    | L32 import, L92 satisfies expression. tsc --noEmit exit 0 confirms compile-time bridge active. |
| `runner.ts`                  | `retry.ts/publishWithRetry`      | Direct call at L185                              | WIRED    | `const record = await publishWithRetry(args, opts.retryOpts)` |
| `runner.ts`                  | `publishRecord.ts/writePublishRecord` | Called at step 10 (L192), after publishWithRetry | WIRED    | PUB-06 contract enforced: only reached on success.            |
| `cli/commands/publish.ts`    | `publish/index.ts/runPublish`    | `import { runPublish } from '../../publish/index.js'` | WIRED    | L3 import, called in action handler.                          |
| `cli/commands/auth.ts`       | `publish/index.ts/runAuth`       | `import { runAuth } from '../../publish/index.js'`    | WIRED    | L3 import, called in action handler.                          |
| `templates.ts`               | `render/opponentPretty.ts`       | `import { prettyOpponent }`                      | WIRED    | L18. Used in renderTitle L147 and renderDescription L160. PUB-03 reuse confirmed. |
| `uploader.ts`                | `templates.ts/renderTemplates`   | Called at step 2 of uploadEpisode (L159)         | WIRED    | title + description destructured and passed to videos.insert snippet. |

---

### Data-Flow Trace (Level 4)

Not applicable — publish pipeline produces a side-effect (YouTube upload) and writes a file, not a rendered UI component. Data flow is verified through the wiring checks above and test assertions.

---

### Behavioral Spot-Checks

| Behavior                                    | Command                                                                                  | Result                    | Status |
|---------------------------------------------|------------------------------------------------------------------------------------------|---------------------------|--------|
| 367 tests pass                              | `npm test`                                                                               | 28 files, 367 tests passed, 36.92s | PASS |
| TypeScript compiles clean                   | `npx tsc --noEmit -p tsconfig.check.json`                                                | Exit 0                    | PASS |
| `_privacyStatusBinding satisfies` in source | `grep "satisfies typeof PRIVACY_STATUS" src/publish/publishRecord.ts`                    | L92 match                 | PASS |
| No bare 'unlisted' in uploader.ts           | `grep "'unlisted'" src/publish/uploader.ts \| grep -v "^export const PRIVACY_STATUS"`   | No output                 | PASS |
| No 'public' in uploader or publishRecord    | `grep "privacyStatus: 'public'" src/publish/uploader.ts src/publish/publishRecord.ts`   | No output                 | PASS |
| Stub removed from publish.ts                | `grep "not yet implemented" src/cli/commands/publish.ts`                                 | No output                 | PASS |
| Stub removed from auth.ts                   | `grep "not yet implemented" src/cli/commands/auth.ts`                                    | No output                 | PASS |
| Backoff contract [1000,4000,16000]          | `grep "1000, 4000, 16000" src/publish/retry.ts`                                          | L55 match                 | PASS |
| quota test: publish.json NOT written        | publish.integration.test.ts case 4: `existsSync(join(folder, '.golazo/publish.json'))` === false after 403 quota | Runner test case 9 + integration case 4 both assert false | PASS |
| uploadType=multipart (NOT resumable)        | uploader.test.ts case 6: `capturedInsertQuery.uploadType === 'multipart'`               | Confirmed by code + passing test | FAIL (SC gap) |

---

### Probe Execution

No probes declared in plans or SUMMARY files. No `scripts/*/tests/probe-*.sh` files found.

**Step 7c: SKIPPED** — no probes present.

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                  | Status    | Evidence                                                    |
|-------------|-------------|--------------------------------------------------------------|-----------|-------------------------------------------------------------|
| CLI-03      | 03-01, 03-05 | `golazo auth <kid>` OAuth persist + `golazo publish` handler | SATISFIED | Both CLI commands fully implemented, stubs replaced.        |
| PUB-01      | 03-03, 03-05 | `videos.insert` with unlisted + thumbnail + templates        | SATISFIED | uploadEpisode + thumbnails.set + renderTemplates all wired. |
| PUB-02      | 03-02       | 9-placeholder title + description templates                  | SATISFIED | All 9 substitutions confirmed in renderTemplates.           |
| PUB-03      | 03-02       | prettyOpponent acronym allow-list (`sc`, `fc`, `ac`)         | SATISFIED | ACRONYM_ALLOW_LIST in opponentPretty.ts, imported by templates.ts. |
| PUB-04      | 03-01       | OAuth token stored per-kid; silent refresh; failure prompt   | SATISFIED | loadToken 'tokens' listener + eager refresh + OAuthError remediation. |
| PUB-05      | 03-03, 03-04 | 3x retry 1s/4s/16s; RESUMABLE upload for network drops       | PARTIAL   | Retry backoff SATISFIED. **Resumable upload NOT SATISFIED** — multipart used, no session URI, no chunk-position resume. |
| PUB-06      | 03-04, 03-05 | quotaExceeded 403 fails loudly, no publish.json written      | SATISFIED | QuotaExceededError + "Rerun after" hint + publish.json not written on quota path. |
| PUB-07      | 03-05       | publish.json schema + idempotency; `--force` override        | SATISFIED | publishRecordSchema (5 fields), readPublishRecord/writePublishRecord, force flag. |

---

### Anti-Patterns Found

| File                          | Line | Pattern                          | Severity | Impact                                                             |
|-------------------------------|------|----------------------------------|----------|--------------------------------------------------------------------|
| `src/publish/oauth.ts`        | 111  | `GOLAZO_OAUTH_MOCK` env-var shim in production path | INFO | Documented carry-forward for Phase 4 removal. Self-described as "TEST-ONLY". No functional impact on production use (env var not set in production). Tracked in 03-01-SUMMARY.md. |

No `TBD`, `FIXME`, or `XXX` markers found in any Phase 3 source files.

---

### Human Verification Required

#### 1. Real OAuth Flow End-to-End

**Test:** On a machine with GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET configured, run `golazo auth leo` against a real channels.yaml. Confirm browser opens to Google consent URL, code exchange succeeds, token file written with `0o600` permissions, subsequent `golazo publish` run refreshes silently.
**Expected:** Token written, publish runs without re-prompting auth unless token expires.
**Why human:** Requires real Google OAuth credentials and a YouTube channel; cannot be tested with nock.

#### 2. Real Upload Smoke Test (Unlisted)

**Test:** Run `golazo publish <fixture-folder>` against a real YouTube channel (Leo or Mateo). Confirm video appears as **unlisted** in YouTube Studio, thumbnail is attached, title/description match template expectations.
**Expected:** Video uploaded as unlisted. No public-mode video created.
**Why human:** Requires real API call against live YouTube Data API v3; quota consumption makes this non-automatable in CI.

#### 3. Mid-Upload Network Drop Behavior (Post-Gap-Resolution)

**Test:** Once the resumable upload gap is resolved: simulate a mid-upload network drop (e.g., `tc qdisc` or proxy drop after 50% upload). Confirm the next retry issues a `Range: bytes=<offset>-` PUT to the session URI rather than a full re-upload.
**Expected:** Upload resumes from last-acknowledged byte, not from byte 0.
**Why human:** Requires network-simulation tooling; cannot verify with nock HTTP stubs.

---

## Gaps Summary

**1 gap blocking full Phase 3 compliance.**

**Root cause:** The googleapis Node.js SDK (`googleapis-common`) does not use the resumable upload protocol when both `requestBody` and `media.body` are provided — it routes to `uploadType=multipart` in `apirequest.js`. The plan documented resumable behavior but the SDK's actual code path differs. The executor correctly identified and documented this deviation in 03-03-SUMMARY.md as a "CRITICAL DEVIATION" but classified it as "functionally equivalent" rather than as a spec gap requiring resolution.

**What "functionally equivalent" means in practice:**
- For a 50 MB episode file on a stable home network: identical behavior
- For a 100–200 MB episode file on a flaky network (common for mobile hotspot in a sports environment): a mid-upload drop at the 90% mark restarts the full upload, potentially exhausting all 3 retries before completing

**Phase 4 scope:** Phase 4 does NOT include resumable upload work. There is no later-phase carry-forward to defer this to.

**Resolution options for the operator:**
1. **Override (accept the deviation):** If the operator's network is reliable enough that the fresh-restart retry policy is acceptable for their typical file sizes, add an override to this VERIFICATION.md with `accepted_by` + `accepted_at` and a reason documenting the acceptance criteria. This is the minimal path to `status: passed`.
2. **Phase 3 retro fix:** Implement YouTube resumable upload in `src/publish/uploader.ts` — initiation POST → session URI → stream PUT with `X-Upload-Content-Type` and `Range` resume logic. Requires replacing the `youtube.videos.insert` SDK call with raw HTTP against `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable`.
3. **Track as Phase 4 carry-forward:** Update ROADMAP.md Phase 4 requirements to include a `PUB-05-resumable` requirement, then this gap becomes a `deferred` item.

**To accept as an override (option 1):**

```yaml
overrides:
  - must_have: "mid-upload drops resume via the YouTube resumable upload protocol"
    reason: "googleapis SDK uses multipart POST; network-drop retry restarts from byte 0. Acceptable because golazo episodes are ~50–200 MB on a home/club network where mid-upload drops are rare; retry policy handles transient failures. True resumable is a future enhancement."
    accepted_by: "{your name}"
    accepted_at: "2026-05-14T00:00:00Z"
```

All other 4 success criteria are fully verified against the codebase. The privacy constraint chain (`PRIVACY_STATUS → z.literal('unlisted') → satisfies typeof PRIVACY_STATUS → tsc compile gate`), retry policy, quota handling, idempotency, and OAuth flow are substantive, wired, and tested.

---

_Verified: 2026-05-14T15:15:00Z_
_Verifier: Claude (gsd-verifier)_
