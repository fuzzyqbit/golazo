---
phase: 01-foundation-prepare-pipeline
plan: 05
subsystem: prepare
tags: [manifest, idempotency, orchestrator, cli, tsx, integration, zod, tdd, typescript, esm]

# Dependency graph
requires:
  - 01-01 (CLI scaffold — prepare stub replaced; src/cli/index.test.ts unchanged)
  - 01-02 (loadChannelsFile — exercised transitively via resolveKidFromPath)
  - 01-03 (parseFilename + resolveKidFromPath — composed; resolveKidFromPath patched to use lastIndexOf for nested-golazo safety)
  - 01-04 (discoverClips + probeDuration + computeClipSha256 + computeManifestHash + committed fixture infrastructure)
provides:
  - "src/prepare/manifest.ts — Manifest zod schema + buildManifest + readManifest + writeManifest + MANIFEST_SCHEMA_VERSION + MANIFEST_FILE_NAME constants"
  - "src/prepare/index.ts — runPrepare orchestrator wiring all six prepare modules with hash-based idempotency"
  - "src/cli/commands/prepare.ts — real prepare CLI handler (replaces Plan 01 stub); --force + --channels-config options; documented stdout strings"
  - "src/prepare/errors.ts — extended with ManifestError alongside the prior 4 classes"
  - "src/prepare/index.test.ts — 13 integration cases (10 orchestrator + 3 CLI shell-out)"
affects:
  - Phase 2 render driver (manifest schema is now frozen; render driver reads it back via readManifest; will add a SIBLING `render: {episodePath, thumbnailPath, renderedAt}` block alongside manifestHash, NOT inside it)
  - Phase 2 render driver (idempotency cycle: render reads manifestHash, compares against recorded render manifest, decides whether to re-render)
  - Phase 3 publish client (reads game metadata from `m.game.*` for title/description templates)
  - Phase 4 QA suite (committed fixture + npx tsx shell-out pattern is now canonical for QA-02 integration tests)
  - REQUIREMENTS.md: CLI-01 and PREP-07 both flip from Pending to Complete; Phase 1 now has all 8 requirements Complete

# Tech tracking
tech-stack:
  added: []  # zod + commander were added in Plans 01-02; node:fs/path/util/child_process/crypto are stdlib
  patterns:
    - "Orchestrator composition: pure functions + leaf I/O wrappers composed under a single async entry point. Each step throws its own typed error so callers (the CLI handler) get single-line operator-facing messages without an interpreter layer"
    - "Per-clip Promise.all(probeDuration, computeClipSha256) inside an outer Promise.all over the clip array — wall-clock is roughly max-per-clip instead of sum-of-all, idiomatic for independent I/O"
    - "Hash-based idempotency: compute candidate manifestHash, compare against on-disk manifestHash, write iff different (or force). Step order pins ProbeError to fire BEFORE the hash compare so corrupt clips short-circuit (case 4 vs case 6 distinction)"
    - "CLI shell-out integration via promisify(execFile)('npx', ['tsx', 'src/cli/index.ts', 'prepare', ...]) + HOME forwarded in spawn env — exercises the CLI surface end-to-end without depending on `pnpm build`. Pattern is reusable for Phase 2/3/4 CLI tests"
    - "Defensive fixture cleanup: rmSync(.golazo, recursive, force) after every cpSync(FIXTURE_ABS, sandbox) so tests stay green even if an operator polluted the committed fixture by running the manual CLI smoke locally"
    - "Path-segment semantics use LAST occurrence not first: resolveKidFromPath uses `lastIndexOf('golazo')` so projects that themselves nest under a parent `golazo` directory still resolve the innermost game-folder triple correctly"

key-files:
  created:
    - src/prepare/manifest.ts
    - src/prepare/manifest.test.ts
    - src/prepare/index.ts
    - src/prepare/index.test.ts
    - .planning/phases/01-foundation-prepare-pipeline/01-05-SUMMARY.md
  modified:
    - src/prepare/errors.ts (added ManifestError; FilenameError + KidPathError + ClipDiscoveryError + ProbeError preserved)
    - src/cli/commands/prepare.ts (Plan 01 stub replaced with real runPrepare-calling handler)
    - src/prepare/kid.ts (indexOf -> lastIndexOf for nested-golazo safety; see deviations)
    - src/prepare/kid.test-cases.ts (added case 11 NESTED to pin lastIndexOf semantics)
  deleted: []

