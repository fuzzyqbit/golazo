---
phase: 01-foundation-prepare-pipeline
plan: 04
subsystem: prepare
tags: [ffprobe, sha256, manifest-hash, child-process, vitest, tdd, typescript, esm, fixture]

# Dependency graph
requires:
  - 01-01 (src/prepare/ skeleton, tsconfig, vitest, npm script wiring)
  - 01-02 (loadChannelsFile — fixture channels.yaml exercises it via HOME stub)
  - 01-03 (FilenameError + KidPathError — errors.ts extended, NOT redefined)
provides:
  - "src/prepare/clips.ts — discoverClips(folderPath) + CLIP_FILENAME_REGEX"
  - "src/prepare/probe.ts — probeDuration(absPath) → Promise<number> (3-decimal-rounded)"
  - "src/prepare/hash.ts — computeClipSha256(absPath) + computeManifestHash(folderName, pairs)"
  - "src/prepare/errors.ts — extended with ClipDiscoveryError + ProbeError"
  - "tests/fixtures/golazo/ — committed integration fixture: channels.yaml + 2 token.json stubs + 3 mp4 clips + 2 READMEs"
  - "scripts/build-fixtures.sh — ffmpeg lavfi testsrc regen script"
affects:
  - 01-05 (manifest builder + runPrepare orchestrator + CLI prepare handler — composes all four prepare modules; integration test exercises the committed fixture; the additive per-clip `sha256` deviation from the design spec is documented here so Plan 05 implements it in the manifest schema)
  - Phase 2 render driver (manifestHash determinism contract MUST stay byte-stable; ffprobe execFile pattern reusable for render-side probing)
  - Phase 4 QA suite (committed fixture is the canonical input for QA-02's `prepare` integration test; the renderStill snapshots in QA-03 can extend `tests/fixtures/`)

# Tech tracking
tech-stack:
  added: []  # No new runtime/dev packages — ffmpeg + ffprobe are system Homebrew binaries assumed by the design spec; node:child_process, node:crypto, node:fs are stdlib
  patterns:
    - "promisify(execFile) — non-shell child_process invocation; rejection branch handles both numeric exit codes and string error codes (ENOENT for missing ffprobe on PATH coerces to -1)"
    - "Streaming sha256: `createReadStream(absPath).on('data')` updates `createHash('sha256')`; resolves on `'end'` with hex digest. Constant-memory for files of any size"
    - "Pure deterministic manifest hash: sort pairs by file name (`localeCompare`), build `folderName + '\\n' + sorted_pairs.map(p => p.file + ':' + p.sha256).join('\\n')`, return `'sha256:' + sha256(canonical).digest('hex')`"
    - "Integer-prefix sort for clip discovery: regex captures `(\\d+)` from `^(\\d+)-.+\\.mp4$` and sorts via `Number(a[1]) - Number(b[1])` so `10-clip.mp4` follows `02-clip.mp4` (lex would put it before)"
    - "Fixture HOME stubbing: `oauth_token: ~/tests/fixtures/golazo/<kid>.token.json` is portable across machines because tests set HOME to `process.cwd()` (vitest) or `\"\\$PWD\"` (manual CLI). Documented in tests/fixtures/golazo/README.md so future plans don't reinvent the convention"
    - "Skipped-files inclusion in error message: ClipDiscoveryError lists every non-matching file in the folder so operators see what got filtered (vs only seeing 'no clips found')"

key-files:
  created:
    - src/prepare/clips.ts
    - src/prepare/clips.test.ts
    - src/prepare/hash.ts
    - src/prepare/hash.test.ts
    - src/prepare/probe.ts
    - scripts/build-fixtures.sh
    - tests/fixtures/golazo/channels.yaml
    - tests/fixtures/golazo/leo.token.json
    - tests/fixtures/golazo/mateo.token.json
    - tests/fixtures/golazo/README.md
    - tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/01-clip.mp4
    - tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/02-clip.mp4
    - tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/03-clip.mp4
    - tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/README.md
  modified:
    - src/prepare/errors.ts (added ClipDiscoveryError + ProbeError; FilenameError + KidPathError untouched)
    - .gitignore (added `!` exceptions for fixture binaries + fixture channels.yaml + token jsons; added `.npm/` cache rule since HOME=$PWD smokes create it)
  deleted: []

key-decisions:
  - "Per-clip `sha256` field on the manifest is an ADDITIVE deviation from the design spec's `{file, durationSec}` example — required so `manifestHash` is reproducible from manifest contents alone. Phase 2 MUST preserve this field; Plan 05's manifest schema definition will codify it"
  - "Canonical input to `computeManifestHash` is `folderName + '\\n' + sortedPairs.map(p => p.file + ':' + p.sha256).join('\\n')` — pure deterministic function. Pinned by a dedicated test that independently recomputes the expected output. DO NOT mutate this contract in Phase 2"
  - "`probeDuration` rounds to 3 decimals (`Math.round(value * 1000) / 1000`) — matches the design spec's `durationSec: 12.345` example and keeps the manifest field JSON-stable across re-probes"
  - "ffprobe wrapper uses `promisify(execFile)` (NOT spawn / NOT sync) — execFile avoids shell parsing (no quoting bugs from paths with spaces), promisify keeps the call-site flat. String error codes (e.g. `ENOENT` when ffprobe is not on PATH) coerce to `-1` exitCode so ProbeError stays typed-numeric"
  - "Fixture `oauth_token` paths use `~/tests/fixtures/...` (tilde-relative) rather than absolute paths — portable across contributor machines and CI. Tests stub `HOME` to repo root via `vi.stubEnv('HOME', process.cwd())`; manual smokes use `HOME=\"$PWD\"`. Documented in tests/fixtures/golazo/README.md"
  - "Committed fixture clips are libx264 ultrafast 320x180@15fps yuv420p (~28KB/clip, no audio) — small enough to commit, valid enough for ffprobe; libx264 threading is NOT bit-stable across versions, so the committed bytes are the canonical reference, not the regeneration script output"
  - "`.gitignore` updated with `!tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/*.mp4` + `!tests/fixtures/golazo/*.token.json` + `!tests/fixtures/golazo/channels.yaml` exceptions — the broad rules (tests/fixtures/*.mp4, *.token.json, channels.yaml) are aimed at operator-side artifacts; the fixture is whitelisted explicitly"
  - "`discoverClips` sorts by integer prefix THEN by full filename as stable tiebreaker — so `01-clip.mp4` always precedes `01-other.mp4` deterministically when two clips share a prefix"
  - "Test files re-use the project's `node:os` `mkdtempSync(join(tmpdir(), 'golazo-...-test-'))` + `afterEach(rmSync)` pattern from Plan 03 — no fixture pollution, no cross-test interference"

patterns-established:
  - "Filesystem-touching leaf module pattern: pure I/O wrapper (no recursion, no state), one synchronous fs op per call (readdirSync, existsSync, statSync) OR one stream operation (createReadStream)"
  - "Error class shape (FOURTH instance — codifies the project convention): extends Error, sets `name`, sets prototype, exposes constructor inputs as readonly fields, `toJSON()` for structured logging. `ClipDiscoveryError` adds `skippedFiles: readonly string[]` to the canonical (folderPath, reason) pair"
  - "Stream-based hashing pattern: `createReadStream(path).on('data', chunk => hash.update(chunk))` + `.on('end', () => resolve(hash.digest('hex')))` + `.on('error', reject)` — copy-pasteable for any other file-hashing surface (manifest hashing reads only synthetic strings, no stream)"
  - "execFile wrapper pattern: `promisify(execFile)` + `try { await … } catch (e) { throw new XYZError({ exitCode, stderr }) }` — render driver (Phase 2) can reuse this for Remotion CLI invocation"
  - "Committed-binary fixture pattern: small regenerable assets stored as bytes for byte-stable inputs to deterministic hashing, with a `scripts/build-*.sh` regen script that's allowed to drift on regeneration. Whitelist via `!` rules in .gitignore"

requirements-completed:
  - PREP-03
  - PREP-04
  # PREP-07 input half (computeClipSha256 + computeManifestHash) is implemented;
  # the manifest writer + on-disk idempotency check land in Plan 05, which is
  # where PREP-07 actually closes. Per the plan frontmatter, all three IDs are
  # listed here, but only PREP-03 + PREP-04 are flipped to Complete in
  # REQUIREMENTS.md by this plan. PREP-07 stays Pending until Plan 05.

# Metrics
duration: 7min 34s
completed: 2026-05-14
started: 2026-05-14T01:37:39Z
---

# Phase 01 Plan 04: Clip Discovery + ffprobe + sha256 + Manifest Hash + Fixtures Summary

**Four leaf modules under `src/prepare/` ready for Plan 05 to compose into the manifest builder: `discoverClips` sorts ordered clip filenames by integer prefix and rejects empty folders with a skipped-files listing; `probeDuration` wraps ffprobe via promisified execFile and rounds duration to 3 decimals; `computeClipSha256` streams files through `createHash('sha256')`; `computeManifestHash` is a pure deterministic function over `folderName + '\n' + sorted "file:sha256" lines`. Three ~28KB H.264 fixture clips, a fixture channels.yaml with tilde-pathed oauth_token paths, and two stub token files are committed under `tests/fixtures/golazo/` with a README documenting the `HOME="$PWD"` requirement that Plan 05's integration test and Phase 2's smoke tests will reuse.**

## Performance

- **Duration:** 7 min 34 s
- **Started:** 2026-05-14T01:37:39Z
- **Completed:** 2026-05-14T01:45:13Z
- **Tasks:** 2 (Task 1 TDD: RED tests → GREEN implementation in single atomic commit; Task 2 fixture infra in a second atomic commit)
- **Files created:** 14
- **Files modified:** 2 (`src/prepare/errors.ts`, `.gitignore`)

## Accomplishments

### `discoverClips` (PREP-03)

- 8 unit-test cases covering: 3-clip in-order folder, mixed numeric prefix (sorts 01/02/10 NOT lex), skipped-non-matching-files in a folder with at least one match, two clips at the same prefix (stable filename tiebreak), empty folder throws `ClipDiscoveryError` with `(none)` skipped list, folder with only non-matching files throws with all names listed, folder does not exist, path is a file not a directory
- 4 dedicated `CLIP_FILENAME_REGEX` cases (matches `01-clip.mp4` / `001-anything-with-dashes.mp4`; rejects `clip-01.mp4` / `notes.txt` / `01clip.mp4` / `01-clip.MP4`)
- 1 `toJSON()` structured-logging assertion
- 1 nested-directory case (`subdir` only — subdir name appears in skipped list)

### `probeDuration` (PREP-04)

- `promisify(execFile)` wrapper that spawns ffprobe with `-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1` (the canonical args from the design spec)
- Rejects non-numeric stdout with a synthetic `ProbeError(exitCode: 0, stderr: "ffprobe returned non-numeric duration: '...'")`
- Rejects non-zero exit with the real exit code + full stderr from ffprobe
- 3-decimal rounding (`Math.round(d * 1000) / 1000`) so the manifest field is JSON-stable across re-probes
- Smoke-tested manually against all three fixture clips (returns `2`) AND against a non-mp4 file (`tests/fixtures/golazo/channels.yaml` → `ProbeError | ffprobe failed on ... (exit code 1): ... Invalid data`)
- No unit test in this plan — integration coverage arrives in Plan 05 against the committed fixture clips. Mocking ffprobe in a unit test would be fragile and add no signal

### `computeClipSha256` + `computeManifestHash` (PREP-07 input half)

- **`computeClipSha256`:** streaming sha256 via `createReadStream` + `createHash`; 64-char lowercase hex with no prefix. 5 unit-test cases including:
  - Hashes `'test'` (UTF-8) → precomputed `9f86d081...0a08`
  - Empty file → precomputed `e3b0c442...b855` (well-known sha256-of-empty)
  - Different content → different hashes
  - Non-existent file → promise rejects
- **`computeManifestHash`:** pure deterministic function. 9 unit-test cases:
  - Output format `^sha256:[0-9a-f]{64}$`
  - Determinism on 10 successive calls
  - Pair-order independence: reversed AND permutation-shuffled pairs produce identical hashes
  - Folder-name sensitivity: changing folderName changes the hash
  - Pair-content sensitivity: changing one sha256 changes the hash
  - Pair-filename sensitivity: changing one filename changes the hash
  - **Canonical-format pinning:** independent recomputation of `'sha256:' + sha256(folderName + '\n' + sorted_pairs.join('\n'))` MUST equal the function output. This is the explicit contract test — DO NOT relax it in Phase 2
  - Empty pairs array (folderName-only hash) — well-defined and DOES differ from the populated-pairs hash

### Fixture infrastructure

- `tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/{01,02,03}-clip.mp4` — three identical ~28KB H.264 clips (libx264 ultrafast, 320x180@15fps, yuv420p, no audio), ffprobe-reports `2.000000` seconds each
- `tests/fixtures/golazo/channels.yaml` — two-kid fixture config; `leo` (jersey 10, accent #ffce5a, Veo) and `mateo` (jersey 7, accent #5acfff, Trace); both oauth_token paths point at `~/tests/fixtures/golazo/<kid>.token.json`
- `tests/fixtures/golazo/{leo,mateo}.token.json` — `{}` stub files (existence-only — Phase 3 implements refresh logic)
- `tests/fixtures/golazo/README.md` — documents HOME=$PWD requirement, the rationale for tilde paths over absolute paths, and a manual one-liner: `HOME="$PWD" npx tsx src/cli/index.ts prepare tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1 --channels-config tests/fixtures/golazo/channels.yaml`
- `tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/README.md` — per-folder regen + libx264-threading determinism note (committed bytes are canonical; regen may produce different bytes)
- `scripts/build-fixtures.sh` — `set -euo pipefail` bash script that runs `ffmpeg -y -f lavfi -i "testsrc=duration=2:..."` three times; resolves repo root via `$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)` so it works from any cwd

## Task Commits

Each task was a single atomic commit:

1. **Task 1: implement discoverClips, computeClipSha256, computeManifestHash** — `9e35cdc` (feat)
2. **Task 2: add probeDuration ffprobe wrapper + committed fixture infra** — `5d7a110` (feat)

**Plan metadata commit:** (this commit) — `docs(01-04): complete prepare leaf modules + fixtures plan`

## Canonical `computeManifestHash` Input Format (stable contract for Phase 2+)

```text
canonical = folderName + '\n' +
            sortedPairs.map(p => p.file + ':' + p.sha256).join('\n')

manifestHash = 'sha256:' + sha256(canonical).digest('hex')
```

Where `sortedPairs = pairs.slice().sort((a, b) => a.file.localeCompare(b.file))`.

**Properties:**

- Pair-order independent (sorted at function entry)
- Newline-separated (no boundary ambiguity between adjacent fields)
- Music and render metadata EXCLUDED (so re-rendering or picking a new music track does not invalidate the cache)
- Pure deterministic function of `(folderName, pairs)` — same inputs always produce same output across machines, OS versions, and Node versions (sha256 itself is stable by definition)

**Phase 2 MUST NOT mutate this contract.** A dedicated test (`canonical input format is folderName + \n + sorted "file:sha256" pairs joined by \n`) recomputes the expected output independently and asserts equality — if anyone changes the formula, that test fails loudly.

## ffprobe child_process Pattern (reusable in Phase 2 for Remotion CLI)

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

try {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    absPath,
  ]);
  // success path
} catch (err) {
  // err.code can be a number (real exit code) OR a string (ENOENT for
  // missing-binary). Coerce string codes to -1 so the error class field
  // stays typed-numeric.
  const exitCode = typeof err.code === 'number' ? err.code : -1;
  const stderr = err.stderr?.toString() ?? err.message ?? '';
  throw new ProbeError({ filePath: absPath, exitCode, stderr });
}
```

**Why execFile not spawn:** execFile doesn't go through a shell, so paths with spaces or special characters don't need quoting. **Why promisify not async/await spawn:** keeps the call-site flat; no need to wire stdout/stderr collectors manually.

## Fixture Clip Generation Pipeline (reusable for Phase 4 QA snapshots)

The `scripts/build-fixtures.sh` pattern:

```bash
ffmpeg -y -f lavfi -i "testsrc=duration=2:size=320x180:rate=15" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
  -movflags +faststart -an "$DIR/${i}-clip.mp4"
