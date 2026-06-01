---
phase: 05-web-scaffold-workspaces
plan: "04"
subsystem: web
tags: [next.js, fonts, next/font/local, theme-tokens, css-modules, typography, turbopack]

requires:
  - phase: 05-web-scaffold-workspaces
    plan: "02"
    provides: "web/ Next.js 16 scaffold; web/src/app/ placeholder; @/* path aliases"
  - phase: 05-web-scaffold-workspaces
    plan: "03"
    provides: "web/package.json dev/start scripts; web/instrumentation.ts; tsconfig.check.json exclude precedent"

provides:
  - "web/src/fonts.ts — next/font/local registrations for Cormorant Garamond Italic + Inter Regular/Bold; resolves SAME TTFs as Remotion (primary path: cross-workspace ../../remotion/assets/fonts/); fontVariables convenience export"
  - "web/src/theme/tokens.ts — COLORS/TYPOGRAPHY/SPACING as const; mirrors remotion/theme/tokens.ts for shared values; TYPOGRAPHY uses CSS vars not literal names"
  - "web/src/theme/index.ts — barrel re-export"
  - "web/src/theme/tokens.test.ts — 10-case vitest suite; all pass"
  - "web/src/app/layout.tsx — applies displayFont.variable + labelFont.variable to <html>; COLORS inline style on <body>"
  - "web/src/app/page.tsx — imports CSS Module; applies .heading/.body classNames; heading text preserved"
  - "web/src/app/page.module.css — .main/.heading/.body rules using var(--font-display)/var(--font-label)"
  - "UI-05 fully implemented: Cormorant Garamond Italic on headings + Inter on body, self-hosted via Turbopack"

affects:
  - phase-06-web-routes
  - phase-07-browse-surface
  - phase-08-player

tech-stack:
  added:
    - "next/font/local (Next.js built-in, no new dep)"
    - "CSS Modules (Next.js built-in, no new dep)"
  patterns:
    - "next/font/local with cross-workspace relative src path (../../remotion/assets/fonts/)"
    - "CSS custom properties (--font-display, --font-label) bridging next/font to CSS Modules"
    - "Font display strategy: block for display font, swap for label font (D-15)"
    - "Theme tokens mirror pattern (web mirrors remotion, no cross-tree import)"

key-files:
  created:
    - web/src/fonts.ts
    - web/src/theme/tokens.ts
    - web/src/theme/index.ts
    - web/src/theme/tokens.test.ts
    - web/src/app/page.module.css
  modified:
    - web/src/app/layout.tsx
    - web/src/app/page.tsx
    - web/src/theme/index.ts (barrel ext fix — see deviations)
    - tsconfig.check.json (exclude web/src/fonts.ts — see deviations)
    - web/next-env.d.ts (auto-updated by Next.js production build)

key-decisions:
  - "D-12 LOCKED: Font sharing = next/font/local with relative src traversing to remotion/assets/fonts/ (primary path); web/public/fonts/ fallback not needed"
  - "D-13 LOCKED: Web theme tokens MIRRORED not imported from remotion/theme/tokens.ts"
  - "D-14 LOCKED: CSS Modules for v2.0 styling"
  - "D-15 LOCKED: display font display:block, label font display:swap"

decisions:
  - "D-12: Turbopack accepted the cross-workspace relative path ../../remotion/assets/fonts/CormorantGaramond-Italic.ttf (from web/src/fonts.ts). Fonts are served from web/.next/static/media/ (confirmed in HTML preload link and production build output). Primary path works; fallback to web/public/fonts/ was not needed. UI-05's 'self-hosted under web/public/fonts/' wording is descriptive of the fallback intent — the primary path satisfies the 'served by this web process, not Google Fonts / external CDN' intent."
  - "D-13: Web theme tokens are mirrored (manually duplicated), not imported from remotion/theme/tokens.ts. Rationale: the two trees compile under different tsconfig contexts (Remotion: NodeNext + React; web: bundler + Next.js). Cross-tree imports add complexity for marginal benefit when the shared values are six color hex codes and three family strings. Drift detection lives in tokens.test.ts cases 1-5 (pins values to literals) and cases 9-10 (asserts font family name strings appear in fonts.ts source)."
  - "D-14: CSS Modules (not styled-jsx, Tailwind, or vanilla-extract). Rationale: Next.js default; zero new deps; co-located with components; Turbopack supports natively. Phase 7 may revisit if sophisticated solution becomes necessary."
  - "D-15: display: 'block' for display font (Cormorant Garamond Italic); display: 'swap' for label font (Inter). Rationale: headlines wait for the distinctive display font (flash of fallback serif is more disruptive than brief invisible slot); body text can flash from system-ui to Inter because legibility during the preload window matters more than typographic fidelity."

