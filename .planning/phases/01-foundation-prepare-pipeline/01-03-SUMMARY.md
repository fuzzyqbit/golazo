---
phase: 01-foundation-prepare-pipeline
plan: 03
subsystem: prepare
tags: [parser, regex, path-resolution, vitest, tdd, typescript, esm]

# Dependency graph
requires:
  - 01-01 (CLI scaffold provides src/prepare/ skeleton, tsconfig, vitest)
  - 01-02 (loadChannelsFile + UnknownKidError — kid.ts reuses both)
provides:
  - "src/prepare/filename.ts — FILENAME_REGEX + parseFilename(folderName) → GameMeta"
  - "src/prepare/kid.ts — resolveKidFromPath(absoluteFolderPath, opts?) → kidKey"
  - "src/prepare/errors.ts — FilenameError + KidPathError (single-line message classes with toJSON)"
  - "src/prepare/types.ts — GameMeta, MatchResult ('W' | 'L' | 'D')"
  - "src/prepare/filename.test-cases.ts — FILENAME_VALID_CASES (7) + FILENAME_MALFORMED_CASES (13)"
  - "src/prepare/kid.test-cases.ts — KID_TEST_CASES (10) + DEFAULT_CHANNELS_YAML + MATEO_ONLY_CHANNELS_YAML"
affects:
  - 01-04 (clip discovery — works in a parsed game folder, may reuse GameMeta type)
  - 01-05 (manifest builder + runPrepare orchestrator — composes parseFilename + resolveKidFromPath to populate manifest.kid and manifest.game)
  - Phase 2 render (title cards / chapter cards consume manifest.game.opponent, .scoreFor, .scoreAgainst, .result)
  - Phase 3 publish (title/description templates consume the same GameMeta fields)

# Tech tracking
tech-stack:
  added: []  # No new packages — pure stdlib + Plan 01-02 loader
  patterns:
    - "Pure-function parser: parseFilename is I/O-free; resolveKidFromPath does exactly one read (channels.yaml via Plan 02 loader), no fs writes"
    - "Error class shape mirrors Plan 02: instance carries structured fields (folderName/folderPath, reason), single-line message echoes the expected format / layout, toJSON() emits a plain object for structured logging"
    - "Date validity via round-trip: new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d catches month 13, Feb 30, June 31 — chosen over a date library to keep zero-dep"
    - "Path segmentation: normalize() + replace trailing-sep regex + split(sep).filter(Boolean), then indexOf('golazo') to locate the kid segment"
    - "Test-cases fixtures extracted to *.test-cases.ts siblings (excluded from build outputs via the existing tsconfig glob), importable from non-vitest tooling — mirrors Plan 02's pattern, reaffirmed as project convention"

key-files:
  created:
    - src/prepare/types.ts
    - src/prepare/errors.ts
    - src/prepare/filename.ts
    - src/prepare/filename.test.ts
    - src/prepare/filename.test-cases.ts
    - src/prepare/kid.ts
    - src/prepare/kid.test.ts
    - src/prepare/kid.test-cases.ts
  modified: []
  deleted:
    - src/prepare/.gitkeep  # superseded by real source files

key-decisions:
  - "Date validity check uses Date round-trip (`new Date(d + 'T00:00:00Z').toISOString().slice(0,10) === d`) — zero-dep and catches month 13, Feb 30, June 31"
  - "FilenameError message ends with `Expected format: YYYY-MM-DD_vs_<slug>_<for>-<against> (e.g. 2026-05-13_vs_united_3-1)` — the literal substring asserted by every malformed-case test, so this is now a stable contract"
  - "KidPathError message ends with `Expected layout: ~/golazo/<kid>/<game-folder>/` — analogous stable contract for path-layout failures"
  - "Score range enforced at 0..99 (regex catches non-digits; explicit range check rejects 100+). The plan asked for 'one or more digits' on the regex + 0..99 on the value; rejecting `2026-05-13_vs_united_100-1` is implemented via the explicit range check"
  - "Test-cases fixtures live in `*.test-cases.ts` (not `*.test.ts`) — reaffirms Plan 02's decision that the tsx -e verify gate imports the sibling fixtures module, not the test file (vitest's describe() crashes outside the runner)"
  - "`'golazo'`-as-final-segment vs `'golazo'`-followed-by-game-folder are distinct error vocabularies: the former throws KidPathError (no kid candidate exists), the latter throws UnknownKidError (the game-folder name was offered as a candidate and rejected). Both are correct per the plan's case 8 note"
  - "Channel loader override forwarding: `resolveKidFromPath` passes `{ path: opts.channelsPath }` to `loadChannelsFile` only when defined, otherwise calls with no args (so Plan 02's CHANNELS_FILE_DEFAULT applies)"