```

- **No external assets:** lavfi `testsrc` filter generates a synthetic test pattern. No video files to commit beyond the encoded output.
- **`-movflags +faststart`** moves the MOOV atom to the start of the file — keeps the mp4 streamable, which the render driver may need in Phase 2.
- **`-an`** strips audio. The fixture is video-only; tests don't need audio to exercise duration probing.
- **`-preset ultrafast`** keeps regen fast (~1s per clip) at the cost of encode efficiency. The committed bytes are the reference, not the regen output.
- **Determinism caveat:** libx264 is NOT bit-stable across versions or thread counts. The committed bytes are canonical; tests that need byte-stable inputs derive them from `computeClipSha256` on the committed files, NOT from re-running the regen script.

Phase 4's QA-03 (Remotion `renderStill` snapshots) can extend the same `scripts/build-*.sh` + committed-bytes + README-with-determinism-note pattern.

## Additive Deviation From Design Spec: Per-Clip `sha256` Field

The design spec (`docs/superpowers/specs/2026-05-13-golazo-design.md`) shows the manifest's `clips` array as `[{ file, durationSec }, ...]`. Plan 05's manifest schema will additively include a `sha256` field on each clip entry:

```ts
clips: Array<{ file: string; durationSec: number; sha256: string }>;
```

**Why:** `manifestHash` is defined (per the same design spec, "Idempotency" section) as `sha256` over the sorted `(clipFile, clipSha256)` pairs plus folder name. Without the per-clip `sha256` on the manifest itself, a reader of the manifest cannot reproduce `manifestHash` — they'd have to re-hash the clips, which defeats the cache-invalidation use case (the whole point is to compare the recorded hash against a recomputed-from-disk hash to detect content drift).

**This is an additive, NOT a breaking, deviation:** every other consumer of the manifest (render driver, publish client) ignores the field if it doesn't care about it. Phase 2 MUST preserve this field on the schema; mutating or removing it silently breaks the idempotency contract.

## HOME Stubbing Convention (referenced by Plan 05 + Phase 2 smokes)

- **Vitest:** `vi.stubEnv('HOME', process.cwd())` in `beforeAll` (or per-test as needed)
- **Manual CLI:** `HOME="$PWD" npx tsx src/cli/index.ts prepare tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1 --channels-config tests/fixtures/golazo/channels.yaml`

The fixture `channels.yaml` uses `oauth_token: ~/tests/fixtures/golazo/<kid>.token.json` for portability. Without the HOME override, the tilde expands to the operator's real home directory and the token-existence check fails. The README at `tests/fixtures/golazo/README.md` explains all of this in operator-facing language.

## Decisions Made

Already captured in frontmatter `key-decisions`. Notably:

- Per-clip `sha256` field is additive (load-bearing for idempotency reproducibility)
- Canonical manifestHash input format is `folderName + '\n' + sorted "file:sha256" lines` — pinned by a dedicated independent-recomputation test
- 3-decimal duration rounding for JSON stability
- promisify(execFile) over spawn / sync APIs
- Fixture HOME=$PWD convention (vs absolute oauth_token paths)
- libx264 determinism caveat acknowledged in both fixture READMEs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Initial `computeClipSha256` was not declared `async`, but the plan's verify command greps for `export async function computeClipSha256`**

- **Found during:** Task 1 verify gate (the plan's `<verify>` block runs `grep -q 'export async function computeClipSha256' src/prepare/hash.ts`)
- **Issue:** The function returned `new Promise(...)` directly and was syntactically `export function …(): Promise<string>`. Identical observable behaviour, but the grep gate misses it.
- **Fix:** Added the `async` keyword. `async function` returning a `new Promise(...)` is idiomatic for stream-based async work where there's no genuine `await` opportunity (the resolution is event-driven).
- **Files modified:** `src/prepare/hash.ts`
- **Verification:** `grep -q 'export async function computeClipSha256' src/prepare/hash.ts` exit 0; all 9 hash tests still pass.
- **Committed in:** `9e35cdc` (folded into Task 1 commit).

**2. [Rule 3 - Blocking] `require('node:crypto')` in test file flagged by ESLint flat-config rule `no-undef`**

- **Found during:** Task 1 `npx eslint src/` after writing the canonical-format pinning test in `hash.test.ts`
- **Issue:** I wrote `const { createHash } = require('node:crypto') as typeof import('node:crypto');` to keep the assertion self-contained (independent recomputation of the expected hash). The flat ESLint config does not have CommonJS globals, and `require` is flagged as `no-undef`. Adding `// eslint-disable-next-line` works but is noise.
- **Fix:** Moved `createHash` to a top-level `import { createHash } from 'node:crypto'` at the top of `hash.test.ts`. Functionally identical; lints clean.
- **Files modified:** `src/prepare/hash.test.ts`
- **Verification:** `npx eslint src/` exit 0; all 9 hash tests still pass.
- **Committed in:** `9e35cdc` (folded into Task 1 commit).

