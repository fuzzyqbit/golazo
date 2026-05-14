---
phase: 01-foundation-prepare-pipeline
verified: 2026-05-14
status: PASS
score: 5/5 success criteria verified
re_verification: false
truths_summary:
  - "Criterion 1 manifest.json schema — VERIFIED (manifest written; matches kid/game/clips/duration/manifestHash schema; recomputed manifestHash independently)"
  - "Criterion 2 channels.yaml validation — VERIFIED (invalid hex / out-of-range jersey / missing token path all abort at load with field+reason+remediation single-line message)"
  - "Criterion 3 error abort paths — VERIFIED (FilenameError / KidPathError / ClipDiscoveryError / ProbeError all fire with single-line messages and exit code 1; no silent swallow)"
  - "Criterion 4 idempotency — VERIFIED (re-run on unchanged folder reports 'manifest up to date (hash matches)' and mtime unchanged; --force overrides; manifestHash formula verified by independent recomputation)"
  - "Criterion 5 commander subcommands — VERIFIED (5 subcommands registered; render/publish/auth/all return '<name>: not yet implemented' with exit code 2; --help lists all five)"
requirements_complete:
  - CLI-01
  - CFG-01
  - CFG-02
  - PREP-01
  - PREP-02
  - PREP-03
  - PREP-04
  - PREP-07
---

# Phase 1 Verification

**Phase:** 01 — Foundation & Prepare Pipeline
**Verified:** 2026-05-14
**Status:** PASS
**Verifier:** Claude (goal-backward verification)

## Phase Goal

> Operator can run `golazo prepare <folder>` against a clip folder and get a valid, idempotent `manifest.json` written into `.golazo/`.

Goal achieved — verified against a fresh `/tmp/golazo-verify-sandbox` clone of the committed fixture using the real `npx tsx src/cli/index.ts` entry point (not mocks).

## Success Criteria

### Criterion 1 — manifest.json from `prepare`

**Status:** PASS

**Evidence:**

Command:
```
HOME="$PWD" npx tsx src/cli/index.ts prepare \
  /tmp/golazo-verify-sandbox/golazo/leo/2026-05-13_vs_united_3-1 \
  --channels-config tests/fixtures/golazo/channels.yaml
```

stdout: `manifest written to /tmp/golazo-verify-sandbox/.../.golazo/manifest.json (3 clips, 6s total)` (exit 0).

Written manifest matches documented schema:
- `version: 1`
- `kid: "leo"`
- `game: { date: "2026-05-13", opponent: "united", scoreFor: 3, scoreAgainst: 1, result: "W" }`
- `clips: [3 entries, each with file, durationSec, sha256]`
- `totalDurationSec: 6`
- `manifestHash: "sha256:b488578a244b5fc45d8b61b8a1dd35953bb9b8f623af16869d70f6be2185fa8d"` (matches `/^sha256:[0-9a-f]{64}$/`)

Schema codified in zod at `src/prepare/manifest.ts:64-78` (`manifestSchema`). Validated on both write (`buildManifest` line 145) and read (`readManifest` line 203).

**Deviation from design spec (intentional, documented):**
- `manifestHash` lives at TOP LEVEL (not nested under `render` as design spec sketched). Rationale in `src/prepare/manifest.ts:12-22` JSDoc and `01-05-SUMMARY.md` "Architectural Note" section: hash MUST exist before any render runs.
- Per-clip `sha256` field is ADDITIVE over design spec's `{file, durationSec}` example. Required so manifestHash is reproducible from manifest contents alone. Documented in `01-04-SUMMARY.md` and `01-05-SUMMARY.md`.

### Criterion 2 — channels.yaml validation

**Status:** PASS

**Evidence:** Each failure mode produces the documented single-line message and exit code 1:

| Failure mode | Command | stderr output |
|---|---|---|
| Invalid hex `#zzz` | `--channels-config /tmp/bad-channels.yaml` | `channels.yaml: leo.accent: must match #RRGGBB hex. edit channels.yaml and set leo.accent to a hex like #ffce5a` |
| Jersey 100 (out of range 1..99) | `--channels-config /tmp/bad-channels-jersey.yaml` | `channels.yaml: leo.jersey: must be an integer between 1 and 99. edit channels.yaml and set leo.jersey to an integer between 1 and 99` |
| Missing token path on disk | `--channels-config /tmp/bad-channels-token.yaml` | `channels.yaml: leo.youtube.oauth_token: oauth token file does not exist at /tmp/does-not-exist-token.json. run 'golazo auth leo' to create it` |