metrics:
  duration: "11m 12s"
  completed: "2026-06-01"
  tasks: 2
  files: 9
---

# Phase 05 Plan 04: Fonts + Theme Tokens Summary

**next/font/local wired to cross-workspace Remotion TTFs (primary path); web theme tokens mirror remotion/theme/tokens.ts for COLORS + TYPOGRAPHY + SPACING; 10-case unit suite green; placeholder home page visibly uses Cormorant Garamond Italic + Inter via CSS Modules; UI-05 complete**

## Performance

- **Duration:** 11 min 12 s
- **Started:** 2026-06-01T04:32:27Z
- **Completed:** 2026-06-01T04:43:39Z
- **Tasks:** 2 (Task 1: TDD RED-GREEN for tokens + fonts; Task 2: layout/page wiring + smoke)
- **Files created/modified:** 9

## Accomplishments

- Created `web/src/fonts.ts` with `displayFont` (Cormorant Garamond Italic, display:block) and `labelFont` (Inter 400+700, display:swap) via `next/font/local`; `fontVariables` convenience export; paths point to `../../remotion/assets/fonts/` TTFs (no duplication)
- Created `web/src/theme/tokens.ts` with `COLORS`, `TYPOGRAPHY`, `SPACING` as const; mirrors remotion/theme/tokens.ts for color subset; TYPOGRAPHY uses CSS variables (`var(--font-display)`, `var(--font-label)`) not literal family names
- Created `web/src/theme/index.ts` barrel export
- Created `web/src/theme/tokens.test.ts` with 10 cases — COLORS mirror (3), TYPOGRAPHY CSS vars (3), SPACING monotone/rem (2), font name detection via readFileSync (2) — all pass
- Updated `web/src/app/layout.tsx`: applies `displayFont.variable + labelFont.variable` to `<html>` className; `COLORS.background + COLORS.foreground` on `<body>` inline style via `@/fonts` and `@/theme` path aliases
- Updated `web/src/app/page.tsx`: imports `page.module.css`; applies `.main/.heading/.body` classNames; heading text preserved byte-for-byte (`golazo — web (placeholder)`)
- Created `web/src/app/page.module.css`: `.main` (flex column, 2.5rem padding), `.heading` (var(--font-display), italic, clamp font-size), `.body` (var(--font-label))
- Smoke verified: curl http://127.0.0.1:4173/ returns heading text + CSS Module class + `CormorantGaramond_Italic-s.p.*.ttf` preload link in HTML (Turbopack primary path works)
- Production build exits 0; fonts in `web/.next/static/media/`

## Font Resolution Outcome

**PRIMARY PATH SUCCEEDED.** Turbopack accepted the cross-workspace relative path `../../remotion/assets/fonts/CormorantGaramond-Italic.ttf` from `web/src/fonts.ts`. The dev server HTML confirms:

```
/_next/static/media/CormorantGaramond_Italic-s.p.0e46uaj7g.h5l.ttf
/_next/static/media/Inter_Bold-s.p.*.ttf
/_next/static/media/Inter_Regular-s.p.*.ttf
```

The fallback path (`web/public/fonts/` copies) was NOT needed. SHA-256 byte-equality holds trivially — Turbopack is reading the original TTFs from `remotion/assets/fonts/` (same source bytes as Remotion compositions).

## globals.css Status

Not required. `next/font/local` injects `@font-face` declarations via its own mechanism (injected into `<head>` as inline styles or separate stylesheet chunks). No `import './globals.css'` line is needed and none was added. The Plan 02 `layout.tsx` did not have it; this plan does not add it.

## Path Alias Status

`@/fonts` and `@/theme` path aliases (from `web/tsconfig.json` `paths: { "@/*": ["./src/*"] }` set in Plan 02) resolved correctly in both Turbopack dev and production build. No fallback to relative imports was needed.

## Task Commits

Each task committed atomically:

1. **Task 1 RED: 10-case tokens.test.ts** — `7734283` (test)
2. **Task 1 GREEN: theme tokens + fonts** — `04b458a` (feat)
3. **Task 2: layout/page wiring + CSS Module + smoke** — `0e72ae6` (feat)

## Files Created/Modified