patterns-established:
  - "Prepare-module error class convention: extends Error, sets name, sets prototype, exposes constructor inputs as readonly fields, toJSON() for structured logging — matches Plan 02"
  - "Per-task test fixtures: write *.test-cases.ts first → write *.test.ts importing the named consts → confirm RED → implement → confirm GREEN. Plans 04+05 will reuse this pattern for clip discovery + manifest builders"
  - "Per-row HOME override is opt-in via a `useHomeOverride: true` flag on the test case (vs setting HOME at the suite level) — keeps rows independent so adding the home-relative case did not change any other row's behaviour"

requirements-completed:
  - PREP-01
  - PREP-02

# Metrics
duration: 4min 31s
completed: 2026-05-14
started: 2026-05-14T01:27:50Z
---

# Phase 01 Plan 03: filename parser + kid-from-path resolver Summary

**Pure folder-name to GameMeta parser (`YYYY-MM-DD_vs_<slug>_<for>-<against>` with calendar-validity + 0..99 score range) plus an absolute-path to kid-key resolver that reuses Plan 02's channels loader for kid enumeration and the canonical `UnknownKidError` class — both fully table-driven (7+13 filename rows, 10 kid rows) with row-count meta-tests and zero new runtime dependencies.**

## Performance

- **Duration:** 4 min 31 s
- **Started:** 2026-05-14T01:27:50Z
- **Completed:** 2026-05-14T01:32:21Z
- **Tasks:** 2 (both TDD: RED tests → GREEN implementation in single feat per task)
- **Files created:** 8
- **Files modified:** 0
- **Files deleted:** 1 (`src/prepare/.gitkeep`)

## Accomplishments

- **`parseFilename`** strict-parses the per-game folder convention into a typed `GameMeta`:
  - 7 VALID cases proved end-to-end (single-word + hyphenated + minimum-1-char opponent, 0-0 to 10-9 scores, W/L/D outcomes including draws on Dec 31)
  - 13 MALFORMED cases each throw `FilenameError` whose message echoes the canonical format — covers missing `_vs_`, non-zero-padded date, invalid calendar month (13), invalid Feb 30, uppercase opponent, leading/trailing hyphen on slug, consecutive hyphens, trailing junk, missing scoreAgainst, score > 99
- **`resolveKidFromPath`** derives kid identity from `<anywhere>/golazo/<kid>/<game-folder>/`:
  - 10 cases proved end-to-end: 4 valid (leo, mateo, trailing slash, HOME-overridden home-relative), 1 unknown-kid (alice → `UnknownKidError`), 4 path-layout failures (no `golazo` segment, `golazo` as last segment, relative path, `golazo` followed only by game folder), 1 `channelsPath` override
  - The thrown `UnknownKidError` is verified to be the canonical Plan 02 class — a dedicated assertion catches it via the import from `../config/errors.js` (not a sibling redefinition)
- **Final regex:** `/^(\d{4}-\d{2}-\d{2})_vs_([a-z0-9]+(?:-[a-z0-9]+)*)_(\d+)-(\d+)$/`
  - Capture groups: 1=date, 2=opponent slug, 3=scoreFor, 4=scoreAgainst
  - Slug rule (`[a-z0-9]+(?:-[a-z0-9]+)*`) intentionally allows runs like `ac-milan` while rejecting leading/trailing hyphens and consecutive hyphens — proven by 4 of the 13 malformed cases