Implementation: `src/config/channels.ts:25-35` (zod schema) + `src/config/channels.ts:212-219` (token existence check). Error class shape `channels.yaml: <field>: <reason>. <remediation>` codified in `src/config/errors.ts:44`. 14 test cases in `src/config/channels.test-cases.ts` exhaustively cover valid + invalid hex (`#zzz`, `ffce5a`, `#ff00`), jersey range (0, 100, -1, "10" as string), missing required fields, missing file, missing tokens, tilde expansion, unknown kid lookup. All pass.

`channels.yaml.example` exists in repo root with `leo` and `mateo` entries.

### Criterion 3 — error abort paths

**Status:** PASS

**Evidence:** Four error classes from `src/prepare/errors.ts` (`FilenameError`, `KidPathError`, `ClipDiscoveryError`, `ProbeError`) each fire with a path + reason + remediation single-line message at exit code 1, no silent swallows:

| Failure | stderr |
|---|---|
| Malformed folder name `badname` | `folder name 'badname' is invalid: does not match required pattern. Expected format: YYYY-MM-DD_vs_<slug>_<for>-<against> (e.g. 2026-05-13_vs_united_3-1)` |
| Missing parent kid directory (no `golazo` segment) | `cannot resolve kid from path '...': no 'golazo' directory followed by a kid segment found in path. Expected layout: ~/golazo/<kid>/<game-folder>/` |
| Zero matching clips (empty folder) | `clip discovery failed in '...': no files match NN-*.mp4. Skipped non-matching files: (none). Expected files matching ^NN-<name>.mp4 (e.g. 01-clip.mp4).` |
| ffprobe failure (corrupt mp4 — "not an mp4" bytes) | `ffprobe failed on '...' (exit code 1): [mov,mp4,m4a,3gp,3g2,mj2 @ ...] moov atom not found ... Invalid data found when processing input. Fix or remove the corrupt clip and rerun 'golazo prepare'.` |

CLI handler `src/cli/commands/prepare.ts:67-77` catches every prepare-pipeline error, writes the message verbatim to stderr, throws `CommanderError(1, ...)`.

Orchestrator step order in `src/prepare/index.ts:75-149` ensures `ProbeError` fires BEFORE the hash compare so corrupt clips short-circuit cleanly — documented and pinned by integration case 6.

### Criterion 4 — idempotency / manifestHash

**Status:** PASS

**Evidence:**

Sequential commands against the same sandbox folder:

```
$ stat -f "%m" .../manifest.json
1778724737
$ HOME="$PWD" npx tsx src/cli/index.ts prepare ... 
manifest up to date (hash matches)
EXIT: 0
$ stat -f "%m" .../manifest.json
1778724737    # unchanged — no rewrite
$ HOME="$PWD" npx tsx src/cli/index.ts prepare ... --force
manifest rewritten (force) -> .../.golazo/manifest.json
EXIT: 0
$ stat -f "%m" .../manifest.json
1778724752    # mtime advanced — --force triggered rewrite
```

manifestHash formula verified by independent reimplementation:

```
canonical = folderName + "\n" + sorted(file:sha256 pairs joined by "\n")
hash = "sha256:" + sha256(canonical)
```

Recomputed: `sha256:b488578a244b5fc45d8b61b8a1dd35953bb9b8f623af16869d70f6be2185fa8d` — byte-identical to the manifest's recorded `manifestHash`. Implementation at `src/prepare/hash.ts:75-83`.

Idempotency decision logic at `src/prepare/index.ts:118-141`:
- `existing && existing.manifestHash === candidate.manifestHash && !force` → return `{skipped:true, reason:'hash-match'}` without writing
- `force` → write, reason `force`
- existing hash differs → write, reason `hash-changed`
- no existing manifest → write, reason `first-run`