| File | Action | Notes |
|------|--------|-------|
| `web/src/fonts.ts` | Created | displayFont + labelFont + fontVariables; next/font/local; primary cross-workspace path |
| `web/src/theme/tokens.ts` | Created | COLORS/TYPOGRAPHY/SPACING as const; remotion mirror |
| `web/src/theme/index.ts` | Created | Barrel: `export * from './tokens'` (no .js ext — see deviations) |
| `web/src/theme/tokens.test.ts` | Created | 10 vitest cases; all green |
| `web/src/app/layout.tsx` | Modified | Font variables + COLORS applied; @/fonts + @/theme imports |
| `web/src/app/page.tsx` | Modified | CSS Module import + classNames; heading text preserved |
| `web/src/app/page.module.css` | Created | .main .heading .body using CSS vars |
| `tsconfig.check.json` | Modified | Exclude web/src/fonts.ts (next/font/local not resolvable in NodeNext context) |
| `web/next-env.d.ts` | Modified | Auto-updated by Next.js production build (dev->production path) |

## Decisions Made

**D-12 LOCKED: Font sharing = next/font/local with cross-workspace relative src (primary path)**

Turbopack resolves `../../remotion/assets/fonts/CormorantGaramond-Italic.ttf` relative to `web/src/fonts.ts` at build time, traversing up to the repo root and into the shared assets directory. Confirmed working: fonts appear in `web/.next/static/media/` and HTML contains preload links. Alternatives rejected:
- Symlink `web/public/fonts/ -> remotion/assets/fonts/`: git checkout edge cases on some platforms
- Copy TTFs to `web/public/fonts/` as primary: byte-identical drift risk; two locations to synchronize
- Bare relative import with `?url` query: loses next/font's variable mechanism and preload optimization

**D-13 LOCKED: Web theme tokens MIRRORED (not imported from remotion/theme/tokens.ts)**

The two trees use different tsconfig contexts — Remotion uses NodeNext + React; web uses bundler + Next.js. Cross-tree imports would require tsconfig path mapping complexity for marginal benefit when the shared values are six color hex codes and three family strings. Drift detection is in `tokens.test.ts` cases 1-5 (literal value pins) and cases 9-10 (font family name detection via readFileSync).

**D-14 LOCKED: CSS Modules for v2.0 placeholder home page styling**

Zero new dependencies; Next.js native support; Turbopack handles them correctly. Phase 7 may adopt a more sophisticated solution (styled-jsx, vanilla-extract, etc.) when the browse surface UI complexity warrants it.

**D-15 LOCKED: display: 'block' for Cormorant Garamond Italic; display: 'swap' for Inter**

Headlines wait for the typographically-distinctive display font (an invisible slot is less disruptive than a brief flash of the wrong serif face). Body text uses fallback-first: legibility during the preload window matters more than typographic fidelity for the brief Inter load time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Barrel export `'./tokens.js'` rejected by Turbopack (bundler moduleResolution)**
- **Found during:** Task 2, dev server smoke test
- **Issue:** `web/src/theme/index.ts` initially used `export * from './tokens.js'`. Turbopack with `moduleResolution: bundler` does NOT accept `.js` extension on `.ts` source files — it threw `Module not found: Can't resolve './tokens.js'`. This is the same behavior observed in Plan 03 (deviation 1: `import('./src/lib/hostGuard.js')` rejected, fixed to no-extension)
- **Fix:** Changed barrel to `export * from './tokens'` (no extension)
- **Files modified:** `web/src/theme/index.ts`
- **Commit:** `0e72ae6`

**2. [Rule 3 - Blocking] `web/src/fonts.ts` not resolvable in root `tsconfig.check.json` (NodeNext context)**
- **Found during:** Task 1, root typecheck step
- **Issue:** Root `tsconfig.check.json` uses NodeNext moduleResolution (inherited from `tsconfig.json`) and includes `web/src/**/*`. `web/src/fonts.ts` imports from `next/font/local` which is not available in the NodeNext root context (no Next.js types installed at root). Emitted: `TS2307: Cannot find module 'next/font/local'`
- **Fix:** Added `"exclude": ["node_modules", "web/src/fonts.ts"]` to `tsconfig.check.json`. This follows the exact same precedent established in Plan 03 (deviation 4: `web/instrumentation.ts` excluded from root check for the same moduleResolution conflict reason)
- **Rationale:** `web/src/fonts.ts` is correctly typechecked by `cd web && npx tsc --noEmit` (web tsconfig uses bundler moduleResolution and has Next.js types via the `plugins: [{ "name": "next" }]` setup)
- **Files modified:** `tsconfig.check.json`
- **Commit:** `04b458a`