key-decisions:
  - "manifestHash lives at the TOP LEVEL of the manifest, NOT nested inside a `render` sub-block. The design spec's example shows a nested layout that contradicts the Phase 1 idempotency contract — the hash MUST exist before any render runs. Phase 2 WILL add a sibling render block alongside manifestHash, but MUST NOT relocate manifestHash into it. Inline comment in src/prepare/manifest.ts records this"
  - "Per-clip `sha256` field is REQUIRED in the manifest (additive over the design spec's `{file, durationSec}` example) so manifestHash is reproducible from the manifest contents alone. Plan 04 set this contract; Plan 05 codifies it in the zod schema"
  - "buildManifest computes manifestHash via Plan 04's computeManifestHash; the canonical input format (`folderName + '\\n' + sorted file:sha256 lines`) is pinned by Plan 04's independent-recomputation test and re-asserted in Plan 05's manifest.test.ts case 1"
  - "MANIFEST_SCHEMA_VERSION = 1 — current schema version. Phase 2 adds the render block additively (no version bump); breaking changes would bump this constant"
  - "MANIFEST_FILE_NAME = '.golazo/manifest.json' — load-bearing path. Phase 2/3 read from the same path"
  - "writeManifest emits 2-space JSON indent + trailing newline — readable diffs, well-formed text by Unix conventions"
  - "readManifest returns null when the file is absent (so the orchestrator treats absence as 'first run' rather than as an error); throws ManifestError on malformed JSON OR zod validation failure; remediation message always tells the operator to delete the corrupt manifest and rerun 'golazo prepare'"
  - "runPrepare step order is load-bearing: probe + sha256 run BEFORE the existing-manifest hash compare so corrupt clips short-circuit to ProbeError instead of taking the hash-changed branch. Documented in src/prepare/index.ts JSDoc"
  - "CLI handler output strings are part of the public contract (Phase 2/3 plans should preserve them): 'manifest written to <path> (<N> clips, <s>s total)', 'manifest up to date (hash matches)', 'manifest updated (content changed) -> <path> ...', 'manifest rewritten (force) -> <path>'"
  - "ESM .js import suffixes throughout (NodeNext module resolution); zod parsed via direct import, not via barrel file"
  - "DEVIATION: resolveKidFromPath uses `lastIndexOf` not `indexOf`. With indexOf, paths checked out under a parent directory named `golazo` (this project's own checkout being the canonical example) shadow the real fixture path and resolve the kid to the wrong segment. lastIndexOf picks the innermost golazo, which matches operator intent and makes the Plan 05 verify-gate manual smoke pass from the project root"
  - "DEVIATION: case 4 (CHANGED CONTENT) appends bytes to 02-clip.mp4 instead of `cpSync(03-clip, 02-clip)`. The three committed fixture clips have byte-identical sha256 values (Plan 04 committed three identical encodes), so the cpSync recipe produces no hash change. appendFileSync preserves the mp4 MOOV atom so probeDuration succeeds AND changes the sha256 — exactly the hash-changed branch case 4 intends to exercise"
  - "Plan 01's smoke test for `prepare` is registration-only (asserts the command is registered with a function action handler bound). Replacing the stub action body here required NO edit to src/cli/index.test.ts — that test stayed green throughout"

patterns-established:
  - "Async orchestrator pattern: leaf modules are pure functions or single-purpose I/O wrappers, composed under one async entry point that owns the step order and error vocabulary. The entry point does no I/O itself (it delegates), it just decides what to call when"
  - "Idempotency-by-hash pattern: compute candidate hash, read on-disk hash, decide to write iff different (or force). Skip-without-side-effect is the default; write is the explicit branch. Reusable for Phase 2 (render skip) and Phase 3 (publish skip)"
  - "Promise.all clip processing: per-clip parallelism + cross-clip parallelism via nested Promise.all. Latency-bound work like ffprobe + hashing benefits dramatically from this"
  - "CLI handler error-translation pattern: catch any typed error from the pipeline, write its single-line message to stderr, throw CommanderError(1, ...) so exitOverride propagates the non-zero exit. The error classes do the message-shaping; the CLI just renders them"
  - "Defensive fixture sandboxing pattern: cpSync(FIXTURE, sandbox) + rmSync(sandbox/.golazo) before every mutating test. Protects against the operator who ran a manual smoke locally and left state in the gitignored .golazo/"
  - "lastIndexOf path-segment semantics: when a 'magic' segment name (e.g. 'golazo') can appear multiple times in an absolute path, picking the LAST occurrence usually matches operator intent (the innermost enclosing context is the one that owns the leaf folder)"