Music and render metadata are EXCLUDED from the hash (`src/prepare/hash.ts:12-23` JSDoc + `01-05-SUMMARY.md` "Idempotency Invariants" section). This is a load-bearing contract for Phase 2/3.

### Criterion 5 — commander.js 5-subcommand registration

**Status:** PASS

**Evidence:**

`npx tsx src/cli/index.ts --help`:
```
Commands:
  prepare [options] <folder>  Parse metadata, scan clips, write manifest.json
  render <folder>             Render episode.mp4 + thumb.png via Remotion
  publish <folder>            Upload episode.mp4 to YouTube as unlisted
  auth <kid>                  One-time YouTube OAuth flow for a channel
  all <folder>                Convenience: prepare → render → publish
  help [command]              display help for command
```

All four stubs exercised:

| Subcommand | stdout/stderr | Exit code |
|---|---|---|
| `render /tmp/foo` | `render: not yet implemented` | 2 |
| `publish /tmp/foo` | `publish: not yet implemented` | 2 |
| `auth leo` | `auth: not yet implemented` | 2 |
| `all /tmp/foo` | `all: not yet implemented` | 2 |

Implementations at `src/cli/commands/{render,publish,auth,all}.ts` use `cmd.error('<name>: not yet implemented', { exitCode: 2, code: '<name>.unimplemented' })`. Unit test `src/cli/index.test.ts:48-64` asserts this pattern programmatically with vitest `it.each`.

`prepare` is registered with a real action handler that calls `runPrepare` (`src/cli/commands/prepare.ts:22-78`); Plan 01's registration-only smoke (line 38-46) still passes after Plan 05's stub-swap.

## Required Artifacts

| Artifact | Expected | Status | Notes |
|----------|----------|--------|-------|
| `src/cli/index.ts` | commander root, 5 subcommand registrations | VERIFIED | Direct-invocation guard + exitOverride pattern |
| `src/cli/commands/{prepare,render,publish,auth,all}.ts` | One file per subcommand | VERIFIED | All 5 present |
| `src/config/channels.ts` | loadChannelsFile + loadChannel + zod schema | VERIFIED | 92.3% statement coverage |
| `src/config/errors.ts` | ChannelsConfigError + UnknownKidError | VERIFIED | toJSON() included |
| `src/config/types.ts` | ChannelConfig + ChannelsFile + KidKey | VERIFIED | camelCased boundary |
| `src/prepare/filename.ts` | parseFilename → GameMeta | VERIFIED | 100% line coverage; date round-trip validity |
| `src/prepare/kid.ts` | resolveKidFromPath | VERIFIED | uses `lastIndexOf` for nested-golazo safety |
| `src/prepare/clips.ts` | discoverClips + CLIP_FILENAME_REGEX | VERIFIED | 100% line coverage |
| `src/prepare/probe.ts` | probeDuration (ffprobe wrapper) | VERIFIED | 92.3% statement coverage |
| `src/prepare/hash.ts` | computeClipSha256 + computeManifestHash | VERIFIED | Pure deterministic; tests pin canonical input |
| `src/prepare/manifest.ts` | manifestSchema + buildManifest + readManifest + writeManifest | VERIFIED | 88.09% statement coverage |
| `src/prepare/index.ts` | runPrepare orchestrator | VERIFIED | Step order documented; 100% kid.ts coverage via integration |
| `src/prepare/errors.ts` | 5 error classes | VERIFIED | All have field+reason+remediation pattern |
| `channels.yaml.example` | Operator template | VERIFIED | leo + mateo with all required fields |
| `tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/0[123]-clip.mp4` | 3 committed mp4 fixtures | VERIFIED | ~28KB each, all play through ffprobe |
| `tests/fixtures/golazo/channels.yaml` | Fixture config | VERIFIED | Tilde-pathed oauth_token entries |
| `tests/fixtures/golazo/{leo,mateo}.token.json` | Stub OAuth token files | VERIFIED | Both present |

## Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `cli/commands/prepare.ts` | `prepare/index.ts:runPrepare` | direct import + call (line 35-39) | WIRED |
| `prepare/index.ts:runPrepare` | `prepare/{filename,kid,clips,probe,hash,manifest}` | composed sequentially with parallel Promise.all on probe+hash | WIRED |
| `prepare/kid.ts` | `config/channels.ts:loadChannelsFile` | direct call line 88-90 with channelsPath forwarding | WIRED |
| `prepare/manifest.ts:buildManifest` | `prepare/hash.ts:computeManifestHash` | direct call line 121-124 | WIRED |
| `prepare/manifest.ts:writeManifest` | filesystem `.golazo/manifest.json` | `mkdirSync` + `writeFileSync` line 168-175 | WIRED |
| Manifest schema validation | runtime defense | `.parse` on write (line 145), `.safeParse` on read (line 203) | WIRED |
| CLI error handling | stderr + non-zero exit | catch → write message → throw `CommanderError(1, ...)` line 74-77 | WIRED |

No orphaned modules. Every leaf module is imported by the orchestrator; no dead code in `src/`.

## Requirements Coverage

| Req | Phase | Description | Status | Evidence |
|-----|-------|-------------|--------|----------|
| CLI-01 | 1 | `prepare`/`render`/`publish`/`auth`/`all` idempotent subcommands | SATISFIED | 5 commands registered (`src/cli/index.ts:27-31`); `prepare` calls real `runPrepare`; others return stub with exit code 2; `--help` lists all five |
| CFG-01 | 1 | Single `channels.yaml` with per-kid branding + YouTube binding | SATISFIED | `channels.yaml.example` + `src/config/channels.ts:25-35` zod schema; 14 table-driven cases pass |
| CFG-02 | 1 | channels.yaml validated at load: hex, jersey, token path | SATISFIED | 3 failure modes manually exercised; cases 2-4 (hex), 5-8 (jersey), 11 (token) in `channels.test-cases.ts` |
| PREP-01 | 1 | Folder-name parser `YYYY-MM-DD_vs_<slug>_<for>-<against>` | SATISFIED | `src/prepare/filename.ts` with 20 cases (7 valid + 13 malformed) in `filename.test-cases.ts`; 100% line coverage |
| PREP-02 | 1 | Kid identity from `~/golazo/<kid>/...` | SATISFIED | `src/prepare/kid.ts:resolveKidFromPath`; 11+ cases in `kid.test-cases.ts`; lastIndexOf semantic for nested-golazo |
| PREP-03 | 1 | Clip discovery by NN- prefix; reject zero matches | SATISFIED | `src/prepare/clips.ts:discoverClips` with `CLIP_FILENAME_REGEX = /^(\d+)-.+\.mp4$/`; 100% line coverage; ClipDiscoveryError lists skipped files |
| PREP-04 | 1 | ffprobe per-clip duration; corrupt clips fail by name | SATISFIED | `src/prepare/probe.ts:probeDuration`; manually verified ffprobe failure path with corrupt mp4 fixture; ProbeError carries filePath + exitCode + stderr |
| PREP-07 | 1 | Manifest at `<folder>/.golazo/manifest.json`; manifestHash = sha256 over sorted `(clipFile, clipSha256)` pairs + folder name | SATISFIED | `src/prepare/hash.ts:computeManifestHash` formula verified by independent recomputation; music and render metadata excluded |

**Phase 1 requirements complete:** 8/8 (matches REQUIREMENTS.md traceability table at lines 78-89).

## Anti-Patterns Scan

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| `src/cli/index.ts:78` | comment-only `// Commander's program.error...` | OK | Documentation comment, not a TODO/FIXME |
| `src/prepare/manifest.ts:114-119` | empty-clips throws ManifestError | OK | Intentional guard, NOT a stub — has zod validation pass after |
| `src/cli/commands/{render,publish,auth,all}.ts` | `cmd.error(... 'not yet implemented' ...)` | INFO | Documented Phase 1 stubs — expected by Criterion 5 |

No `TBD`, `FIXME`, `XXX`, `PLACEHOLDER`, or unreferenced TODO markers found in source files. The "not yet implemented" stubs are explicit Phase 1 contract per Criterion 5 and Plan 01 SUMMARY.