### Pre-existing Out-of-Scope Issue (deferred, not fixed)

**Root `tsconfig.check.json` emits errors for `src/*.test.ts` files** — errors in `src/cli/all.test.ts`, `src/publish/oauth.test.ts`, `src/publish/retry.test.ts`, `src/publish/runner.test.ts`. These pre-existed before this plan (confirmed by testing: the errors appear even with all Plan 04 files stashed). The `tsconfig.check.json`'s `include: ["src/**/*"]` pulls in test files despite the base `tsconfig.json`'s `exclude: ["**/*.test.ts"]` — this appears to be a TypeScript behavior where the extended `exclude` interacts unexpectedly with the child config's explicit `include`. Logged to `deferred-items.md` — out of scope for this plan.

## globals.css

Not required. `next/font/local` injects @font-face declarations without a global CSS file. Layout.tsx does not import `globals.css`. Confirmed by dev server and production build working without it.

## tsconfig.json Invariant Confirmation

`git diff tsconfig.json` shows **zero changes** — base TypeScript config is byte-identical to pre-plan state.

## bin Invariant Confirmation

`package.json#bin.golazo` is still `"./dist/cli/index.js"`. `npm run build` emits `dist/cli/index.js`; bin-existence check exits 0.

## Test Count Delta

- Root vitest suite: 403 (unchanged — root vitest.config.ts does NOT include web/)
- Web vitest suite: 30 total (3 workspace-import + 14 hostGuard unit + 3 host-binding integration + 10 tokens unit)
- Total across both workspaces: 433

## File-Disjoint Confirmation with Plan 03

Plan 03 files: `web/src/lib/hostGuard.ts`, `web/src/lib/hostGuard.test.ts`, `web/instrumentation.ts`, `web/tests/host-binding.integration.test.ts`, `web/package.json`, `web/tsconfig.json`.

Plan 04 files: `web/src/fonts.ts`, `web/src/theme/tokens.ts`, `web/src/theme/index.ts`, `web/src/theme/tokens.test.ts`, `web/src/app/layout.tsx`, `web/src/app/page.tsx`, `web/src/app/page.module.css`.

Zero overlap. Plans 03 and 04 are truly file-disjoint — confirmed at execution time.

## Known Stubs

None — the placeholder home page content (`golazo — web (placeholder)` heading, `Phase 5 scaffold. Episode list lands in Phase 7.` body) is intentional. The page is styled with Cormorant Garamond Italic and Inter (fonts are live, not stubbed). The STUB from Plan 02 (`web/src/app/page.tsx` unstyled placeholder) is now resolved — the page is visibly styled per UI-05.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. `web/src/fonts.ts` reads TTFs at build time via Turbopack (build-time asset processing, not runtime file access). No threat surface added.

## Self-Check: PASSED

- `web/src/fonts.ts`: FOUND; exports displayFont, labelFont, fontVariables; references CormorantGaramond-Italic.ttf + Inter-Regular.ttf + Inter-Bold.ttf via cross-workspace path
- `web/src/theme/tokens.ts`: FOUND; exports COLORS, TYPOGRAPHY, SPACING as const
- `web/src/theme/index.ts`: FOUND; `export * from './tokens'`
- `web/src/theme/tokens.test.ts`: FOUND; 10/10 pass
- `web/src/app/layout.tsx`: FOUND; displayFont.variable + labelFont.variable on `<html>`; COLORS inline style on `<body>`
- `web/src/app/page.tsx`: FOUND; CSS Module import; heading text preserved
- `web/src/app/page.module.css`: FOUND; var(--font-display) + var(--font-label) in rules
- Three TTF relative paths resolve to existing files: VERIFIED
- Commits 7734283, 04b458a, 0e72ae6: in git log
- `cd web && npx vitest run src/theme/tokens.test.ts` 10/10: PASS
- Root `npx vitest run` 403/403: PASS
- `cd web && npx tsc --noEmit`: exits 0
- `npm run build` (root): exits 0; bin intact
- `npm run web:build`: exits 0; fonts in web/.next/static/media/
- Dev server smoke: curl returns 200 with heading text + CSS Module class + CormorantGaramond preload link
- Turbopack PRIMARY PATH accepted cross-workspace relative TTF paths: CONFIRMED
- File-disjoint with Plan 03: CONFIRMED (zero overlap)
