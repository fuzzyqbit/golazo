---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Web UI
status: executing
stopped_at: Plan 05-03 complete; two-layer localhost defense (WEB-02 + WEB-03); 20 web tests + 403 root tests passing; ready for 05-04 fonts+theme
last_updated: "2026-06-01T05:47:11.782Z"
last_activity: 2026-06-01
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 8
  completed_plans: 5
  percent: 63
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-13)

**Core value:** Drop a folder of clips on disk, get a cinematic per-game highlight episode uploaded to the right YouTube channel — minimal hands-on time per game even at 5+ games/week.
**Current focus:** Phase 06 — Discovery + sqlite Cache + Watcher

## Current Position

Phase: 06 (Discovery + sqlite Cache + Watcher) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-06-01

## Performance Metrics

**Velocity:**

- Total plans completed: 4
- Average duration: 6 min 53 s (7 min + 8 min 27 s + 4 min 31 s + 7 min 34 s averaged = 27 min 32 s / 4)
- Total execution time: 0.46 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & Prepare Pipeline | 4 | 27 min 32 s | 6 min 53 s |
| 2. Render Pipeline | 1 | 6 min 6 s | 6 min 6 s |
| 3. Publish Pipeline | 0 | — | — |
| 4. Convenience & QA Polish | 0 | — | — |

**Recent Trend:**

- Last 5 plans: 01-02 (8 min 27 s), 01-03 (4 min 31 s), 01-04 (7 min 34 s), 01-05 (12 min 45 s), 02-01 (6 min 6 s)
- Trend: steady; 02-01 added 2 atomic commits (font assets + theme/tests) plus 1 auto-fixed deviation (vitest.config.ts include for remotion/)