```bash
$ grep -rn -E "TBD|FIXME|XXX|HACK|PLACEHOLDER" src/ 2>/dev/null
# (no matches)
```

## Data-Flow Trace (Level 4)

`runPrepare` produces a manifest from real filesystem inputs (no hardcoded fallbacks):
- Clip list ← `discoverClips(absFolder)` reads `readdirSync(folderPath)` (`src/prepare/clips.ts:67`)
- Per-clip duration ← `probeDuration` shells out to ffprobe (`src/prepare/probe.ts:55-64`)
- Per-clip sha256 ← `computeClipSha256` streams `createReadStream` (`src/prepare/hash.ts:50-62`)
- manifestHash ← `computeManifestHash(folderName, sortedPairs)` (`src/prepare/hash.ts:75-83`)
- Game metadata ← `parseFilename(folderName)` regex + date validation (`src/prepare/filename.ts:64-117`)

Smoke test confirmed against a fresh clone of the committed fixture: 3 real mp4 clips with non-zero durations + valid sha256 digests → manifest with valid manifestHash that recomputes byte-for-byte. **FLOWING** at every level.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Type-check passes | `npx tsc --noEmit` | exit 0 | PASS |
| Test suite passes | `npm test` | `Test Files 9 passed (9); Tests 119 passed (119)` in 2.84s | PASS |
| Coverage on src/ | `npx vitest run --coverage` | Lines: 87.95% (314/357) | PASS (exceeds Phase 4's 80% target) |
| CLI first-run produces manifest | Real CLI against tmp clone | "manifest written to ... (3 clips, 6s total)" exit 0 | PASS |
| CLI re-run is no-op | Same CLI a second time | "manifest up to date (hash matches)"; mtime unchanged | PASS |
| `--force` rewrites | Same CLI with `--force` | "manifest rewritten (force) -> ..."; mtime advanced | PASS |
| Malformed folder name aborts | CLI on `badname/` | FilenameError stderr, exit 1 | PASS |
| Missing golazo segment aborts | CLI on `/tmp/no-golazo/...` | KidPathError stderr, exit 1 | PASS |
| Empty folder aborts | CLI on dir with no NN-*.mp4 | ClipDiscoveryError stderr, exit 1 | PASS |
| Corrupt mp4 aborts | CLI on text-bytes "mp4" | ProbeError with moov-atom message, exit 1 | PASS |
| Invalid hex in channels.yaml aborts | CLI with `--channels-config` pointing at bad-hex yaml | ChannelsConfigError, exit 1 | PASS |
| Jersey > 99 aborts | Same with jersey: 100 | ChannelsConfigError, exit 1 | PASS |
| Missing oauth_token path aborts | Same with non-existent token path | ChannelsConfigError remediating `run 'golazo auth leo'`, exit 1 | PASS |
| 5 subcommands registered in `--help` | `npx tsx src/cli/index.ts --help` | Lists prepare, render, publish, auth, all | PASS |
| render stub | `npx tsx ... render /tmp/foo` | "render: not yet implemented" exit 2 | PASS |
| publish stub | `npx tsx ... publish /tmp/foo` | "publish: not yet implemented" exit 2 | PASS |
| auth stub | `npx tsx ... auth leo` | "auth: not yet implemented" exit 2 | PASS |
| all stub | `npx tsx ... all /tmp/foo` | "all: not yet implemented" exit 2 | PASS |

**18/18 spot-checks PASS.**

## Test Suite

- **Total:** 119 tests across 9 test files, all passing
- **Duration:** 2.84s
- **Coverage on `src/`:** Lines 87.95%, Statements 88%, Functions 90.27%, Branches 65.86%
- **Test files:**
  - `src/cli/index.test.ts` — commander wiring (5-subcommand registration + 4 stub responses)
  - `src/config/channels.test.ts` — 14 table-driven channels.yaml loader cases + meta-tests
  - `src/config/errors.test.ts` — error class shape (toJSON, prototype, fields)
  - `src/prepare/filename.test.ts` — 20+ cases (7 valid + 13 malformed)
  - `src/prepare/kid.test.ts` — 11+ resolveKidFromPath cases (incl. nested golazo)
  - `src/prepare/clips.test.ts` — discoverClips (sorting, skipped files, empty)
  - `src/prepare/hash.test.ts` — computeClipSha256 + computeManifestHash (canonical input pinned)
  - `src/prepare/manifest.test.ts` — schema validation + buildManifest/readManifest/writeManifest
  - `src/prepare/index.test.ts` — 10 orchestrator integration cases + 3 CLI shell-out cases (npx tsx)

Notes on coverage gaps (informational, not gaps in Phase 1 contract):
- `src/cli/commands/prepare.ts` shows 5.55% line coverage in v8 report — handler is exercised via the `npx tsx` CLI shell-out cases 11-13, which v8 can't instrument because they spawn a fresh child process.
- `src/cli/index.ts` shows 55% coverage — bottom half (direct-invocation guard lines 60-83) only runs when the file is executed as the entry, not when imported by tests. Expected.

## Carry-Forward to Phase 2

These contracts are load-bearing for Phase 2. Phase 2 plans must read them BEFORE designing the render driver:

1. **`manifestHash` at TOP LEVEL of manifest, NOT inside `render`.** Documented in `src/prepare/manifest.ts:12-22` JSDoc and reaffirmed in `01-05-SUMMARY.md` "Architectural Note". Phase 2 may ADD a sibling `render: { episodePath, thumbnailPath, renderedAt }` block — must NOT relocate `manifestHash` into it.

2. **Per-clip `sha256` field is ADDITIVE over design spec.** Manifest clips entries are `{file, durationSec, sha256}`, not just `{file, durationSec}`. Required so manifestHash is reproducible from manifest contents alone. Phase 2 MUST preserve this field.

3. **`MANIFEST_FILE_NAME = '.golazo/manifest.json'`** is the load-bearing read path. `readManifest(folderPath)` returns the validated Manifest shape or null. Phase 2's render driver uses this to read back the hash for re-render skip logic.

4. **`computeManifestHash` canonical input is `folderName + '\n' + sorted_pairs.map(p => p.file + ':' + p.sha256).join('\n')`.** Music selection and render metadata are EXCLUDED from the hash. Phase 2 must NOT mutate this contract — re-rendering with the same prepared content must produce the same hash.

5. **CLI handler output strings are a contract.** Phase 2/3 should preserve these stdout lines verbatim (other tooling may grep them):
   - `manifest written to <path> (<N> clips, <sec>s total)` (first-run)
   - `manifest up to date (hash matches)` (no-op)
   - `manifest updated (content changed) -> <path> ...` (hash-changed)
   - `manifest rewritten (force) -> <path>` (--force)

6. **TSX shell-out test pattern** (no `pnpm build` dependency) is canonical. Documented in `01-05-SUMMARY.md` "TSX Execution Pattern for Tests". Phase 2/3/4 should reuse:
   ```ts
   await execFileAsync('npx', ['tsx', 'src/cli/index.ts', 'render', sandbox, ...],
     { env: { ...process.env, HOME: REPO_ROOT }, cwd: REPO_ROOT });
   ```

7. **Stub subcommand contract:** `render`, `publish`, `auth`, `all` currently raise `cmd.error('<name>: not yet implemented', { exitCode: 2, code: '<name>.unimplemented' })`. Phase 2 swaps the `render` body; the existing CLI smoke test (`src/cli/index.test.ts:48-64`) asserts the exit-2 contract for the OTHER three stubs and must continue to pass after the render swap.

8. **resolveKidFromPath uses `lastIndexOf('golazo')`**, not `indexOf`. Documented in `src/prepare/kid.ts:55-66`. Phase 2/3 code that imports kid.ts must NOT revert this.

## Gaps Found

None. All five success criteria pass with codebase evidence. All eight Phase 1 requirements complete. 119/119 tests pass. Coverage exceeds the 80% target.

---

## VERIFICATION PASSED

- **Blockers:** 0
- **Warnings:** 0
- **Info:** 4 (intentional Phase 1 stubs for render/publish/auth/all by design)
- **Tests:** 119/119 pass
- **Coverage:** 87.95% lines on `src/`

_Verified: 2026-05-14_
_Verifier: Claude (gsd-verifier, goal-backward)_
