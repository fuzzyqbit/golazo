# Roadmap: golazo

## Overview

golazo is a local-Mac CLI that transforms folders of soccer highlight clips into branded, per-game YouTube episodes for two kids' channels. v2.0 adds a localhost web UI for browsing and playing rendered episodes — read-only surface over the v1.0 filesystem-authoritative storage.

## Shipped Milestones

- ✅ **v1.0 — MVP CLI** (shipped 2026-05-19): 4 phases · 18 plans · 387 tests · 86.72% line coverage · 28/28 v1 requirements (1 override on PUB-05 multipart). See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) and [milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md).
- ✅ **v2.0 — Web UI** (shipped 2026-06-02): 4 phases · 16 plans · 609 tests · 95% web line coverage · 22/22 v2.0 requirements (1 override on WEB-QA-03 live run). See [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md) and [milestones/v2.0-REQUIREMENTS.md](milestones/v2.0-REQUIREMENTS.md).

## Active Milestone

*(none — start next milestone with `/gsd-new-milestone`)*

## v2.1+ Backlog

**v2.0 close carry-forwards:**
- **WEB-E2E-LIVE-RUN** — Operator-side `npx playwright install chromium && npm run web:e2e` smoke before any unlisted→public flip on YouTube
- **WEB-VISUAL-REGRESSION** — Pixelmatch snapshots of `/` + `/episodes/<hash>` to catch typographic drift
- **WEB-E2E-CROSS-BROWSER** — Firefox + Webkit Playwright projects (currently Chromium-only)
- **WEB-TRIGGER** — Trigger render/publish from browser with real-time progress
- **WEB-EDIT** — Override title/description/score before publish
- **WEB-LAN** — LAN-accessible mode with shared-token auth for phone/iPad

**v1.0 carry-forwards (still open after v2.0):**
- **v1.0-typecheck-debt** — Fix 7 pre-existing tsc errors in src/cli/all.test.ts + src/publish/oauth.test.ts + retry.test.ts + runner.test.ts
- **PUB-05-resumable** — Replace googleapis SDK with raw HTTP resumable upload session protocol
- **OAuth-DI** — Replace `GOLAZO_OAUTH_MOCK=1` env-var branch in `exchangeCode` with injectable factory pattern
- **QA-03-extended** — Commit 6+-clip fixture + integration render for visual chapter-rhythm regression coverage

---
*Roadmap created: 2026-05-13 by gsd-roadmapper*
*v1.0 shipped: 2026-05-19 — see milestones/v1.0-ROADMAP.md for full history*
*v2.0 shipped: 2026-06-02 — see milestones/v2.0-ROADMAP.md for full history*