*Updated after each plan completion*
| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| 01-foundation-prepare-pipeline P03 | 4min 31s | 2 tasks | 8 files |
| Phase 01-foundation-prepare-pipeline P04 | 7min 34s | 2 tasks | 14 files |
| Phase 01-foundation-prepare-pipeline P05 | 12min 45s | 3 tasks | 9 files |
| Phase 02-render-pipeline P01 | 6min 6s | 2 tasks | 14 files |
| Phase 02-render-pipeline P02 | 7min 13s | 3 tasks | 14 files |
| Phase 02-render-pipeline P03 | 9min 30s | 2 tasks | 17 files |
| Phase 02-render-pipeline P04 | 18min | 3 tasks | 13 files |
| Phase 03-publish-pipeline P02 | 4min | 1 tasks | 5 files |
| Phase 03-publish-pipeline P03 | 8min | 1 tasks | 5 files |
| Phase 03-publish-pipeline P04 | 5min 50s | 1 tasks | 5 files |
| Phase 03-publish-pipeline P05 | 12 | 3 tasks | 10 files |
| Phase 04 P01 | 9min 54s | 2 tasks | 5 files |
| Phase 04-convenience-qa-polish P02 | 6min 16s | 2 tasks | 4 files |
| Phase 04-convenience-qa-polish P03 | 4min | 2 tasks | 1 files |
| Phase 04-convenience-qa-polish P04 | 351s | 3 tasks | 9 files |
| Phase 05-web-scaffold-workspaces P01 | 9min | 1 tasks | 3 files |
| Phase 05-web-scaffold-workspaces P02 | 13min 10s | 2 tasks | 11 files |
| Phase 05 P04 | 672 | 2 tasks | 9 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: Remotion (over FFmpeg-only) chosen for typographic strength and programmatic composition
- Init: Filename convention encodes metadata (no sidecar) — single-operator workflow
- Init: Deterministic music pick seeded by `manifestHash` — byte-stable re-renders
- Init: Unlisted upload + manual public flip — reviewable approval gate
- 01-01: npm chosen over pnpm (pnpm not installed on this Mac); `packageManager: "npm@10.9.0"` pinned in package.json
- 01-01: Migrated from plan-spec'd `.eslintrc.cjs` to flat `eslint.config.js` — ESLint 10 dropped legacy config support
- 01-01: Stub contract for unimplemented subcommands is `cmd.error('<name>: not yet implemented', { exitCode: 2, code: '<name>.unimplemented' })` — downstream plans must preserve until their phases land
- 01-01: Smoke test asserts `prepare` registration only (action handler is a function) — Plan 05 swap of `runPrepare` requires no test changes
- 01-02: ChannelsConfigError single-line message format `channels.yaml: <field>: <reason>. <remediation>` is a stable contract — Plan 05 CLI handler will display it verbatim
- 01-02: Channels file schema is `z.record(z.string().min(1), entry)` — any kid key accepted at parse time; unknown-kid check moved to `loadChannel` lookup time so adding a third kid is yaml-only
- 01-02: Extracted `CHANNELS_TEST_CASES` to `*.test-cases.ts` sibling (excluded from `dist/` via tsconfig) so the named-const row-count gate is importable by non-vitest tooling
- 01-02: Tilde expansion (`~/` against `os.homedir()`) is the only path transformation in the loader; relative paths resolve against the channels.yaml parent dir
- 01-02: `noUncheckedIndexedAccess: true` is load-bearing — config loader uses `if (!entry) continue` guards even on zod-validated record outputs to satisfy strict mode
- 01-03: Date validity via Date round-trip (no date library) — catches month 13, Feb 30; chosen over date-fns/dayjs to keep zero-dep
- 01-03: FilenameError message tail `Expected format: YYYY-MM-DD_vs_<slug>_<for>-<against>` is a stable contract — asserted by every malformed-case test
- 01-03: KidPathError message tail `Expected layout: ~/golazo/<kid>/<game-folder>/` is the analogous stable contract for path-layout failures
- 01-03: `resolveKidFromPath` reuses `UnknownKidError` from `src/config/errors.js` (Plan 02) — does NOT redefine; test asserts via instanceof on the canonical import
- 01-03: `'golazo'` as final segment → `KidPathError`; `'golazo'` followed only by game folder → `UnknownKidError` (game-folder name offered as candidate kid). Distinct error vocabularies
- 01-03: Reaffirmed `*.test-cases.ts` sibling pattern from Plan 02 — vitest test files cannot be imported under `tsx -e` because `describe()` crashes outside the runner
- 01-04: manifestHash canonical input is `folderName + '\n' + sorted "file:sha256" lines` — pinned by independent recomputation test (DO NOT mutate in Phase 2)
- 01-04: manifest schema additively includes per-clip `sha256` field (deviation from design spec example) — required for manifestHash reproducibility from manifest contents alone
- 01-04: `probeDuration` rounds to 3 decimals (`Math.round(d*1000)/1000`) for JSON-stable manifest values across re-probes
- 01-04: ffprobe wrapper uses `promisify(execFile)` — reusable for Phase 2 Remotion CLI invocation; string error codes (ENOENT) coerce to exitCode `-1`
- 01-04: fixture `HOME="$PWD"` convention codified — tilde-pathed `oauth_token` paths in `tests/fixtures/golazo/channels.yaml` require HOME stub (vitest: `vi.stubEnv('HOME', process.cwd())`, manual: `HOME="$PWD" npx tsx ...`)
- 01-04: committed fixture clips (libx264 ultrafast 320x180@15fps yuv420p, ~28KB each) are canonical bytes; regen via `scripts/build-fixtures.sh` may flap due to libx264 threading nondeterminism
- [Phase ?]: 01-05: manifestHash at TOP LEVEL of manifest (not nested in render) - load-bearing contract for Phase 1 idempotency; Phase 2 adds sibling render block, must not relocate
- [Phase ?]: 01-05: resolveKidFromPath uses lastIndexOf('golazo') instead of indexOf so paths with multiple golazo segments resolve to the innermost game-folder triple (Rule 1 fix in Plan 03 module)
- [Phase ?]: 01-05: CLI handler output strings frozen as contract - first-run/hash-match/hash-changed/force lines preserved across Phase 2/3 plans
- [Phase ?]: 01-05: case 4 CHANGED CONTENT uses appendFileSync not cpSync(03,02) - 3 committed fixture clips are byte-identical; appendFileSync preserves mp4 MOOV atom so probeDuration succeeds AND sha256 changes, exercising the hash-changed branch distinctly from case 6's ProbeError path
- [Phase ?]: 01-05: runPrepare step order pins probe+hash BEFORE the existing-manifest hash compare so corrupt clips short-circuit to ProbeError, never reaching the hash-changed branch
- [Phase ?]: 01-05: CLI shell-out integration tests via promisify(execFile)('npx', ['tsx', 'src/cli/index.ts', ...]) + HOME forwarded in spawn env - no pnpm build dependency; reusable pattern for Phase 2/3/4
- 02-01: @remotion/fonts v4.0.461 uses loadFont() (single face per call) — not a plural loadFonts(); three calls in Promise.all() for Cormorant Garamond Italic + Inter Regular + Inter Bold
- 02-01: Font URL resolution via new URL('../assets/fonts/<file>', import.meta.url).href — staticFile() only resolves public/ in Remotion; import.meta.url resolved by Remotion's webpack bundler at bundle time
- 02-01: getCinematicGradeStyle() filter: 'saturate(1.12) contrast(1.05) brightness(0.96)' — PINNED; Plans 03+04 must not change silently
- 02-01: tsconfig.check.json extends base without mutating it; npm run typecheck covers src/ + remotion/ via --noEmit; base tsconfig.json rootDir:./src + outDir:./dist + include:["src/**/*"] UNCHANGED
- 02-01: vitest.config.ts extended to include remotion/**/*.test.ts (Rule 3 auto-fix — runner was not covering remotion/ test files)
- [Phase ?]: seed = sha256(manifestHash+':roll:'+r).slice(0,16)
- [Phase ?]: manifest.music is a sibling of manifestHash, not in computeManifestHash input
- [Phase ?]: deterministic longest-track selection when no track is long enough; pinned by picker test case 5
- 02-03: Math.ceil frame conversion + first-clip doubling for slo-mo (0.5x playbackRate) — pinned by timing.test.ts
- 02-03: musicVolumeAtFrame step-function in musicVolume.ts (pure, no React/Remotion) — Episode.tsx imports, never redefines inline (Finding-3 fix)
- 02-03: webpack extensionAlias .js->[.ts,.tsx,.js] in remotion.config.ts — NodeNext .js imports compatibility with Remotion webpack bundler
- 02-03: Music volume boundary ramp deferred — step-function ships; fps parameter reserved in musicVolumeAtFrame signature for future ramp
- 02-04: Remotion headless renderer requires HTTP URLs — local file server on port 0 (127.0.0.1) serves clips/music during render; file:// URLs unsupported by Node http.get() in headless Chrome
- 02-04: render block is TOP-LEVEL sibling of manifestHash (not parent); PREP-07 hash invariant preserved end-to-end; case 21 + driver case 7 assert this
- 02-04: hash-changed detection when episode.mp4 exists but manifest.render absent — existsSync(episodePath) check distinguishes first-render from hash-changed after runPrepare re-run
- 02-04: CLI output strings frozen for Phase 3 chain parsing: episode rendered / render up to date / episode re-rendered (content changed) / episode re-rendered (force)
- 02-04: prettyOpponent at src/render/opponentPretty.ts — Phase 3 PUB-03 imports same helper; may move to src/shared/ in Phase 3
- 03-03: PRIVACY_STATUS = 'unlisted' as const in uploader.ts — single source of truth for unlisted-only constraint across all pipeline layers
- 03-04: publishWithRetry [1000, 4000, 16000]ms backoff; QuotaExceededError immediate fail + resumeAtHint (next UTC midnight); classifyError pure classifier
- 03-05: z.literal('unlisted') + const _binding = 'unlisted' satisfies typeof PRIVACY_STATUS — dual schema+typecheck privacy gate; publish.json written only on publishWithRetry success (PUB-06)
- 03-05: in-process nock (block 1) + shell-out spawn (block 2) split — nock does not cross process boundary; in-process covers quota/force/idempotency cases
- [Phase ?]: 04-02: coverage.all omitted (default false) — only imported-during-test files counted; Remotion exclusion consistent with design spec stance
- [Phase ?]: 04-02: src/**/types.ts excluded from coverage — interface-only modules have no executable logic
- [Phase ?]: 04-02: all.integration.test.ts test 5 timeout 120_000→240_000ms — two Remotion renders under coverage instrumentation exceed 120 s
- [Phase ?]: 04-03: Gap-close loop is a no-op — baseline 86.72% lines already exceeds 80% threshold; Task 2 produced zero fill-in tests
- [Phase ?]: 04-03: QA-01 audit asserts file existence + minimums: filename 20/8, channels 16/6, templates 10/6, musicPicker 11/5 — all green
- 04-04: EPISODE_TITLECARD_FRAME=30 — MOTION.titleCardFrames=90>=60; first-third of 90-frame title-card window; named constant in _helpers.ts
- 04-04: pixelmatch@7.2.0+pngjs@7.0.0 as devDeps; fixed inputProps (Leo/FC Eagles/#10/#ffce5a/2026-05-13 vs united 3-1 W) decoupled from fixture manifests so fixture rebuilds do not invalidate baselines
- 04-04: PUB-05 option-a accepted — multipart+3-retry-from-zero adequate for v1 ~50-200MB episodes on home/club network; resumable session refactor deferred to v2
- [Phase ?]: Plan 05-01 workspace rename
- [Phase ?]: Plan 05-01 workspace layout
- [Phase ?]: Plan 05-01 no exports map
- [Phase ?]: Plan 05-01 npm workspaces behavior
- 05-02: D-04 LOCKED: web/tsconfig.json uses moduleResolution:bundler — Next.js App Router + Turbopack require bundler; NodeNext forces .js extensions incompatible with Next.js conventions
- 05-02: D-05 LOCKED: dev port 4173 — avoids Next.js default 3000; signals preview (Vite convention); fixed value
- 05-02: D-06 LOCKED: @golazo/cli imports via dist/... subpath, no exports map — deferred to v2.1
- 05-02: D-07 LOCKED: cross-workspace smoke in web/tests/workspace-import.test.ts — belongs to web package, runs under web tsconfig
- 05-02: D-08 LOCKED: @golazo/cli referenced as file:.. in web/package.json — npm 10.9.4 does not resolve workspace-host via * wildcard from workspace members; file:.. is the correct npm idiom
- 05-03: D-08 LOCKED: Two-layer localhost enforcement (CLI HOST=127.0.0.1 + -H 127.0.0.1 in scripts; instrumentation register guard)
- 05-03: D-09 LOCKED: register() guards Node.js runtime only (NEXT_RUNTIME guard) — Edge runtime skipped
- 05-03: D-10 LOCKED: WEB-03 token pinned in error message; integration test enforces it
- 05-03: D-11 LOCKED: unit (hostGuard.test.ts) + integration (host-binding.integration.test.ts) test split
- 05-03: D-11b LOCKED: Scenario C integration test pins composed HOST=0.0.0.0 npm run dev path; script HOST=127.0.0.1 prefix wins

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-01T05:47:11.777Z
Stopped at: Plan 05-03 complete; two-layer localhost defense (WEB-02 + WEB-03); 20 web tests + 403 root tests passing; ready for 05-04 fonts+theme
Resume file: None