- **Error vocabulary** stays small: `FilenameError` (parser) + `KidPathError` (path layout) + `UnknownKidError` (reused from Plan 02). Each carries constructor args on the instance + `toJSON()` for structured logging
- **`tsc --noEmit`**, `vitest run` (5 files, 64 tests passing), and `eslint src/prepare/` all exit 0
- **`tsx -e` row-count gates** confirm 7 + 13 + 10 cases via importing the `*.test-cases.ts` sibling modules

## Task Commits

Each task was a single TDD feat commit (RED test fixtures + GREEN implementation in one atomic unit per the project's `<type>: <description>` git-workflow rule):

1. **Task 1: parseFilename + FilenameError/KidPathError + types** — `035555a` (feat)
2. **Task 2: resolveKidFromPath reusing Plan 02 loader + 10-row table** — `8c72d86` (feat)

Cleanup commit:

3. **Remove src/prepare/.gitkeep superseded by real files** — `f6f271d` (chore)

**Plan metadata commit:** (this commit) — `docs(01-03): complete filename parser + kid resolver plan`

## Final Regex (committed in `FILENAME_REGEX`)

```ts
export const FILENAME_REGEX =
  /^(\d{4}-\d{2}-\d{2})_vs_([a-z0-9]+(?:-[a-z0-9]+)*)_(\d+)-(\d+)$/;
```

| Group | Captures             | Validated further by                                |
|-------|----------------------|------------------------------------------------------|
| 1     | `YYYY-MM-DD`         | `isRealCalendarDate()` round-trip                    |
| 2     | opponent slug        | regex alone (lowercase / no leading-trailing hyphen) |
| 3     | scoreFor digits      | `Number(...) ≤ 99` explicit range check              |
| 4     | scoreAgainst digits  | `Number(...) ≤ 99` explicit range check              |

## Date Validity Strategy

Used **Date round-trip** rather than a dedicated library:

```ts
const d = new Date(`${dateStr}T00:00:00Z`);
return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
```

Two malformed cases prove this catches what plain regex cannot:
- `2026-13-01_vs_united_3-1` (month 13 — month exceeds the year)
- `2026-02-30_vs_united_3-1` (Feb 30 — month-end overflow)

Both would pass the regex (`\d{2}` accepts `13` and `30`), so the round-trip is load-bearing. Chosen over `date-fns` / `dayjs` to keep the dependency footprint flat (the plan was explicit about pure-function design).

## How Tmp Dirs Are Set Up in Tests (reusable in Plans 04+05)

`kid.test.ts` establishes a per-row pattern that Plans 04 and 05 can reuse:

```ts
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'golazo-kid-test-'));
  originalHome = process.env.HOME;
});

afterEach(() => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;
  rmSync(tmpDir, { recursive: true, force: true });
});
```

Each `KidTestCase` row:

- declares `tokenPaths` (relative to channels.yaml's parent dir — matches Plan 02's resolution rule)
- builds the folder path via `folderPathBuilder(tmpDir)` and the channels.yaml path via the optional `channelsPathBuilder(tmpDir)`
- opts into HOME override via `useHomeOverride: true` when the row needs `~/golazo/...` to resolve under the scratch space

Plans 04+05 will follow the same shape for their clip-folder fixtures.

## Additional Malformed Cases Discovered During TDD

None beyond the 13 the plan enumerated. Each plan-spec'd row landed verbatim. Two implementation refinements emerged during GREEN:

1. **`noUncheckedIndexedAccess` on `RegExpExecArray`** — strict mode types `match[1]` etc. as `string | undefined` even after a successful exec. Added a defensive `if (date === undefined || ...) throw` guard with a `/* c8 ignore */` comment so coverage tooling does not penalise the unreachable branch.
2. **Trailing-separator regex on path normalize** — used `new RegExp(\`\\${sep}+$\`)` so the strip works on macOS (`/`) and would still work on Windows (`\\`). The project is macOS-only per the spec, but the code stays portable to keep tests platform-agnostic.

## Decisions Made

Already captured in frontmatter `key-decisions`. Notably:

- `FilenameError` and `KidPathError` message tails are stable contracts (`Expected format: …` / `Expected layout: …`)
- `resolveKidFromPath` does NOT redefine `UnknownKidError` — it imports the canonical class from `../config/errors.js` and the test suite explicitly proves this (`expect(err).toBeInstanceOf(UnknownKidError)` against the Plan 02 import)
- `golazo` as final segment → `KidPathError`; `golazo` followed only by game folder → `UnknownKidError` (game-folder name offered as candidate kid). The plan's case 8 note authorises this split — both error vocabularies are correct for their respective situations

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan-spec verify command imports the `*.test.ts` file under `tsx -e`, which crashes outside the vitest runner — same root cause as Plan 02 deviation #2**
- **Found during:** Task 1 verify gate (`npx tsx -e "import('./src/prepare/filename.test.ts').then(...)"`)
- **Issue:** vitest's `describe()` requires `getCurrentSuite()` context from the runner. A bare `tsx -e` import evaluates the top-level `describe(...)` call and crashes (`Cannot read properties of undefined (reading 'config')`). The plan's verify command literally imports `./src/prepare/filename.test.ts` and `./src/prepare/kid.test.ts`, which would always fail.
- **Fix:** Extracted `FILENAME_VALID_CASES` + `FILENAME_MALFORMED_CASES` to `src/prepare/filename.test-cases.ts` and `KID_TEST_CASES` + the channels-yaml fixture strings to `src/prepare/kid.test-cases.ts`. The test files re-export the named consts for backward-compat with any future grep. The verify commands now import the sibling fixtures modules instead. Meta-tests inside the vitest run still assert the same row-count invariants from the runner side.
- **Files changed:** new `src/prepare/filename.test-cases.ts`, new `src/prepare/kid.test-cases.ts`; test files import the sibling consts.
- **Verification:** `npx tsx -e "import('./src/prepare/filename.test-cases.ts').then(m => console.log(m.FILENAME_VALID_CASES.length + ' ' + m.FILENAME_MALFORMED_CASES.length))"` prints `7 13`. `npx tsx -e "import('./src/prepare/kid.test-cases.ts').then(m => console.log(m.KID_TEST_CASES.length))"` prints `10`. Project convention reaffirmed (Plan 02 made the same call; STATE.md records it as a decision).
- **Committed in:** `035555a` + `8c72d86` (folded into the respective task commits).

**2. [Rule 1 - Bug] `noUncheckedIndexedAccess` flagged `match[1..4]` as possibly undefined on a successful `RegExpExecArray`**
- **Found during:** Task 1 GREEN (`npx tsc --noEmit` after writing `filename.ts`)
- **Issue:** Strict mode types indexed access on `RegExpExecArray` as `string | undefined` because the array length is not known statically — even after the regex (which has exactly 4 capture groups) successfully matches. Direct destructuring would compile-error.
- **Fix:** Added a runtime guard `if (date === undefined || opponent === undefined || scoreForStr === undefined || scoreAgainstStr === undefined)` that throws a defensive `FilenameError`. Annotated with `/* c8 ignore */` so coverage tooling does not flag the unreachable branch when QA-02's 80% gate lands in Phase 4.
- **Files changed:** `src/prepare/filename.ts` (4 extra lines).
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `035555a` (folded into Task 1 commit).

**3. [Rule 1 - Bug] `loadChannelsFile({ path: opts.channelsPath })` would forward `undefined` when no override is set, defeating Plan 02's `CHANNELS_FILE_DEFAULT` fallback**
- **Found during:** Task 2 GREEN (when no `channelsPath` is passed, the loader should use `CHANNELS_FILE_DEFAULT` — but forwarding `{ path: undefined }` would bypass the default).
- **Issue:** Plan 02's loader uses `opts.path ?? CHANNELS_FILE_DEFAULT`, which DOES handle `undefined` correctly — so this was theoretical rather than observable. However, the cleaner contract is "if no override, call with no args at all", which both documents intent and matches how the rest of the codebase will call the loader.
- **Fix:** Branched in `kid.ts`: `opts.channelsPath !== undefined ? loadChannelsFile({ path: opts.channelsPath }) : loadChannelsFile()`. Same observable behaviour, clearer call-site intent.
- **Files changed:** `src/prepare/kid.ts` (1 extra branch).
- **Verification:** Test row 4 (HOME override with no explicit `channelsPath`) and rows 1–3 (channelsPath supplied by harness) both pass — the branch is exercised both ways inside the suite.
- **Committed in:** `8c72d86` (folded into Task 2 commit).

---

**Total deviations:** 3 auto-fixed (1 blocking infrastructure mismatch carried over from Plan 02, 2 strict-mode / contract refinements). No architectural decisions needed; no scope expansion beyond the plan's contract.

## Issues Encountered

- **Shell tool truncation on chained `grep -q ... && echo ...` invocations:** Same artefact noted in Plan 02 — chained grep gates occasionally produced no output even when each sub-command exited 0. Verified each grep gate individually as a fallback. No impact on correctness.
- **`it.each` row labels:** Vitest's `it.each` substitution syntax (`'$input'`) does not interpolate properties when the row array is `[label, row]` tuples (which the channels suite uses to match the legacy pattern). Reused the channels pattern (`.map((c) => [c.name, c] as const)`) so labels render reliably.

## User Setup Required

None. Plans 04 and 05 will continue to need a real `channels.yaml` in the operator's working directory if they invoke the prepare pipeline end-to-end against real folders, but Plan 03's surface is local-only: all tests build their own tmp channels.yaml.

## Next Phase Readiness

- **Plan 01-04 (clip discovery + ffprobe + sha256 + manifest-hash):** Independent of this plan's logic, but may import `GameMeta` from `./types.js` if the discovery function is shaped to take a `GameMeta` rather than a folder name. Tmp-dir test pattern (`mkdtempSync` + `beforeEach` / `afterEach`) is reusable verbatim.
- **Plan 01-05 (manifest builder + runPrepare orchestrator + CLI prepare handler swap):** Composes `parseFilename(folderName)` + `resolveKidFromPath(absoluteFolderPath)` to populate `manifest.kid` and `manifest.game`. The CLI handler will need to catch `FilenameError | KidPathError | UnknownKidError | ChannelsConfigError` and exit code 2 (consistent with Plan 01-01's unimplemented-stub contract).
- **Phase 2 render:** Will consume `manifest.game.opponent`, `.scoreFor`, `.scoreAgainst`, `.result` directly from the manifest schema (Plan 05 will define the manifest schema).
- **Phase 3 publish:** Title/description templates substitute `{Opponent}`, `{scoreFor}`, `{scoreAgainst}`, `{result}`, `{date}` from the same `GameMeta` fields. PUB-03 (opponent pretty-printing) is independent of this parser — the slug stored in the manifest is the raw lowercase form (e.g. `'city-sc'`), and Phase 3's renderer turns it into `'City SC'`.
- **No blockers / concerns carried forward.**

## Self-Check: PASSED

All claimed files and commits exist on disk and in git history:

```
FOUND: src/prepare/types.ts
FOUND: src/prepare/errors.ts
FOUND: src/prepare/filename.ts
FOUND: src/prepare/filename.test.ts
FOUND: src/prepare/filename.test-cases.ts
FOUND: src/prepare/kid.ts
FOUND: src/prepare/kid.test.ts
FOUND: src/prepare/kid.test-cases.ts
FOUND: commit 035555a (Task 1)
FOUND: commit 8c72d86 (Task 2)
FOUND: commit f6f271d (gitkeep removal)
VITEST: 64 passed / 64 (5 files: cli + errors + channels + filename + kid)
TSC:    exit 0
ESLINT: exit 0
TSX-E:  FILENAME_VALID_CASES.length=7, FILENAME_MALFORMED_CASES.length=13, KID_TEST_CASES.length=10
```

---
*Phase: 01-foundation-prepare-pipeline*
*Completed: 2026-05-14*
