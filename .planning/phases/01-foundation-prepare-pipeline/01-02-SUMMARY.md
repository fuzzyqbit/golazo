---
phase: 01-foundation-prepare-pipeline
plan: 02
subsystem: config
tags: [zod, yaml, vitest, tdd, typescript, esm]

# Dependency graph
requires:
  - 01-01 (CLI scaffold provides src/config/ skeleton, package deps, vitest, tsconfig)
provides:
  - "src/config/channels.ts — loadChannel(kidKey) + loadChannelsFile() + CHANNELS_FILE_DEFAULT"
  - "src/config/types.ts — ChannelConfig, ChannelsFile, KidKey (camelCased on the parsed shape)"
  - "src/config/errors.ts — ChannelsConfigError (field+reason+remediation), UnknownKidError (lists valid keys)"
  - "src/config/channels.test-cases.ts — CHANNELS_TEST_CASES named-const table + buildYaml helper (re-usable for any future tooling)"
  - "channels.yaml.example — operator-copy template with leo + mateo, all 7 leaves each"
affects:
  - 01-03 (filename + kid resolver may import KidKey type, but otherwise independent)
  - 01-05 (manifest builder + runPrepare orchestrator will call loadChannel(kidKey))
  - Phase 2 render driver (will read accent/jersey/club from ChannelConfig)
  - Phase 3 publish (will read youtube.channelId + youtube.oauthTokenPath from ChannelConfig)

# Tech tracking
tech-stack:
  added:
    - "zod@4.4.3 — already installed by Plan 01-01; used for the channels schema (z.object + z.record + z.string().regex + z.number().int().min(1).max(99))"
    - "yaml@2.9.0 — already installed by Plan 01-01; eemeli/yaml parse() throws on syntax error"
  patterns:
    - "Loader synchronously throws a single ChannelsConfigError class for every failure mode (file missing, yaml syntax, zod issue, missing oauth token), so callers branch on one constructor for any config-load failure"
    - "Test fixtures live in a *.test-cases.ts sibling (excluded from build via tsconfig) so non-vitest tooling can import the named-const table without dragging the vitest runner into scope"
    - "Yaml-side snake_case (channel_id, oauth_token) is camelCased only at the loader boundary; the rest of the codebase sees ChannelConfig with channelId / oauthTokenPath"