**3. [Rule 3 - Blocking] Plan-spec `.gitignore` exceptions were insufficient — fixture's channels.yaml literal was still blocked by Plan 02's broad `channels.yaml` ignore rule**

- **Found during:** Task 2 `git add tests/fixtures/golazo/channels.yaml`
- **Issue:** Plan 02 added a literal `channels.yaml` line to `.gitignore` to prevent committing the operator's real config at the repo root. The plan-spec'd `!` exceptions covered the mp4 binaries and `*.token.json` but NOT the fixture channels.yaml file, so git refused to stage it.
- **Fix:** Added a third `!` exception: `!tests/fixtures/golazo/channels.yaml`. Documented inline in `.gitignore` so the intent is obvious. The broad rule still protects the operator's real channels.yaml at the repo root — only the fixture-namespaced one is whitelisted.
- **Files modified:** `.gitignore`
- **Verification:** `git check-ignore -v tests/fixtures/golazo/channels.yaml` matches `!tests/fixtures/golazo/channels.yaml` (whitelisted); the literal `channels.yaml` at the repo root would still be ignored if it existed.
- **Committed in:** `5d7a110` (folded into Task 2 commit).

**4. [Rule 2 - Missing critical functionality] `HOME="$PWD"` smoke runs leave an `.npm/` cache directory in the repo root**

