---
phase: "03-publish-pipeline"
plan: "01"
subsystem: "publish/oauth + cli/auth"
tags: [oauth, youtube, googleapis, cli, auth]
dependency_graph:
  requires:
    - 01-02: ChannelConfig.youtube.oauthTokenPath + loadChannelsFile
    - 01-01: commander CLI scaffold + exitOverride pattern
    - 02-04: registerRenderCommand pattern for CLI handler shape
  provides:
    - src/publish/oauth.ts: OAuth2 helpers consumed by Plans 03-02..03-05
    - src/publish/index.ts: barrel re-export
    - src/publish/errors.ts: OAuthError
    - src/cli/commands/auth.ts: real golazo auth <kid> handler
  affects:
    - src/config/channels.ts: skipTokenCheck extension
    - package.json: googleapis + nock deps
tech_stack:
  added:
    - googleapis ^144.0.0 (YouTube Data API v3, OAuth2 client)
    - nock ^14.0.15 (devDependency, HTTP stubbing for Plans 03-03..03-05)
  patterns:
    - google.auth.OAuth2 constructor (OOB redirect URI for CLI flow)
    - access_type=offline + prompt=consent for refresh_token acquisition
    - 'tokens' event listener for auto-refresh credential persistence
    - 0o600 file mode on token JSON (personal credentials security)
key_files:
  created:
    - src/publish/errors.ts
    - src/publish/errors.test.ts
    - src/publish/oauth.ts
    - src/publish/oauth.test.ts
    - src/publish/index.ts
    - src/cli/auth.integration.test.ts
  modified:
    - package.json (googleapis + nock deps)
    - package-lock.json
    - src/config/channels.ts (skipTokenCheck option)
    - src/config/channels.test-cases.ts (cases 15+16)
    - src/config/channels.test.ts (>= 16 gate, skipTokenCheck forwarding)
    - src/cli/commands/auth.ts (stub replaced with real handler)
    - src/cli/index.test.ts (auth removed from stub table, registration test added)
decisions:
  - "GOLAZO_OAUTH_MOCK env-var shim in exchangeCode is the minimal seam for shell-out integration testing across execFile boundary; nock and vi.mock cannot intercept across spawned processes"
  - "OOB redirect URI (urn:ietf:wg:oauth:2.0:oob) chosen — no web server in single-operator CLI workflow"
  - "access_type=offline + prompt=consent both required: offline for refresh_token, consent to force Google to re-issue refresh_token on re-authorization"
  - "saveToken chmods 0o600 — personal credentials must never be world-readable"
  - "loadToken's 'tokens' listener merges new credentials with stored refresh_token because googleapis auto-refresh only emits the new access_token"
  - "skipTokenCheck added to loadChannelsFile/loadChannel so golazo auth can resolve token paths before tokens exist on disk"
metrics:
  duration: "7 min 48 s"
  completed: "2026-05-14"
  tasks_completed: 3
  files_changed: 13
  tests_added: 29
  total_tests: 244
---

# Phase 03 Plan 01: OAuth Foundation + golazo auth Command — Summary

**One-liner:** Full OAuth2 foundation with googleapis SDK, OAuthError class, skipTokenCheck loader extension, and real `golazo auth <kid>` CLI handler replacing the Plan 01-01 stub.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add googleapis + nock deps + OAuthError + skipTokenCheck loader | 82d767b | package.json, src/publish/errors.ts, src/config/channels.ts |
| 2 | OAuth helpers + barrel index + 19 unit tests | 7aabc9c | src/publish/oauth.ts, src/publish/index.ts, src/publish/oauth.test.ts |
| 3 | Replace auth stub with real CLI handler + integration tests | b54921f | src/cli/commands/auth.ts, src/cli/index.test.ts, src/cli/auth.integration.test.ts |

## What Was Built

### OAuthError (src/publish/errors.ts)

New error class following the existing single-line message convention `oauth: <field>: <reason>. <remediation>`. Mirrors ManifestError/RenderError. Four throw sites: missing token file, malformed token JSON, exchange failure, refresh failure.

### OAuth2 helpers (src/publish/oauth.ts)

- `createOAuth2Client` — reads clientId/clientSecret from opts then env; throws OAuthError on missing credentials
- `buildAuthUrl` — generates consent URL with `access_type=offline` + `prompt=consent` (both required for refresh_token)
- `exchangeCode` — exchanges auth code for tokens; validates refresh_token present; GOLAZO_OAUTH_MOCK shim for integration tests
- `saveToken` — atomic write with `chmodSync(0o600)` for credential security; never logs credentials
- `loadToken` — loads persisted token, registers 'tokens' listener for auto-refresh writes, eager-refreshes expired tokens
- `runAuth` — orchestrates the one-time authorization flow with injectable `readCode` for testing

### channels.ts extension

Added `skipTokenCheck?: boolean` to `loadChannelsFile` and `loadChannel` so `golazo auth` can resolve the intended token path before any token exists on disk. Default behavior (omitted or false) is unchanged — all 14 existing test cases still pass. Two new test cases (15, 16) cover the skipTokenCheck branch.

### golazo auth <kid> CLI (src/cli/commands/auth.ts)

Real handler replaces the Plan 01-01 stub entirely. Prints consent URL to stdout, reads authorization code from stdin, calls `runAuth`, prints `token written to <path> for channel <channelId>` on success. Error handling follows the render command pattern: writes err.message to stderr, throws `CommanderError(1, commander.authFailed, 'auth failed')`.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

## Deferred Items / Phase 4 Cleanup Carry-Forwards

- Remove `GOLAZO_OAUTH_MOCK` shim from `exchangeCode` after Phase 4 — replace with an injectable `exchangeCode` implementation pattern (dependency injection via a constructor or factory). Tracked as a Phase 4 cleanup carry-forward.

## Security Notes

- Token files written with mode `0o600` (owner read/write only) — personal Google credentials
- Neither `access_token` nor `refresh_token` bytes are logged at any point (asserted by test cases 17, 18 for runAuth; case 18 for exchangeCode; cases 1-2 in auth.integration.test.ts)
- `GOLAZO_OAUTH_MOCK` shim is test-only, documented with JSDoc, and has a tracked Phase 4 removal owner

## Known Stubs

None — all exported functions are fully implemented.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: env-var-test-seam | src/publish/oauth.ts | GOLAZO_OAUTH_MOCK env var branches production code for test isolation; tracked for Phase 4 removal |

## Self-Check: PASSED

Files verified to exist:
- /Users/me/Documents/code/golazo/src/publish/errors.ts — FOUND
- /Users/me/Documents/code/golazo/src/publish/oauth.ts — FOUND
- /Users/me/Documents/code/golazo/src/publish/index.ts — FOUND
- /Users/me/Documents/code/golazo/src/cli/commands/auth.ts — FOUND (stub replaced)
- /Users/me/Documents/code/golazo/src/cli/auth.integration.test.ts — FOUND

Commits verified:
- 82d767b: feat(03-01): add googleapis + nock deps + OAuthError + skipTokenCheck loader
- 7aabc9c: feat(03-01): implement OAuth2 helpers + barrel index + 19 unit tests
- b54921f: feat(03-01): replace auth stub with real CLI handler + integration tests

Test results: 244/244 passing (22 test files)