requirements-completed:
  - CLI-01
  - PREP-07

# Metrics
duration: 12min 45s
completed: 2026-05-14
started: 2026-05-14T01:52:14Z
---

# Phase 01 Plan 05: Manifest Builder + runPrepare Orchestrator + CLI Handler + Integration Tests Summary

**`golazo prepare <folder>` works end-to-end: drops `.golazo/manifest.json` (zod-validated, version=1, kid+game+clips+totalDurationSec+top-level manifestHash) into a game folder; re-runs are no-ops via hash-based idempotency; content changes trigger rewrite; `--force` overrides. `runPrepare` composes the six Plan 02-04 modules (loadChannelsFile, parseFilename, resolveKidFromPath, discoverClips, probeDuration, computeClipSha256, computeManifestHash) into a single async entry point with per-clip Promise.all parallelism. 13 integration test cases (10 orchestrator + 3 CLI shell-out via npx tsx) cover first-run / no-op / force / content-changed / determinism / corrupt-clip / empty-folder / bad-folder-name / unknown-kid / no-golazo-segment, all running on a fresh checkout without `pnpm build`. Plan 01's stub action handler replaced in src/cli/commands/prepare.ts; src/cli/index.test.ts untouched because Plan 01 deliberately scoped that test to registration-only. Phase 1's success criteria 1, 3, 4, and 5 (prepare half) are now observable; CLI-01 and PREP-07 flip to Complete, taking Phase 1 to 8/8 requirements complete.**

## Performance

- **Duration:** 12 min 45 s
- **Started:** 2026-05-14T01:52:14Z
- **Completed:** 2026-05-14T02:04:59Z
- **Tasks:** 3 (Task 1 TDD manifest module; Task 2 TDD runPrepare orchestrator; Task 3 CLI handler swap + 3 CLI integration cases + Rule-1 fix to resolveKidFromPath)
- **Files created:** 5 (manifest.ts, manifest.test.ts, index.ts, index.test.ts, this SUMMARY)
- **Files modified:** 4 (errors.ts +ManifestError; prepare.ts stub→real; kid.ts indexOf→lastIndexOf; kid.test-cases.ts +case 11)

## Final Manifest Schema (load-bearing — Phase 2/3 extend it additively)

```ts
const clipEntrySchema = z.object({
  file: z.string().regex(/^\d{2,}-.+\.mp4$/),
  durationSec: z.number().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const manifestSchema = z.object({
  version: z.literal(1),
  kid: z.string().min(1),
  game: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    opponent: z.string().min(1),
    scoreFor: z.number().int().min(0),
    scoreAgainst: z.number().int().min(0),
    result: z.enum(['W', 'L', 'D']),
  }),
  clips: z.array(clipEntrySchema).min(1),
  totalDurationSec: z.number().positive(),
  manifestHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

export type Manifest = z.infer<typeof manifestSchema>;
```

**Phase 2 contract:** Phase 2 WILL add a sibling `render: { episodePath, thumbnailPath, renderedAt }` block alongside `manifestHash`. It MUST NOT relocate `manifestHash` into `render` — the hash exists BEFORE any render runs.

**Phase 3 contract:** Phase 3 WILL add a sibling `publish: { videoId, watchUrl, uploadedAt, channelId, privacyStatus }` block. Same rule — additive only.

## Architectural Note: `manifestHash` at TOP LEVEL (NOT inside `render`)

The design spec (`docs/superpowers/specs/2026-05-13-golazo-design.md`) sketches a nested layout with `manifestHash` inside a `render` sub-block. That layout contradicts the Phase 1 idempotency contract — **the hash must exist before any render runs**. Phase 1 emits it (so prepare is idempotent without rendering); Phase 2's render driver consumes it (to decide whether to re-render).

If Phase 2 puts `manifestHash` inside `render`:
1. Plan 1's `prepare` cannot write a manifest until render has completed (chicken-and-egg) — OR it has to write a synthetic render block, which is dishonest;
2. `runPrepare`'s `existing.manifestHash === candidate.manifestHash` no-op check needs to reach inside a sub-block that may not exist yet;
3. The semantic of "the hash represents the prepared content" is muddied by colocation with rendering metadata.

