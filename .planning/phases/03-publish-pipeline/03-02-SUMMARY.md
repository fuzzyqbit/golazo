---
phase: 03-publish-pipeline
plan: "02"
subsystem: publish/templates
tags: [templates, youtube, title, description, prettyOpponent, zod, tdd]
dependency_graph:
  requires:
    - 02-04: prettyOpponent helper at src/render/opponentPretty.ts (PUB-03 reuse)
    - 03-01: OAuthError + src/publish/errors.ts + src/publish/index.ts barrel
    - 01-03: parseFilename + manifest game fields (date, opponent, scoreFor, scoreAgainst, result)
    - 01-02: ChannelConfig shape (name, club, jersey, source, youtube)
  provides:
    - src/publish/templates.ts: pure renderTitle + renderDescription + renderTemplates functions
    - src/publish/templates.test-cases.ts: TEMPLATE_TEST_CASES (10 table-driven cases)
    - src/publish/errors.ts: TemplateError (2nd error class, additive on Plan 03-01's file)
    - src/publish/index.ts: barrel extended with template surface
  affects:
    - 03-03: uploader builds videos.insert body using renderTemplates output
    - 03-05: runPublish orchestrator calls renderTemplates({ kid: channelConfig, game: manifest.game })
tech_stack:
  added: []
  patterns:
    - "Pure template renderer: validateInput (zod safeParse) → prettyOpponent → string interpolation"
    - "TemplateError message format: 'template: <field>: <reason>. <remediation>' (mirrors OAuthError/ManifestError/RenderError)"
    - "*.test-cases.ts sibling pattern continued from channels.test-cases.ts + filename.test-cases.ts"
    - "TDD RED/GREEN: test commit first (212b1af), then implementation commit (84e48d3)"
key_files:
  created:
    - src/publish/templates.ts
    - src/publish/templates.test.ts
    - src/publish/templates.test-cases.ts
  modified:
    - src/publish/errors.ts (TemplateError appended after OAuthError)
    - src/publish/index.ts (template surface re-exported)
key_decisions:
  - "prettyOpponent IMPORTED from src/render/opponentPretty.ts — NOT redefined. PUB-03 contract closed. No move to src/shared/ needed; import path is clean."
  - "Title uses U+00B7 MIDDLE DOT (·) as section separator and U+2013 EN DASH (–) between scores — NOT ASCII period or hyphen-minus. Pinned by test cases 11+12."
  - "Description uses LF-only line endings (not CRLF). Five-line block. Pinned by test case 13."
  - "validateInput called per-renderer (not just in renderTemplates wrapper) so each function is defensively self-contained even when called standalone."
  - "Title length: case 14 confirms realistic combinations fit under YouTube's 100-char limit. Truncation policy deferred to Plan 03-03."
  - "TemplateInput.jersey schema is z.number().int().min(1).max(99) — matches ChannelConfig jersey constraint exactly."
patterns_established:
  - "Opponent slug is passed as the raw folder-name slug to renderTitle/renderDescription; pretty-printing is applied INSIDE the renderer (not by the caller)."
  - "renderTemplates is the Plan 03-05 entry point; individual renderTitle/renderDescription are available for callers needing only one output."
requirements_completed: [PUB-02, PUB-03]
duration: 4min
completed: "2026-05-14"
---

# Phase 03 Plan 02: Template Renderers — Summary

**Pure renderTitle + renderDescription + renderTemplates with all 9 substitutions, TemplateError class, and 19-case TDD test suite reusing prettyOpponent from Plan 02-04.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-14T18:21:18Z
- **Completed:** 2026-05-14T18:25:17Z
- **Tasks:** 1 (TDD: 2 commits — RED + GREEN)
- **Files modified:** 5

## Accomplishments

- All 9 template substitutions implemented: {Kid}, {Opponent}, {scoreFor}, {scoreAgainst}, {result}, {date}, {jersey}, {club}, {source}
- `prettyOpponent` reused from `src/render/opponentPretty.ts` — PUB-03 closed with no duplication; Phase 2 SUMMARY marker ("Phase 3 PUB-03 imports the same helper") fulfilled
- `TemplateError` added as the 2nd error class in `src/publish/errors.ts`, following the same `"template: <field>: <reason>. <remediation>"` convention as `OAuthError`
- Defensive zod schema validates input at runtime; throws `TemplateError` with precise field + reason for any shape violation
- 27 total tests pass (19 template + 8 error); full suite grows to 267 (23 files)

## Frozen Template Strings

**Title template:**
```
{Kid} · vs {Opponent} · {scoreFor}–{scoreAgainst} {result} · {date}
```
- Section separator: U+00B7 MIDDLE DOT (·) — NOT ASCII period
- Score separator: U+2013 EN DASH (–) — NOT ASCII hyphen-minus

**Description template (LF line endings, no CRLF):**
```
Match Day · {date}
{Kid} (#{jersey}, {club}) vs {Opponent}
Final: {scoreFor}–{scoreAgainst}

Filmed via {source}. Edited with golazo.
```

## TemplateInput → Plans 03-03 + 03-05 Mapping

```typescript
renderTemplates({
  kid: {
    name:   channelConfig.name,     // ChannelConfig.name
    club:   channelConfig.club,     // ChannelConfig.club
    jersey: channelConfig.jersey,   // ChannelConfig.jersey
    source: channelConfig.source,   // ChannelConfig.source
  },
  game: {
    date:         manifest.game.date,
    opponent:     manifest.game.opponent,    // RAW slug — prettyOpponent applied inside
    scoreFor:     manifest.game.scoreFor,
    scoreAgainst: manifest.game.scoreAgainst,
    result:       manifest.game.result,
  },
});
```

## Task Commits

1. **Task 1 RED — Failing tests** - `212b1af` (test)
   - errors.test.ts extended with TemplateError cases 5-8
   - templates.test-cases.ts created with 10 table-driven cases
   - templates.test.ts created with 19 total cases
2. **Task 1 GREEN — Implementation** - `84e48d3` (feat)
   - src/publish/errors.ts extended with TemplateError
   - src/publish/templates.ts created (renderers + validation)
   - src/publish/index.ts extended with template barrel exports

**Plan metadata:** committed in final docs commit

## Files Created/Modified

- `src/publish/templates.ts` — Pure renderers; imports prettyOpponent; TemplateInput/TemplateOutput interfaces; TITLE_TEMPLATE + DESCRIPTION_TEMPLATE constants; defensive zod schema
- `src/publish/templates.test-cases.ts` — TEMPLATE_TEST_CASES (10 cases, *.test-cases.ts pattern)
- `src/publish/templates.test.ts` — 19 test cases: 10 table-driven + character sanity + line endings + length sanity + purity + row-count gate + 3 defensive shape tests
- `src/publish/errors.ts` — TemplateError appended (2 error classes total: OAuthError + TemplateError)
- `src/publish/index.ts` — Barrel extended with template surface exports

## Decisions Made

- `prettyOpponent` IMPORTED, NOT redefined. Both grep gates GREEN: `import.*prettyOpponent.*from '../render/opponentPretty'` matches; `function prettyOpponent` does not appear in templates.ts.
- Title character pinning: U+00B7 and U+2013 written as string literals, tested by cases 11+12, and confirmed by node smoke test.
- `validateInput` called inside each renderer independently — callers of `renderTitle` or `renderDescription` standalone get the same defensive check as callers of `renderTemplates`.
- Title length: case 14 informational assertion; no truncation added. Plan 03-03 retains the truncation policy decision.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all exported functions are fully implemented.

## Threat Flags

None — templates are pure functions over already-validated inputs; no new trust boundary crosses.

(T-03-09 mitigated: prettyOpponent only lowercases + splits on hyphens + title-cases; no injection vector. T-03-10 mitigated: case 14 length assertion confirms realistic combinations fit under 100 chars.)

## Self-Check: PASSED

Files verified to exist:
- /Users/me/Documents/code/golazo/src/publish/templates.ts — FOUND
- /Users/me/Documents/code/golazo/src/publish/templates.test-cases.ts — FOUND
- /Users/me/Documents/code/golazo/src/publish/templates.test.ts — FOUND
- /Users/me/Documents/code/golazo/src/publish/errors.ts (TemplateError added) — FOUND
- /Users/me/Documents/code/golazo/src/publish/index.ts (template exports added) — FOUND

Commits verified:
- 212b1af: test(03-02): add failing tests for template renderers + TemplateError
- 84e48d3: feat(03-02): implement template renderers + TemplateError + barrel extension

Test results: 267/267 passing (23 test files)

## Next Phase Readiness

- Plans 03-03 (uploader) and 03-05 (orchestrator) can import `renderTemplates` from `'../publish/index.js'`
- `TemplateInput` interface and mapping documented above for Plan 03-05's orchestrator
- No blockers; no concerns