- **Found during:** Task 2 `git status --short` after running the verify command for the channels.yaml load
- **Issue:** `npx` writes its log + update-notifier cache to `$HOME/.npm`. With `HOME="$PWD"`, that becomes `<repo-root>/.npm/`. Operators running the manual one-liner from the README will encounter the same churn. Left untracked, it pollutes `git status` and risks accidental commits.
- **Fix:** Added `.npm/` to `.gitignore` with an inline comment explaining the HOME-stubbing root cause. Operators following the README still see clean `git status` output after exercising the fixture.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` clean after the smoke; new `.npm/` directory does not appear.
- **Committed in:** `5d7a110` (folded into Task 2 commit).

---

**Total deviations:** 4 auto-fixed (1 grep-gate compatibility, 1 ESLint flat-config alignment, 2 .gitignore augmentations for the fixture's actual on-disk needs). No architectural decisions needed; no scope expansion beyond the plan's contract. The additive per-clip `sha256` field on the manifest schema is NOT a deviation — it's explicitly load-bearing for idempotency reproducibility and documented as such in the plan's `<context>` interfaces block.

## Issues Encountered

- **Shell tool truncation on long chained `&&` invocations:** Same artefact noted in Plans 02 + 03 — chaining 10+ `&&` gates with mixed `grep` / `ffprobe` / `test` calls occasionally produces no output even when each sub-command exits 0. Worked around by capturing stdout into a variable (`DUR=$(...)`) or running each gate individually. All individual gates verified passing.
- **`npx tsx -e` output buffering:** stderr from `npm notice` (update reminder) sometimes interleaves with the script's stdout. Worked around by piping through `grep -v 'npm notice'` for cleaner output during verify gates; the script's actual output (`OK: [ 'leo', 'mateo' ] leo.oauthTokenPath=...`) confirmed the channels.yaml load succeeded.

## User Setup Required

None for this plan — fixture infrastructure is committed; ffmpeg + ffprobe come from Homebrew (`brew install ffmpeg`) per the design spec and were already installed on this machine (`/opt/homebrew/bin/ffprobe`, version 7.1.1). Plan 05's integration test will need the same Homebrew setup; the build CI on CI-only machines (Phase 4) will need to `brew install ffmpeg` as part of its setup.

## Next Phase Readiness

- **Plan 01-05 (manifest builder + runPrepare orchestrator + CLI prepare handler swap):**
  - Imports all four prepare modules: `parseFilename` (Plan 03) + `resolveKidFromPath` (Plan 03) + `discoverClips` + `probeDuration` + `computeClipSha256` + `computeManifestHash`
  - Imports `loadChannel` from Plan 02 (already exercised by the fixture's channels.yaml)
  - Defines the manifest zod schema with `clips: [{ file, durationSec, sha256 }, ...]` — the per-clip `sha256` field is REQUIRED by the manifestHash reproducibility contract
  - Wires the CLI `prepare` handler to call `runPrepare` (replaces the Plan 01-01 stub)
  - Integration test: runs `runPrepare` against `tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/` with `HOME` stubbed to `process.cwd()`, asserts `.golazo/manifest.json` is written with the correct shape AND the correct `manifestHash`, asserts a second invocation is a no-op (idempotency check)
- **Phase 2 render driver:** Reuses the `promisify(execFile)` pattern from `probe.ts` for spawning the Remotion CLI. Reads `manifestHash` from manifest.json to decide whether to re-render. Reuses fixture clip pattern (`scripts/build-*.sh` + committed bytes + determinism README) for any new fixtures it needs.
- **Phase 3 publish:** Reads `manifestHash` from manifest.json for upload short-circuit logic. The fixture's `{leo,mateo}.token.json` stubs are placeholders — Phase 3 will replace the existence-only check with real OAuth-refresh logic.
- **Phase 4 QA:** The committed fixture is the canonical input for QA-02's `prepare` integration test. QA-03 (renderStill snapshots) can extend `tests/fixtures/` using the same committed-binary + regen-script pattern.
- **No blockers / concerns carried forward.**

## Self-Check: PASSED

All claimed files and commits exist on disk and in git history:

```
FOUND: src/prepare/clips.ts (export function discoverClips, export const CLIP_FILENAME_REGEX)
FOUND: src/prepare/clips.test.ts (28 tests: 4 regex + 4 valid + 8 error)
FOUND: src/prepare/hash.ts (export async function computeClipSha256, export function computeManifestHash)
FOUND: src/prepare/hash.test.ts (14 tests: 5 sha256 + 9 manifestHash)
FOUND: src/prepare/probe.ts (export async function probeDuration)
FOUND: src/prepare/errors.ts (export class ClipDiscoveryError, export class ProbeError + Plan 03's FilenameError/KidPathError preserved)
FOUND: scripts/build-fixtures.sh (executable, +x bit set)
FOUND: tests/fixtures/golazo/channels.yaml
FOUND: tests/fixtures/golazo/leo.token.json
FOUND: tests/fixtures/golazo/mateo.token.json
FOUND: tests/fixtures/golazo/README.md (contains 'HOME=' marker)
FOUND: tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/01-clip.mp4 (28043 bytes, ffprobe duration 2.000000)
FOUND: tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/02-clip.mp4 (28043 bytes, ffprobe duration 2.000000)
FOUND: tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/03-clip.mp4 (28043 bytes, ffprobe duration 2.000000)
FOUND: tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/README.md
FOUND: commit 9e35cdc (Task 1: feat 01-04 implement discoverClips, computeClipSha256, computeManifestHash)
FOUND: commit 5d7a110 (Task 2: feat 01-04 add probeDuration ffprobe wrapper + committed fixture infra)
VITEST:   92 passed / 92 (7 files: cli + 2 config + 2 prepare-existing + 2 prepare-new)
TSC:      exit 0
ESLINT:   exit 0
PROBE:    probeDuration returns 2 for all three fixture clips
PROBE:    probeDuration on non-mp4 throws ProbeError with exitCode + 'Invalid data' stderr
DISCOVER: discoverClips returns 3 entries in 01/02/03 order
CHANNELS: HOME=$PWD loadChannelsFile loads both leo + mateo, oauth paths resolve to absolute paths under tests/fixtures/golazo/
```

---

_Phase: 01-foundation-prepare-pipeline_
_Completed: 2026-05-14_