The chosen layout — `manifestHash` at top level, `render`/`publish` as siblings added later — keeps each phase's output orthogonal and each phase's reads simple.

An inline comment in `src/prepare/manifest.ts` (the module JSDoc + the schema definition) records this decision so future readers see it without grepping summaries.

## Additive Spec Deviation: Per-Clip `sha256` Field (Phase 2/3 MUST preserve)

The design spec's manifest example shows `clips: [{file, durationSec}, ...]`. Plan 04 introduced the contract that `manifestHash` is computed from `(folderName, sorted file:sha256 pairs)`. Without exposing each clip's `sha256` in the manifest, no reader can reproduce `manifestHash` from the manifest contents alone — they'd have to re-hash the on-disk clips. That breaks the cache-invalidation use case (the whole point is to compare a recorded hash against a recomputed hash to detect drift).

So clips entries are `{ file, durationSec, sha256 }` — additive, NOT breaking. Phase 2's render driver and Phase 3's publish client both ignore `sha256` if they don't care about it; they MUST NOT remove or mutate the field.

Plan 04 SUMMARY documents the rationale. Plan 05 codifies it in the zod schema and pins it with case 9 of `manifest.test.ts` (non-hex sha256 fails schema).

## CLI Handler Output Strings (Phase 2+3 plans should preserve)

The plan's `<behavior>` table mandates these exact strings; the CLI shell-out tests assert on them; Phase 2/3 should not change them silently.

| Reason         | Output line                                                          |
| -------------- | -------------------------------------------------------------------- |
| `first-run`    | `manifest written to <path> (<N> clips, <sec>s total)`               |
| `hash-match`   | `manifest up to date (hash matches)`                                 |
| `hash-changed` | `manifest updated (content changed) -> <path> (<N> clips, <sec>s ...)` |
| `force`        | `manifest rewritten (force) -> <path>`                               |

Errors from runPrepare are surfaced verbatim to stderr (each error class already shapes its `.message` as a single line with field/reason/remediation), then a `CommanderError(1, 'commander.prepareFailed', 'prepare failed')` is thrown so the exit code is non-zero.

## Idempotency Invariants (Phase 2 MUST honor)

`computeManifestHash` is the contract surface. Its inputs are:
- `folderName` (just the basename — NOT the absolute path; this is what makes two operators with the same fixture content get the same hash regardless of their absolute working directories)
- Per-clip `{file, sha256}` pairs (sorted by `file` inside the function)

Music selection metadata, render metadata, and publish metadata are EXCLUDED from the hash. Re-rendering with the same prepared content does not invalidate the cache; picking a new music track does not either.

Phase 2 will read `manifestHash` to decide whether to re-render. Phase 3 will read it to short-circuit re-uploads. If Phase 2 or Phase 3 mutates the canonical input set (e.g. starts including music selection in the hash), both phases drift apart silently and the idempotency contract collapses. **DO NOT MUTATE the canonical input set in Phase 2 or Phase 3.**

## Observed End-to-End Runtime

3-clip fixture (`tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/`), ~28KB clips each:

| Step                                  | Wall-clock        |
| ------------------------------------- | ----------------- |
| Cold first-run (parse + probe + hash) | ~150 ms in vitest |
| Hot no-op (existing hash matches)     | ~50 ms in vitest  |
| `npx tsx` CLI spawn first-run         | ~400 ms           |

The CLI cases take longer due to `npx` resolution + tsx loader startup. Phase 2 / 3 budgets:
- Phase 2 render is the slow path (Remotion CLI invocation); budget seconds/minutes per render, not milliseconds
- Phase 3 publish is network-bound (YouTube API); budget seconds per upload chunk + retries

## TSX Execution Pattern for Tests (Phases 2+3+4 reuse this)

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