key-files:
  created:
    - src/config/types.ts
    - src/config/errors.ts
    - src/config/errors.test.ts
    - src/config/channels.ts
    - src/config/channels.test.ts
    - src/config/channels.test-cases.ts
    - channels.yaml.example
  modified:
    - .gitignore (added literal `channels.yaml` so real config never gets committed)
    - tsconfig.json (excluded **/*.test-cases.ts from build outputs)
  deleted:
    - src/config/.gitkeep (placeholder superseded by real files in this plan)

key-decisions:
  - "Use single-line message format `channels.yaml: <field>: <reason>. <remediation>` for ChannelsConfigError — every other CLI module will display this verbatim, so the format is now a stable contract"
  - "ChannelsConfigError carries (field, reason, remediation, source?) on the instance + toJSON() for structured logs — programmatic branching does not need to regex-parse the message"
  - "Extract CHANNELS_TEST_CASES + buildYaml to channels.test-cases.ts (not test.ts) so non-vitest importers (tsx -e, future codegen, future verifier) can read the table without the runner context"
  - "Tilde expansion (~ / ~/) is the only path transformation; bare relative paths are resolved against the parent dir of channels.yaml so tests with `./leo.token.json` work without env tricks"
  - "Treat zod 4 invalid_type on .jersey as 'must be an integer between 1 and 99' to keep the operator-facing message stable across zod's slightly different code shapes for number vs string vs out-of-range"

requirements-completed:
  - CFG-01
  - CFG-02

# Metrics
duration: 8min 27s
completed: 2026-05-14
started: 2026-05-14T01:14:00Z
---

# Phase 01 Plan 02: channels.yaml zod schema + loader Summary

**channels.yaml is now a fully-validated, typed contract: `loadChannel(kidKey)` returns a camelCased `ChannelConfig` with the OAuth token path tilde-expanded and verified on disk; every failure mode (invalid hex, jersey out of range, missing file, missing token, unknown kid) throws a class-tagged error whose single-line message names the field, reason, and remediation.**

## Performance

- **Duration:** 8 min 27 s
- **Started:** 2026-05-14T01:14:00Z
- **Completed:** 2026-05-14T01:22:27Z
- **Tasks:** 2 (both TDD: RED → GREEN gates committed atomically as a single feat per task)
- **Files created:** 7
- **Files modified:** 2 (`.gitignore`, `tsconfig.json`)
- **Files deleted:** 1 (`src/config/.gitkeep` — superseded)

## Accomplishments

- **Zod schema** validates every field on every kid:
  - `name`, `club`, `source`: `z.string().min(1)`
  - `jersey`: `z.number().int().min(1).max(99)` — rejects 0, 100, -1, and any non-number
  - `accent`: `z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must match #RRGGBB hex')` — rejects `#zzz`, `ffce5a`, `#ff00`
  - `youtube.channel_id`, `youtube.oauth_token`: `z.string().min(1)`
- **File-level schema** is `z.record(z.string().min(1), channelEntrySchema)` — any kid key is structurally valid; the unknown-kid check fires at `loadChannel(kidKey)` lookup time, not parse time, so adding a third kid is just yaml editing
- **Tilde expansion** handled in a small `expandTilde()` helper: `~` → `os.homedir()`; `~/foo` → `resolve(os.homedir(), 'foo')`; anything else passes through (relative paths resolve against the channels.yaml parent dir)
- **OAuth token existence** verified with `existsSync` after expansion; missing tokens throw `ChannelsConfigError` with field `<kid>.youtube.oauth_token`, the resolved absolute path, and the remediation `run 'golazo auth <kid>' to create it`
- **Error vocabulary** is `ChannelsConfigError` (every config-load failure) + `UnknownKidError` (lookup miss). Both carry constructor args on the instance + `toJSON()` for structured logging
- **`CHANNELS_TEST_CASES`** is a 14-row named const that the test suite iterates via `it.each(...)` AND a meta-test asserts `>= 14` programmatically; a separate non-test fixtures file makes the named const importable from non-vitest tooling (the `tsx -e` verify command in the plan)
- **End-to-end smoke** confirmed: copying `channels.yaml.example` to a tmp dir, overriding `HOME`, touching the two `.golazo/*.token.json` files, then calling `loadChannel('leo')` returns a fully-populated `ChannelConfig` with `kid: 'leo'`, `jersey: 10`, `accent: '#ffce5a'`, and `youtube.oauthTokenPath: <tmpDir>/.golazo/leo.token.json` (camelCased + absolute)

## Task Commits

Each task was a single TDD feat commit (RED tests + GREEN implementation in one atomic unit per the project's git-workflow rule — `<type>: <description>`):

1. **Task 1: ChannelConfig types, error classes, channels.yaml.example** — `6e6c000` (feat)
2. **Task 2: zod loader + 14-row table-driven tests + test-cases fixtures extraction** — `3f7696c` (feat)

**Plan metadata commit:** (this commit) — `docs(01-02): complete channels.yaml loader plan`

## Zod Schema (field-by-field)

```ts
const channelEntrySchema = z.object({
  name:    z.string().min(1),
  club:    z.string().min(1),
  jersey:  z.number().int().min(1).max(99),
  accent:  z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must match #RRGGBB hex'),
  source:  z.string().min(1),
  youtube: z.object({
    channel_id:  z.string().min(1),
    oauth_token: z.string().min(1),
  }),
});

const channelsFileSchema = z.record(z.string().min(1), channelEntrySchema);
```

## Error Message Templates (stable contract for downstream plans)

| Failure mode                | Field example                  | Message format                                                                                                                                                                |
|-----------------------------|--------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| invalid accent hex          | `leo.accent`                   | `channels.yaml: leo.accent: must match #RRGGBB hex. edit channels.yaml and set leo.accent to a hex like #ffce5a`                                                              |
| jersey out of range or type | `mateo.jersey`                 | `channels.yaml: mateo.jersey: must be an integer between 1 and 99. edit channels.yaml and set mateo.jersey to an integer between 1 and 99`                                    |
| missing required leaf       | `leo.club`                     | `channels.yaml: leo.club: is required. add leo.club to channels.yaml`                                                                                                         |
| missing channels.yaml file  | `(file)`                       | `channels.yaml: (file): channels.yaml not found at <abs-path>. copy channels.yaml.example to channels.yaml and edit per-kid values`                                          |
| missing oauth token         | `<kid>.youtube.oauth_token`    | `channels.yaml: <kid>.youtube.oauth_token: oauth token file does not exist at <abs-path>. run 'golazo auth <kid>' to create it`                                              |
| yaml syntax error           | `(yaml)`                       | `channels.yaml: (yaml): <yaml parse message>. fix yaml syntax in channels.yaml`                                                                                              |
| unknown kid lookup          | (UnknownKidError, not Channels.Config) | `unknown kid '<kidKey>'. Valid keys: <a>, <b>. Edit channels.yaml to add '<kidKey>'.`                                                                                  |

Every message is single-line; tests assert this with `expect(err.message.split('\n')).toHaveLength(1)`.

## Node Builtins Used

- `node:fs` — `existsSync`, `readFileSync` (synchronous because the file is tiny and loaded once per command)
- `node:os` — `homedir` (only consumer is `expandTilde`)
- `node:path` — `resolve` (for `channels.yaml` path, parent dir, token path)

`node:url` is NOT used here (was used in plan 01-01's CLI entry guard); a future plan that needs to feed `oauthTokenPath` to the `google-auth-library` may add `pathToFileURL` then.

## Edge Cases Discovered During TDD (Beyond the Original 14)

None of the 14 plan-spec'd cases required a redesign. Two **implementation refinements** emerged from running the suite:

1. **Zod 4 emits `invalid_format` (not `invalid_string`) for regex failures** — the v3-shaped guidance in the plan would have missed the accent error. `describeZodIssue` now falls back on `field.endsWith('.accent')` as a belt-and-braces match for any future zod code-shape changes.
2. **Empty `validKeys` in `UnknownKidError` produces a slightly awkward `Valid keys: .` segment** — kept verbatim because the dedicated test (`empty valid-keys list`) asserts it explicitly. The CLI will only hit this if channels.yaml is empty, which is itself a separate failure mode (zod requires at least one key… or actually does it? `z.record({}, ...)` accepts an empty object). Logged here so a future plan can decide whether to require ≥ 1 kid at schema time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan-spec verify command references `pnpm`, repo uses `npm`**
- **Found during:** Task 1 (running plan's `<verify>` block — `pnpm tsc --noEmit && pnpm vitest run …`)
- **Issue:** The plan was authored before plan 01-01 settled the npm vs pnpm decision (npm pinned in `packageManager`). `pnpm` is not installed on this Mac, so the literal verify command would fail.
- **Fix:** Substituted `npx tsc --noEmit` and `npx vitest run …` everywhere. No source change.
- **Verification:** All verify commands ran exit 0.

**2. [Rule 3 - Blocking] Plan-spec verify command imports `*.test.ts` outside vitest, which crashes when top-level `describe()` runs without the runner**
- **Found during:** Task 2 (running `npx tsx -e "import('./src/config/channels.test.ts').then(m => …)"`)
- **Issue:** vitest's `describe()` requires `getCurrentSuite()` context to be initialised by the runner. A bare `tsx -e` import evaluates the top-level `describe(...)` call and crashes with `Cannot read properties of undefined (reading 'config')` — meaning the plan's literal verify command for the named-const row-count gate cannot succeed.
- **Fix:** Extracted `CHANNELS_TEST_CASES`, `buildYaml`, and the `ChannelsTestCase` interface to a sibling non-test module `src/config/channels.test-cases.ts`. The test file re-exports the const for backward-compat with any future grep. The verify command then imports the fixtures module instead of the test file, which has no vitest runtime dependencies and works under bare `tsx -e`. The meta-test `it('table contains >= 14 cases', ...)` still runs inside vitest and asserts the same invariant from the runner side.
- **Files changed:** new `src/config/channels.test-cases.ts`; slimmed `src/config/channels.test.ts` to import + iterate the const; `tsconfig.json` excludes `**/*.test-cases.ts` from build output so dist/ stays clean.
- **Verification:** `npx tsx -e "import('./src/config/channels.test-cases.ts').then(m => console.log(m.CHANNELS_TEST_CASES.length))"` prints `14` exit 0. Vitest still passes 17/17.

**3. [Rule 1 - Design refinement] Table case 12 (tilde-expansion) cannot prove success without HOME override, so the table row asserts the throw-with-expanded-path and a separate describe-block asserts the success path**
- **Found during:** Task 2 GREEN run (case 12 failed because the table-runner does not override HOME, so the loader correctly threw "oauth token file does not exist at /Users/me/.golazo/leo.token.json").
- **Issue:** The plan asks case 12 to demonstrate tilde expansion via `loadChannel` returning the expanded path, but the shared `it.each` runner cannot set up `process.env.HOME = tmpDir` per row without conditionals that would pollute every other row.
- **Fix:** Split the assertion across two surfaces. The table row (#12) asserts that with no HOME override the loader throws a `ChannelsConfigError` whose message contains `homedir()` and the unique segment `.golazo-test-unique-XYZ123` — proving expansion ran before existsSync. A dedicated `describe('loadChannel: tilde expansion success path (HOME override)')` block sets up the HOME override, touches the token file at the expanded location, and asserts the returned `oauthTokenPath` is exactly the expanded absolute path.
- **Files changed:** `src/config/channels.test.ts` (added the HOME-override describe-block); `src/config/channels.test-cases.ts` (case 12 row updated to `shouldThrow: true` with explicit `messageContains`).
- **Verification:** Both assertions pass; row count stays at 14; the contract — "tilde expansion is observable from the running test suite" — is upheld stronger than the plan asked, since the success path now verifies the exact resolved path value, not just that it doesn't throw.

**4. [Rule 1 - Bug] `Object.entries(z.record-output)` lookup needs an `if (!entry) continue;` guard**
- **Found during:** Task 2 GREEN (tsc complained about possibly-undefined entry under `noUncheckedIndexedAccess: true` — strict mode flagged the iteration).
- **Issue:** With `noUncheckedIndexedAccess`, indexing into the parsed record returns `T | undefined` even after a successful `safeParse`. Iterating with `Object.entries(...)` produced typed `[string, ChannelEntry | undefined]` tuples.
- **Fix:** Added `if (!entry) continue;` inside the loop. Safe because zod has already guaranteed every value matches `channelEntrySchema`; the guard is purely there for strict-mode happiness.
- **Files changed:** `src/config/channels.ts` (one extra line in `loadChannelsFile`).
- **Verification:** `npx tsc --noEmit` clean.

---

**Total deviations:** 4 auto-fixed (2 blocking infra mismatches between plan text and repo state, 1 test-design refinement to honor the spirit of case 12, 1 strict-mode guard). No architectural decisions needed; no scope expansion beyond the plan's contract.

## Issues Encountered

- **Shell tool truncation on chained Bash commands:** Multiple chained `grep -q ... && echo ...` invocations occasionally produced no output even though each sub-command exited 0. Verified by re-running each command individually. No impact on commits — every verification was re-checked atomically.
- **Empty validKeys produces `Valid keys: .` in UnknownKidError message:** Tested + accepted as the intended behaviour (see edge cases above). If a future plan tightens the schema to require ≥ 1 kid, this message becomes unreachable.

## User Setup Required

None. This plan is local-only validation infrastructure. The operator does not need to create a real `channels.yaml` until they actually want to run `prepare` against a folder (Plan 01-05 wires the real loader call). The example file (`channels.yaml.example`) ships in the repo for them to copy.

## Next Phase Readiness

- **Plan 01-03 (filename parser + kid-from-path resolver):** Independent of this plan; may optionally import `KidKey` from `./types.js` for its public surface but does not need to call `loadChannel`.
- **Plan 01-04 (clip discovery + ffprobe + sha256 + manifest-hash):** No dependency on this plan.
- **Plan 01-05 (manifest builder + runPrepare orchestrator + CLI prepare handler swap):** Will import `loadChannel`, `ChannelsConfigError`, `UnknownKidError`, and the `ChannelConfig` type. The error-message contracts documented above are stable; the CLI handler should catch `ChannelsConfigError | UnknownKidError` and exit with code 2 (consistent with plan 01-01's unimplemented-stub convention).
- **Phase 2 render:** Will read `accent`, `jersey`, `name`, `club` for title cards + grade.
- **Phase 3 publish:** Will read `youtube.channelId` + `youtube.oauthTokenPath`.
- **No blockers / concerns carried forward.**

## Self-Check: PASSED

```
FOUND: src/config/types.ts
FOUND: src/config/errors.ts
FOUND: src/config/errors.test.ts
FOUND: src/config/channels.ts
FOUND: src/config/channels.test.ts
FOUND: src/config/channels.test-cases.ts
FOUND: channels.yaml.example
FOUND: .gitignore (contains channels.yaml)
FOUND: tsconfig.json (excludes **/*.test-cases.ts)
FOUND: commit 6e6c000 (Task 1)
FOUND: commit 3f7696c (Task 2)
VITEST: 21 passed / 21 (4 errors.test.ts + 17 channels.test.ts)
TSC:    exit 0
ESLINT: exit 0
TSX-E:  CHANNELS_TEST_CASES.length=14
SMOKE:  loadChannel('leo') against channels.yaml.example returned full ChannelConfig with expanded oauthTokenPath
```

---
*Phase: 01-foundation-prepare-pipeline*
*Completed: 2026-05-14*