const { stdout, stderr } = await execFileAsync(
  'npx',
  ['tsx', 'src/cli/index.ts', 'prepare', sandbox, '--channels-config', CHANNELS_PATH],
  { env: { ...process.env, HOME: REPO_ROOT }, cwd: REPO_ROOT },
);
```

- No `pnpm build` dependency — tsx executes the TypeScript source directly.
- `HOME` forwarded so the fixture's tilde-pathed `oauth_token` entries resolve.
- `cwd` set explicitly so relative `--channels-config` paths resolve consistently.
- Per-test timeout bumped to 30s for the spawn-based cases (npx + tsx startup overhead is ~400ms, but vitest's default 5s timeout doesn't leave headroom for slow CI).

Phase 2 will reuse this pattern for `golazo render <folder>` integration tests; Phase 3 for `golazo publish <folder>` (with `nock`-stubbed YouTube API); Phase 4's QA-02 for the full `golazo all <folder>` chain.

## Test Design Note: Case 4 (CHANGED CONTENT) vs Case 6 (CORRUPT CLIP)

These two cases exercise distinct branches in `runPrepare`'s step order:

- **Case 6 (ProbeError path):** `02-clip.mp4` is overwritten with raw text bytes (`'this is not a valid mp4'`). `discoverClips` still includes it (matches the filename regex), but `probeDuration` rejects with `ProbeError(exitCode: 1, stderr: ...Invalid data...)`. The orchestrator short-circuits at step 5 (probe+hash); never reaches step 7 (hash compare).
- **Case 4 (hash-changed path):** `02-clip.mp4` has `'EXTRA-TRAILING-BYTES'` appended via `appendFileSync`. The mp4 MOOV atom is intact, so `probeDuration` succeeds (still returns ~2.0s). `computeClipSha256` returns the new (longer) bytes → different sha256 → different manifestHash. The orchestrator reaches step 7 and takes the `existing.manifestHash !== candidate.manifestHash` branch.

The two recipes must remain distinct. If case 4 used `Buffer.from('different bytes')` (or any non-mp4 content), it would collapse into case 6 and the hash-changed branch would be untested.

**Deviation from the plan's case 4 design** (`cpSync(03-clip, 02-clip)`): the three committed fixture clips are byte-identical (sha256 `ec9adf11...`). `cpSync(03 → 02)` produces no hash change. `appendFileSync` preserves case 4's intent while accommodating the fixture as it actually exists.

## Decisions Made

See frontmatter `key-decisions`. Highlights:

- `manifestHash` at TOP LEVEL of manifest (NOT inside `render`) — load-bearing contract
- Per-clip `sha256` field in schema — additive over design spec example; required for hash reproducibility
- `runPrepare` step order pins ProbeError BEFORE hash compare so corrupt clips short-circuit cleanly
- CLI output strings frozen as a contract — Phase 2/3 must preserve
- `resolveKidFromPath` uses `lastIndexOf('golazo')` — handles nested-golazo paths correctly
- TSX-based CLI shell-out for tests — no `pnpm build` dependency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] All orchestrator tests sandbox under `os.tmpdir()` (the plan's "against the committed fixture" framing was naive)**

- **Found during:** Task 2 first vitest run — cases 1, 2, 3 failed with `UnknownKidError: 'tests'`.
- **Root cause:** `resolveKidFromPath` finds the FIRST `golazo` segment in the absolute path. The committed fixture is at `<repo>/tests/fixtures/golazo/leo/...`, and the repo itself is checked out under `/Users/<name>/Documents/code/golazo/...`. The first `golazo` segment is the repo root → kid candidate = `tests` → `UnknownKidError`.
- **Fix:** All cases (not just the mutating ones the plan called out) clone the fixture into `<tmpHome>/golazo/leo/<game-folder>/` via `cpSync(FIXTURE_ABS, sandbox, {recursive: true})`. The sandbox lives under `os.tmpdir()` where there's no parent `golazo` directory.
- **Why this is Rule 3 not Rule 4:** the fix is local to the test file's setup; no architectural change. The fix preserved every assertion the plan defined.
- **Files modified:** `src/prepare/index.test.ts`
- **Verification:** All 10 orchestrator cases pass after the fix.
- **Committed in:** `b2389c9`

**2. [Rule 1 — Bug] `resolveKidFromPath` used `indexOf` instead of `lastIndexOf` for the `golazo` segment**

- **Found during:** Task 3 manual CLI verify gate against the committed fixture.
- **Root cause:** Same as deviation 1 (project checked out under a `golazo` directory). The orchestrator-test cases worked around the issue with sandboxing, but the manual CLI smoke (`HOME=$PWD npx tsx src/cli/index.ts prepare tests/fixtures/golazo/leo/...`) ran from the project root and hit the same shadow-segment problem.
- **Fix:** `src/prepare/kid.ts` switched from `segments.indexOf('golazo')` to `segments.lastIndexOf('golazo')`. The semantic is more correct: the INNERMOST enclosing `golazo/<kid>/<game-folder>/` triple owns the game folder. Existing 10 cases stay green because they build paths under fresh tmpdirs without a parent `golazo` segment. Added `kid.test-cases.ts` case 11 (NESTED golazo: two `golazo` segments → resolves to innermost) to pin the new semantics.
- **Files modified:** `src/prepare/kid.ts`, `src/prepare/kid.test-cases.ts`
- **Verification:** All 13 kid cases pass (was 10 in Plan 03 + 1 NESTED here, plus 2 meta-tests).
- **Committed in:** `aa1a466`

**3. [Rule 1 — Bug] Case 4 (CHANGED CONTENT) recipe needed to use `appendFileSync` instead of `cpSync(03-clip, 02-clip)`**

- **Found during:** Task 2 first vitest run on case 4.
- **Root cause:** Plan 04 committed three byte-identical mp4 clips (sha256 `ec9adf11...` for all three). `cpSync(03 → 02)` overwrites identical bytes with identical bytes → sha256 unchanged → manifestHash unchanged → orchestrator takes the `hash-match` branch instead of `hash-changed`.
- **Fix:** Replaced `cpSync` with `appendFileSync(join(sandbox, '02-clip.mp4'), 'EXTRA-TRAILING-BYTES')`. The mp4 MOOV atom stays intact (mp4 parsers tolerate trailing data) so `probeDuration` still returns a positive duration; `computeClipSha256` returns a new digest; orchestrator reaches the `hash-changed` branch. Case 6 (raw garbage bytes → ProbeError) still owns the ProbeError path; the two cases remain orthogonal.
- **Files modified:** `src/prepare/index.test.ts`
- **Verification:** Case 4 reaches `result.reason === 'hash-changed'` with `result.manifest.manifestHash !== baselineHash`; case 6 still reaches `ProbeError`. Both green.
- **Committed in:** `b2389c9`

**4. [Rule 2 — Critical robustness] Tests defensively strip `.golazo/` from sandbox clones**

- **Found during:** Task 3 — re-running the full suite after a manual CLI smoke that wrote a manifest into the committed fixture's `.golazo/`.
- **Root cause:** `.golazo/manifest.json` is gitignored, so it can exist locally (left behind by any manual smoke or test run that operated directly on the fixture). `cpSync(FIXTURE_ABS, sandbox, {recursive: true})` copies it into the sandbox; the orchestrator then sees an "existing" manifest with a matching hash → takes the `hash-match` no-op branch → cases 1 and 11 expected `first-run` but got `hash-match`.
- **Fix:** After every `cpSync(FIXTURE_ABS, ...)`, add `rmSync(join(sandbox, '.golazo'), {recursive: true, force: true})`. Six call sites updated (two in the fixture-sandbox `beforeEach`, two in case 5's determinism setup, one in case 4, one in the CLI shell-out `beforeEach`).
- **Files modified:** `src/prepare/index.test.ts`
- **Verification:** Manually polluted the fixture's `.golazo/manifest.json` and re-ran the full suite — all 119 tests still green.
- **Committed in:** `aa1a466`

---

**Total deviations:** 4 auto-fixed (1 test infrastructure sandboxing; 1 architectural-but-tiny `indexOf → lastIndexOf` in Plan 03 module; 1 case 4 recipe change; 1 defensive cleanup). No architectural decisions needed; no scope expansion. The `manifestHash` top-level placement and per-clip `sha256` field are not deviations — they are explicit design contracts pinned in Plan 04 SUMMARY.

## Issues Encountered

- **`mtimeNs` is `undefined` on macOS without `bigint: true`:** Initial tests asserted on `statSync(file).mtimeNs`, which is `undefined` because Node returns nanosecond precision only when `stat`/`statSync` is called with the `bigint` option. Switched to `mtimeMs` (number, available unconditionally). Caught during Task 2 vitest run; fixed before commit. No impact on the test's assertion strength — millisecond precision is more than enough to detect a rewrite (the test waits 20 ms between baseline + retry).
- **Shell tool truncation on chained `grep -q && echo` verify gates:** Same artefact noted in Plans 02-04 — chaining ~5+ `grep -q` gates with `&&` sometimes produces no output even when each gate passes. Worked around by running each gate individually OR moving the checks into a small Node.js script (`node -e '...'`) that reports per-gate PASS/FAIL. All Task 1 + Task 2 + Task 3 grep gates verified passing.
- **Manual CLI smoke pollutes the committed fixture's `.golazo/`:** Documented as deviation 4 above. The fixture's `.golazo/` is gitignored, so the pollution doesn't reach git, but it can break subsequent in-place test runs unless the tests defensively strip it. Tests now do.

## User Setup Required

None for this plan. ffmpeg + ffprobe are already installed from Plan 04 (Homebrew, macOS-only per design spec). No new packages added — zod, commander, yaml, and all dev deps are inherited from Plans 01-02.

## Next Phase Readiness

- **Phase 2 (Render Pipeline) is unblocked.** Reads:
  - `readManifest(folderPath)` returns the validated `Manifest` shape — Phase 2 uses `m.clips` for the sequence list, `m.totalDurationSec` for the music-pick duration budget, and `m.manifestHash` for the render-cache key.
  - The render driver will add a sibling `render: { episodePath, thumbnailPath, renderedAt }` block alongside `manifestHash` — additive, no schema version bump.
  - The render driver MUST NOT mutate the `computeManifestHash` canonical input set. The hash is the contract that bridges Phase 1 ↔ Phase 2 ↔ Phase 3.
- **Phase 3 (Publish Pipeline) is also unblocked** (transitively via Phase 2 — it reads `episode.mp4` + `thumb.png` from the render block and `m.game.*` for the title/description templates).
- **Phase 4 (Convenience & QA Polish) can reuse the TSX shell-out pattern for `golazo all <folder>` integration tests.**
- **No blockers / concerns carried forward.**

## Self-Check: PASSED

All claimed files and commits exist on disk and in git history:

```
FOUND: src/prepare/manifest.ts (export const manifestSchema; export function buildManifest / writeManifest / readManifest; MANIFEST_SCHEMA_VERSION; MANIFEST_FILE_NAME)
FOUND: src/prepare/manifest.test.ts (13 unit tests)
FOUND: src/prepare/index.ts (export async function runPrepare + PrepareResult type)
FOUND: src/prepare/index.test.ts (10 orchestrator cases + 3 CLI shell-out cases = 13 integration tests)
FOUND: src/prepare/errors.ts (export class ManifestError + the 4 prior classes preserved)
FOUND: src/cli/commands/prepare.ts (real handler — Plan 01 stub replaced)
FOUND: src/prepare/kid.ts (indexOf → lastIndexOf fix for nested-golazo paths)
FOUND: src/prepare/kid.test-cases.ts (added case 11 NESTED)
FOUND: .planning/phases/01-foundation-prepare-pipeline/01-05-SUMMARY.md (this file)
FOUND commit: adffb14 (Task 1: manifest schema + buildManifest/readManifest/writeManifest)
FOUND commit: b2389c9 (Task 2: runPrepare orchestrator + 10 integration tests)
FOUND commit: aa1a466 (Task 3: real CLI handler + 3 CLI shell-out tests + nested-golazo kid fix)
TSC:    exit 0 (npx tsc --noEmit)
ESLINT: exit 0 (npx eslint src/)
VITEST: 119 passed / 119 (9 test files: cli/index, config/{channels,errors}, prepare/{filename, kid, clips, hash, manifest, index})
CLI SMOKE first-run:  "manifest written to ... (3 clips, 6s total)" + exit 0
CLI SMOKE no-op:      "manifest up to date (hash matches)" + exit 0
CLI SMOKE --force:    "manifest rewritten (force) -> ..." + exit 0
WRITTEN MANIFEST: version=1, kid=leo, 3 clips with sha256+durationSec, totalDurationSec=6, manifestHash matches /^sha256:[0-9a-f]{64}$/
```

## TDD Gate Compliance

This plan was not declared `type: tdd` at the plan-level frontmatter — it's `type: execute` (composing already-tested leaf modules). Individual tasks (Tasks 1 and 2) used the TDD cycle internally: RED test commit → GREEN implementation in the same atomic commit. Plan-level RED/GREEN/REFACTOR gates do not apply.

---

_Phase: 01-foundation-prepare-pipeline_
_Completed: 2026-05-14_
